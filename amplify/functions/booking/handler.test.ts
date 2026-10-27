// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeBusiness } from '../../../src/shareLink.js'

// The booking function against a pretend database that behaves like
// DynamoDB for the calls it makes, including all-or-nothing transactions.

vi.hoisted(() => {
  process.env.BUSINESS_TABLE = 'Business'
  process.env.BOOKING_TABLE = 'Booking'
  process.env.BOOKING_DAY_TABLE = 'BookingDay'
})

type Item = Record<string, any>
const tables: Record<string, Map<string, Item>> = {}
const keyFields: Record<string, string[]> = {
  Business: ['id'],
  Booking: ['id'],
  BookingDay: ['businessId', 'date'],
}

function keyOf(table: string, item: Item) {
  return JSON.stringify(keyFields[table].map((field) => item[field]))
}

function passes(table: string, put: Item) {
  const existing = tables[table].get(keyOf(table, put.Item ?? put.Key))
  if (!put.ConditionExpression) return true
  if (put.ConditionExpression.startsWith('attribute_not_exists')) return !existing
  if (put.ConditionExpression === 'version = :version') {
    return existing?.version === put.ExpressionAttributeValues[':version']
  }
  throw new Error(`Unsupported condition ${put.ConditionExpression}`)
}

async function send(command: { constructor: { name: string }; input: Item }) {
  // Let other requests run in between, like a real network call.
  await new Promise((resolve) => setTimeout(resolve, 0))
  const input = command.input
  switch (command.constructor.name) {
    case 'GetCommand': {
      const item = tables[input.TableName].get(keyOf(input.TableName, input.Key))
      return { Item: item && structuredClone(item) }
    }
    case 'QueryCommand': {
      const { ':businessId': businessId, ':from': from } = input.ExpressionAttributeValues
      const items = [...tables[input.TableName].values()].filter(
        (item) => item.businessId === businessId && item.date >= from,
      )
      return { Items: structuredClone(items) }
    }
    case 'DeleteCommand':
      tables[input.TableName].delete(keyOf(input.TableName, input.Key))
      return {}
    case 'TransactWriteCommand': {
      const writes = input.TransactItems.map((write: Item) => write.Put ?? write.Delete)
      if (!writes.every((write: Item) => passes(write.TableName, write))) {
        const error = new Error('Transaction cancelled')
        error.name = 'TransactionCanceledException'
        throw error
      }
      input.TransactItems.forEach((write: Item) => {
        if (write.Put) {
          tables[write.Put.TableName].set(keyOf(write.Put.TableName, write.Put.Item), write.Put.Item)
        } else {
          tables[write.Delete.TableName].delete(keyOf(write.Delete.TableName, write.Delete.Key))
        }
      })
      return {}
    }
    default:
      throw new Error(`Unsupported command ${command.constructor.name}`)
  }
}

vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const original = await importOriginal<typeof import('@aws-sdk/lib-dynamodb')>()
  return {
    ...original,
    DynamoDBDocumentClient: { from: () => ({ send }) },
  }
})

const { handler } = await import('./handler')

const OWNER = 'owner-sub::owner-sub'

function call(fieldName: string, args: Item, identity: Item | null = null) {
  return handler({ info: { fieldName }, arguments: args, identity })
}

function bookAppointment(start: string, end: string, name = 'Sam') {
  return call('book', {
    businessId: 'biz',
    service: 'Appointment',
    slots: JSON.stringify([{ date: '2026-10-26', start, end }]),
    name,
    contact: 'sam@example.com',
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
  for (const name of Object.keys(keyFields)) tables[name] = new Map()
  tables.Business.set(keyOf('Business', { id: 'biz' }), {
    id: 'biz',
    owner: OWNER,
    config: encodeBusiness({
      name: 'Kairo',
      appointmentMinutes: 30,
      offerHandoffs: true,
      handoffsTogether: true,
      turnaroundMinutes: 180,
      hours: [{ day: 'Monday', start: '09:00', end: '17:00', breaks: [] }],
    }),
  })
})

describe('booking function', () => {
  it('books a free time and reports it as taken, without who took it', async () => {
    expect(await bookAppointment('09:00', '09:30')).toEqual({ ok: true, message: '' })

    const [booking] = tables.Booking.values()
    expect(booking).toMatchObject({ businessId: 'biz', name: 'Sam', owner: OWNER, service: 'Appointment' })
    expect(await call('busyTimes', { businessId: 'biz' })).toEqual([
      { date: '2026-10-26', start: '09:00', end: '09:30' },
    ])
  })

  it('refuses a time that overlaps another booking', async () => {
    await bookAppointment('09:00', '09:30')
    expect(await bookAppointment('09:00', '09:30', 'Alex')).toEqual({
      ok: false,
      message: 'Sorry, someone just booked that time.',
    })
    expect(tables.Booking.size).toBe(1)
    expect(await bookAppointment('09:30', '10:00', 'Alex')).toEqual({ ok: true, message: '' })
  })

  it('lets only one of two customers booking the same time at once win', async () => {
    const results = await Promise.all([
      bookAppointment('10:00', '10:30', 'Sam'),
      bookAppointment('10:00', '10:30', 'Alex'),
      bookAppointment('10:15', '10:45', 'Jo'),
    ])
    expect(results.filter((result) => (result as { ok: boolean }).ok)).toHaveLength(1)
    expect(tables.Booking.size).toBe(1)
    expect(await call('busyTimes', { businessId: 'biz' })).toHaveLength(1)
  })

  it('rejects bookings the business does not take', async () => {
    expect(await bookAppointment('08:00', '08:30')).toMatchObject({ ok: false, message: /outside/ })
    expect(
      await call('book', {
        businessId: 'nope',
        service: 'Appointment',
        slots: '[]',
        name: 'Sam',
        contact: 'sam@example.com',
      }),
    ).toEqual({ ok: false, message: "This business couldn't be found." })
    expect(
      await call('book', {
        businessId: 'biz',
        service: 'Appointment',
        slots: 'not json',
        name: 'Sam',
        contact: 'sam@example.com',
      }),
    ).toEqual({ ok: false, message: "Those times aren't valid." })
    expect(tables.Booking.size).toBe(0)
  })

  it('books a drop-off and pickup together', async () => {
    const result = await call('book', {
      businessId: 'biz',
      service: 'Drop-off & pickup',
      slots: JSON.stringify([
        { date: '2026-10-26', start: '09:00', end: '09:05' },
        { date: '2026-10-26', start: '12:00', end: '12:05' },
      ]),
      name: 'Sam',
      contact: '202-555-0123',
      comments: 'Side door',
    })
    expect(result).toEqual({ ok: true, message: '' })
    expect(await call('busyTimes', { businessId: 'biz' })).toHaveLength(2)
  })

  it('lets only the owner cancel, which frees the time', async () => {
    await bookAppointment('09:00', '09:30')
    const [booking] = tables.Booking.values()

    expect(await call('cancelBooking', { id: booking.id }, { sub: 'someone-else' })).toEqual({
      ok: false,
      message: "That booking couldn't be found.",
    })
    expect(tables.Booking.size).toBe(1)

    expect(await call('cancelBooking', { id: booking.id }, { sub: 'owner-sub' })).toEqual({
      ok: true,
      message: '',
    })
    expect(tables.Booking.size).toBe(0)
    expect(await call('busyTimes', { businessId: 'biz' })).toEqual([])
    expect(await bookAppointment('09:00', '09:30', 'Alex')).toEqual({ ok: true, message: '' })
  })
})
