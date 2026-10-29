import { randomUUID } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb'
import { TAKEN_MESSAGE, bookingError, detailsError, findClash } from '../../../src/bookingRules.js'
import { addDays } from '../../../src/scheduling.js'
import { decodeBusiness } from '../../../src/shareLink.js'

// Booking works like this: every booked time on one date sits in one
// BookingDay record with a version number. To book, we read those records,
// make sure nothing overlaps, then save the new booking and the updated
// records together, only if no one changed them in the meantime. If someone
// did, we read again and re-check, so two customers can never get the
// same time.

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const BUSINESS_TABLE = process.env.BUSINESS_TABLE
const BOOKING_TABLE = process.env.BOOKING_TABLE
const BOOKING_DAY_TABLE = process.env.BOOKING_DAY_TABLE
const MAX_TRIES = 5

type Slot = { date: string; start: string; end: string }
type Taken = Slot & { bookingId: string }
type Day = { date: string; slots: Taken[]; version: number | null }
type Result = { ok: boolean; message: string }

// What Amplify sends for a custom query or mutation.
type Event = {
  fieldName: string
  arguments: Record<string, unknown>
  identity?: { sub?: string; username?: string } | null
}

function fail(message: string): Result {
  return { ok: false, message }
}

function parse(json: unknown): unknown {
  try {
    return typeof json === 'string' ? JSON.parse(json) : null
  } catch {
    return null
  }
}

// Server time is UTC, which can be a day ahead of the business; allow it.
function yesterday() {
  return addDays(new Date().toISOString().slice(0, 10), -1)
}

function readDay(item: Record<string, any>): Day {
  return {
    date: item.date,
    slots: (parse(item.slots) as Taken[] | null) ?? [],
    version: item.version,
  }
}

async function loadDays(businessId: string, dates: string[]): Promise<Day[]> {
  return Promise.all(
    dates.map(async (date) => {
      const { Item } = await db.send(
        new GetCommand({ TableName: BOOKING_DAY_TABLE, Key: { businessId, date }, ConsistentRead: true }),
      )
      return Item ? readDay(Item) : { date, slots: [], version: null }
    }),
  )
}

// Saves a day's new list of times, but only if it hasn't changed since we
// read it (or still doesn't exist, for a new day).
function saveDay(businessId: string, owner: string, day: Day, slots: Taken[], now: string) {
  return {
    Put: {
      TableName: BOOKING_DAY_TABLE,
      Item: {
        __typename: 'BookingDay',
        businessId,
        date: day.date,
        slots: JSON.stringify(slots),
        version: (day.version ?? 0) + 1,
        owner,
        createdAt: now,
        updatedAt: now,
      },
      ...(day.version === null
        ? { ConditionExpression: 'attribute_not_exists(businessId)' }
        : {
            ConditionExpression: 'version = :version',
            ExpressionAttributeValues: { ':version': day.version },
          }),
    },
  }
}

// Someone else changed a day between our read and our save.
function isConflict(error: unknown) {
  return error instanceof Error && error.name === 'TransactionCanceledException'
}

async function busyTimes(businessId: string): Promise<Slot[]> {
  const times: Slot[] = []
  let startKey: Record<string, any> | undefined
  do {
    const page = await db.send(
      new QueryCommand({
        TableName: BOOKING_DAY_TABLE,
        KeyConditionExpression: 'businessId = :businessId AND #date >= :from',
        ExpressionAttributeNames: { '#date': 'date' },
        ExpressionAttributeValues: { ':businessId': businessId, ':from': yesterday() },
        ExclusiveStartKey: startKey,
      }),
    )
    for (const item of page.Items ?? []) {
      // Only when, never who.
      for (const { date, start, end } of readDay(item).slots) times.push({ date, start, end })
    }
    startKey = page.LastEvaluatedKey
  } while (startKey)
  return times
}

async function book(args: Record<string, unknown>): Promise<Result> {
  const businessId = String(args.businessId)
  const { Item: business } = await db.send(
    new GetCommand({ TableName: BUSINESS_TABLE, Key: { id: businessId } }),
  )
  const settings = business && decodeBusiness(business.config)
  if (!business || !settings) return fail("This business couldn't be found.")

  const slots = parse(args.slots) as Slot[] | null
  const service = String(args.service)
  const details = {
    name: String(args.name ?? '').trim(),
    contact: String(args.contact ?? '').trim(),
    comments: typeof args.comments === 'string' ? args.comments.trim() : null,
  }
  const problem =
    detailsError(details) || bookingError(settings, service, slots, { earliestDate: yesterday() })
  if (problem || !slots) return fail(problem)

  const bookingId = randomUUID()
  const dates = [...new Set(slots.map((slot) => slot.date))]
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const days = await loadDays(businessId, dates)
    if (findClash(slots, days.flatMap((day) => day.slots))) return fail(TAKEN_MESSAGE)

    const now = new Date().toISOString()
    try {
      await db.send(
        new TransactWriteCommand({
          TransactItems: [
            ...days.map((day) =>
              saveDay(
                businessId,
                business.owner,
                day,
                [
                  ...day.slots,
                  ...slots
                    .filter((slot) => slot.date === day.date)
                    .map(({ date, start, end }) => ({ date, start, end, bookingId })),
                ],
                now,
              ),
            ),
            {
              Put: {
                TableName: BOOKING_TABLE,
                Item: {
                  __typename: 'Booking',
                  id: bookingId,
                  businessId,
                  service,
                  slots: JSON.stringify(slots.map(({ date, start, end }) => ({ date, start, end }))),
                  name: details.name,
                  contact: details.contact,
                  ...(details.comments && { comments: details.comments }),
                  owner: business.owner,
                  createdAt: now,
                  updatedAt: now,
                },
              },
            },
          ],
        }),
      )
      return { ok: true, message: '' }
    } catch (error) {
      if (!isConflict(error)) throw error
    }
  }
  return fail(TAKEN_MESSAGE)
}

// Owner fields look like "<sub>::<username>".
function ownedBy(owner: unknown, identity: Event['identity']) {
  if (typeof owner !== 'string' || !identity?.sub) return false
  return owner === identity.sub || owner.split('::')[0] === identity.sub
}

async function cancelBooking(id: string, identity: Event['identity']): Promise<Result> {
  const { Item: booking } = await db.send(new GetCommand({ TableName: BOOKING_TABLE, Key: { id } }))
  if (!booking || !ownedBy(booking.owner, identity)) return fail("That booking couldn't be found.")

  const slots = (parse(booking.slots) as Slot[] | null) ?? []
  const dates = [...new Set(slots.map((slot) => slot.date))]
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const days = (await loadDays(booking.businessId, dates)).filter((day) => day.version !== null)
    const now = new Date().toISOString()
    try {
      if (days.length === 0) {
        await db.send(new DeleteCommand({ TableName: BOOKING_TABLE, Key: { id } }))
      } else {
        await db.send(
          new TransactWriteCommand({
            TransactItems: [
              ...days.map((day) =>
                saveDay(
                  booking.businessId,
                  booking.owner,
                  day,
                  day.slots.filter((slot) => slot.bookingId !== id),
                  now,
                ),
              ),
              { Delete: { TableName: BOOKING_TABLE, Key: { id } } },
            ],
          }),
        )
      }
      return { ok: true, message: '' }
    } catch (error) {
      if (!isConflict(error)) throw error
    }
  }
  return fail('Please try again in a moment.')
}

export const handler = async (event: Event) => {
  switch (event.fieldName) {
    case 'busyTimes':
      return busyTimes(String(event.arguments.businessId))
    case 'book':
      return book(event.arguments)
    case 'cancelBooking':
      return cancelBooking(String(event.arguments.id), event.identity)
    default:
      throw new Error(`Unknown operation: ${event.fieldName}`)
  }
}

