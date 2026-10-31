import { addDays, toMinutes, weekdayOf } from './scheduling.js'

// Shared by the customer page and the assistant function, which turns a
// customer's own words ("weekday mornings, not Wednesday") into times.
// Whatever the AI answers, only well-formed times on the dates the customer
// could have picked get through.

export const MAX_DESCRIPTION_LENGTH = 300
// The pickup calendar can run past the usual booking window.
export const MAX_ASSISTANT_DAYS = 60
const MAX_RANGES = 120

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export function isDate(value) {
  return typeof value === 'string' && DATE.test(value)
}

// The `days` dates starting at `firstDate`, with their weekdays.
export function datesFrom(firstDate, days) {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(firstDate, i)
    return { date, weekday: weekdayOf(date) }
  })
}

// Returns an error message, or '' if the description can be sent.
export function descriptionError(text) {
  const trimmed = typeof text === 'string' ? text.trim() : ''
  if (!trimmed) return 'Please tell me when you are free.'
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    return `Please keep it under ${MAX_DESCRIPTION_LENGTH} characters.`
  }
  return ''
}

// The usable { date, start, end, breaks } ranges in `ranges`, in time
// order: only those on `allowedDates` that end after they start.
export function cleanRanges(ranges, allowedDates) {
  if (!Array.isArray(ranges)) return []
  const allowed = new Set(allowedDates)
  return ranges
    .filter(
      (range) =>
        typeof range === 'object' &&
        range !== null &&
        allowed.has(range.date) &&
        TIME.test(range.start) &&
        TIME.test(range.end) &&
        toMinutes(range.end) > toMinutes(range.start),
    )
    .slice(0, MAX_RANGES)
    .map(({ date, start, end }) => ({ date, start, end, breaks: [] }))
    .sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.start) - toMinutes(b.start))
}
