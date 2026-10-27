import {
  PAIRED_SERVICE,
  availableServices,
  earliestPickup,
  openWindowsOn,
  serviceMinutes,
  timelineMinutes,
  toMinutes,
} from './scheduling.js'

// Shared by the customer page and the booking function, which checks every
// booking again because anyone can send it anything.

export const MAX_NAME_LENGTH = 80
export const MAX_CONTACT_LENGTH = 120
export const MAX_COMMENT_LENGTH = 500
export const TAKEN_MESSAGE = 'Sorry, someone just booked that time.'

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Returns an error message, or '' if the email or phone number looks usable.
export function contactError(contact) {
  const trimmed = typeof contact === 'string' ? contact.trim() : ''
  if (!trimmed) return 'Please enter an email or phone number.'
  if (trimmed.length > MAX_CONTACT_LENGTH) return 'That email or phone number is too long.'
  if (trimmed.includes('@')) {
    return EMAIL.test(trimmed) ? '' : 'Please enter a valid email, like name@example.com.'
  }
  const digits = trimmed.replace(/\D/g, '').length
  if (/[^\d\s()+.-]/.test(trimmed) || digits < 7 || digits > 15) {
    return 'Please enter a valid email or phone number.'
  }
  return ''
}

// The customer's name, contact and comments: an error message, or ''.
export function detailsError({ name, contact, comments }) {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed) return 'Please enter your name.'
  if (trimmed.length > MAX_NAME_LENGTH) {
    return `Please keep your name under ${MAX_NAME_LENGTH} characters.`
  }
  const problem = contactError(contact)
  if (problem) return problem
  if (comments != null && (typeof comments !== 'string' || comments.length > MAX_COMMENT_LENGTH)) {
    return `Please keep comments under ${MAX_COMMENT_LENGTH} characters.`
  }
  return ''
}

function isSlot(slot) {
  return (
    typeof slot === 'object' &&
    slot !== null &&
    DATE.test(slot.date) &&
    TIME.test(slot.start) &&
    TIME.test(slot.end)
  )
}

// Inside one of the business's open windows that date, busy times removed.
function withinOpenHours(slot, businessHours) {
  const start = timelineMinutes(slot.date, slot.start)
  const end = timelineMinutes(slot.date, slot.end)
  return openWindowsOn(slot.date, businessHours).some(([open, close]) => open <= start && end <= close)
}

// Returns an error message, or '' if `slots` is a booking this business
// takes: one slot, or a drop-off then a pickup for the paired service.
// `earliestDate` ("YYYY-MM-DD") rejects bookings in the past.
export function bookingError(business, service, slots, { earliestDate }) {
  if (!availableServices(business).includes(service)) return "That service isn't offered."
  const count = service === PAIRED_SERVICE ? 2 : 1
  if (!Array.isArray(slots) || slots.length !== count || !slots.every(isSlot)) {
    return "Those times aren't valid."
  }
  const minutes = serviceMinutes(service, business.appointmentMinutes)
  for (const slot of slots) {
    if (toMinutes(slot.end) - toMinutes(slot.start) !== minutes) return "Those times aren't valid."
    if (slot.date < earliestDate) return 'That time has already passed.'
    if (!withinOpenHours(slot, business.hours)) return "That time is outside the business's hours."
  }
  if (service === PAIRED_SERVICE) {
    const [dropOff, pickup] = slots
    const earliest = earliestPickup(
      dropOff.date,
      dropOff.start,
      business.turnaroundMinutes,
      business.hours,
    )
    if (timelineMinutes(pickup.date, pickup.start) < earliest) {
      return 'The pickup is too soon after the drop-off.'
    }
  }
  return ''
}

// The first taken time any slot overlaps, or null. Times that only touch
// (one ends as the next starts) don't overlap.
export function findClash(slots, taken) {
  for (const slot of slots) {
    for (const other of taken) {
      if (
        other.date === slot.date &&
        toMinutes(slot.start) < toMinutes(other.end) &&
        toMinutes(other.start) < toMinutes(slot.end)
      ) {
        return other
      }
    }
  }
  return null
}

// The customer's times with already-booked times on the same dates treated
// as busy, so they're never suggested.
export function withoutTaken(customerHours, taken) {
  if (taken.length === 0) return customerHours
  return customerHours.map((range) => ({
    ...range,
    breaks: [
      ...(range.breaks ?? []),
      ...taken
        .filter((other) => other.date === range.date)
        .map(({ start, end }) => ({ start, end })),
    ],
  }))
}
