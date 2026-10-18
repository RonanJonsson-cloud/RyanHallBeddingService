export const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

// Booked as one: a drop-off first, then a pickup at least
// `turnaroundMinutes` later (time to wash the bedding).
export const PAIRED_SERVICE = 'Drop-off & pickup'

// Pickups and drop-offs are quick hand-offs; the business chooses how
// long an appointment takes.
export const HANDOFF_MINUTES = 5
export const DEFAULT_APPOINTMENT_MINUTES = 30
export const APPOINTMENT_LENGTHS = [15, 30, 45, 60, 90, 120]
export const DEFAULT_TURNAROUND_MINUTES = 180
export const TURNAROUND_OPTIONS = [60, 120, 180, 240, 360, 720, 1440, 2880]

export function serviceMinutes(service, appointmentMinutes) {
  return service === 'Appointment' ? appointmentMinutes : HANDOFF_MINUTES
}

// What a customer can choose from, given the business's settings.
export function availableServices({
  offerAppointments = true,
  offerHandoffs = true,
  handoffsTogether = false,
}) {
  const services = offerAppointments ? ['Appointment'] : []
  if (!offerHandoffs) return services
  if (handoffsTogether) return [...services, PAIRED_SERVICE]
  return [...services, 'Pickup', 'Drop-off']
}

// 5 -> "5 minutes", 90 -> "1 hour 30 minutes", 1440 -> "1 day"
export function formatDuration(totalMinutes) {
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts = []
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  return parts.join(' ')
}

// "09:30" -> 570
export function toMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

// 570 -> "09:30"
export function toTime(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const minutes = String(totalMinutes % 60).padStart(2, '0')
  return `${hours}:${minutes}`
}

// "13:05" -> "1:05 PM"
export function formatTime(time) {
  const [hours, minutes] = time.split(':').map(Number)
  const suffix = hours < 12 ? 'AM' : 'PM'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

export function formatRange({ start, end }) {
  return `${formatTime(start)} – ${formatTime(end)}`
}

// "9:00 AM – 5:00 PM (busy 12:00 PM – 1:00 PM)"
export function formatRangeWithBreaks(range) {
  const breaks = sortBreaks(range.breaks ?? [])
  if (breaks.length === 0) return formatRange(range)
  return `${formatRange(range)} (busy ${breaks.map(formatRange).join(', ')})`
}

export function isValidRange(start, end) {
  return Boolean(start) && Boolean(end) && toMinutes(end) > toMinutes(start)
}

// Returns an error message, or '' if the range and its breaks are fine.
export function rangeError(start, end, breaks = []) {
  if (!isValidRange(start, end)) return 'End time must be after start time.'
  for (const b of breaks) {
    if (!isValidRange(b.start, b.end)) return 'Each break must end after it starts.'
    if (toMinutes(b.start) < toMinutes(start) || toMinutes(b.end) > toMinutes(end)) {
      return `Breaks must fall between ${formatTime(start)} and ${formatTime(end)}.`
    }
  }
  return ''
}

function sortBreaks(breaks) {
  return [...breaks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
}

// ---- Dates ----
// Customers book real dates, written "YYYY-MM-DD" in local time. The
// business's hours repeat weekly, so a date is matched by its weekday.

export const BOOKING_WINDOW_DAYS = 28
const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function parseDate(date) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function toDateString(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function addDays(date, count) {
  const result = parseDate(date)
  result.setDate(result.getDate() + count)
  return toDateString(result)
}

// "2026-10-19" -> "Monday" (weeks start on Monday, like DAYS).
export function weekdayOf(date) {
  return DAYS[(parseDate(date).getDay() + 6) % 7]
}

// "2026-10-19" -> "Mon Oct 19"
export function formatDate(date) {
  const d = parseDate(date)
  return `${SHORT_DAYS[(d.getDay() + 6) % 7]} ${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`
}

// "2026-10-19" -> "Monday, October 19"
export function formatLongDate(date) {
  return parseDate(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

// Minutes on one continuous timeline, so times on different dates (even
// across weeks) can be compared. Uses UTC to ignore daylight-saving jumps.
export function timelineMinutes(date, time) {
  const [year, month, day] = date.split('-').map(Number)
  return (Date.UTC(year, month - 1, day) / 60000) + toMinutes(time)
}

export function nowOnTimeline(now = new Date()) {
  return timelineMinutes(toDateString(now), toTime(now.getHours() * 60 + now.getMinutes()))
}

// ---- Matching ----

// A range minus its breaks, as the free windows left over. Keeps the
// range's weekday (business hours) or date (customer times).
// 9–5 with a 12–1 break -> [9–12, 1–5]
export function freeWindows(range) {
  const where = range.date ? { date: range.date } : { day: range.day }
  const windows = []
  let cursor = toMinutes(range.start)
  const end = toMinutes(range.end)
  for (const b of sortBreaks(range.breaks ?? [])) {
    const breakStart = Math.max(toMinutes(b.start), cursor)
    const breakEnd = Math.min(toMinutes(b.end), end)
    if (breakEnd <= cursor) continue
    if (breakStart > cursor) {
      windows.push({ ...where, start: toTime(cursor), end: toTime(breakStart) })
    }
    cursor = Math.max(cursor, breakEnd)
  }
  if (cursor < end) {
    windows.push({ ...where, start: toTime(cursor), end: toTime(end) })
  }
  return windows
}

function byDayThenStart(a, b) {
  return (
    DAYS.indexOf(a.day) - DAYS.indexOf(b.day) ||
    toMinutes(a.start) - toMinutes(b.start)
  )
}

// Sorts the business's weekly hours, Monday first.
export function sortRanges(ranges) {
  return [...ranges].sort(byDayThenStart)
}

function byTimeline(a, b) {
  return timelineMinutes(a.date, a.start) - timelineMinutes(b.date, b.start)
}

// Dated windows where the customer is free and the business is open that
// weekday (breaks removed on both sides), long enough for one slot.
export function findOverlaps(businessHours, customerHours, minutes = DEFAULT_APPOINTMENT_MINUTES) {
  const businessFree = businessHours.flatMap(freeWindows)
  const overlaps = []
  for (const customer of customerHours.flatMap(freeWindows)) {
    const weekday = weekdayOf(customer.date)
    for (const business of businessFree) {
      if (business.day !== weekday) continue
      const start = Math.max(toMinutes(business.start), toMinutes(customer.start))
      const end = Math.min(toMinutes(business.end), toMinutes(customer.end))
      if (end - start >= minutes) {
        overlaps.push({ date: customer.date, start: toTime(start), end: toTime(end) })
      }
    }
  }
  return overlaps.sort(byTimeline)
}

// Every slot of `minutes` that both sides are free for, in time order,
// starting no earlier than `notBefore` (see timelineMinutes). Short slots
// can start every 15 minutes and longer ones every 30, so suggested times
// stay easy to read.
function candidateSlots(businessHours, customerHours, minutes, notBefore) {
  const startEvery = minutes >= 30 ? 30 : 15
  const slots = []
  const seen = new Set()
  for (const window of findOverlaps(businessHours, customerHours, minutes)) {
    const last = toMinutes(window.end) - minutes
    for (let start = toMinutes(window.start); start <= last; start += startEvery) {
      const slot = { date: window.date, start: toTime(start), end: toTime(start + minutes) }
      const key = `${slot.date} ${slot.start}`
      if (seen.has(key) || timelineMinutes(slot.date, slot.start) < notBefore) continue
      seen.add(key)
      slots.push(slot)
    }
  }
  return slots.sort(byTimeline)
}

// Up to `max` slots, all on the earliest date that has any, spread out
// across that date: first slot, last slot, and evenly spaced ones between.
function spreadOverEarliestDate(slots, max) {
  if (slots.length === 0) return []
  const date = slots.filter((slot) => slot.date === slots[0].date)
  if (date.length <= max) return date
  if (max === 1) return [date[0]]
  const step = (date.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => date[Math.round(i * step)])
}

// Suggested slots of `minutes` each on the earliest matching date.
// `notBefore` (see timelineMinutes) drops anything earlier, such as times
// that have already passed today.
export function suggestSlots(
  businessHours,
  customerHours,
  { minutes = DEFAULT_APPOINTMENT_MINUTES, max = 3, notBefore = -Infinity } = {},
) {
  return spreadOverEarliestDate(
    candidateSlots(businessHours, customerHours, minutes, notBefore),
    max,
  )
}

// Drop-off times for a paired booking: only those that leave room for a
// pickup at least `turnaroundMinutes` later.
export function suggestDropOffs(
  businessHours,
  customerHours,
  { turnaroundMinutes = DEFAULT_TURNAROUND_MINUTES, max = 3, notBefore = -Infinity } = {},
) {
  const slots = candidateSlots(businessHours, customerHours, HANDOFF_MINUTES, notBefore)
  if (slots.length === 0) return []
  const last = slots[slots.length - 1]
  const lastStart = timelineMinutes(last.date, last.start)
  const withRoom = slots.filter(
    (slot) => timelineMinutes(slot.date, slot.end) + turnaroundMinutes <= lastStart,
  )
  return spreadOverEarliestDate(withRoom, max)
}

// Pickup times for a paired booking, at least `turnaroundMinutes` after
// the chosen drop-off ends.
export function suggestPickups(
  businessHours,
  customerHours,
  dropOff,
  { turnaroundMinutes = DEFAULT_TURNAROUND_MINUTES, max = 3 } = {},
) {
  return suggestSlots(businessHours, customerHours, {
    minutes: HANDOFF_MINUTES,
    max,
    notBefore: timelineMinutes(dropOff.date, dropOff.end) + turnaroundMinutes,
  })
}
