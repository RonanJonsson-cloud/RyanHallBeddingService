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
export function availableServices({ offerHandoffs, handoffsTogether }) {
  if (!offerHandoffs) return ['Appointment']
  if (handoffsTogether) return ['Appointment', PAIRED_SERVICE]
  return ['Appointment', 'Pickup', 'Drop-off']
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

// A range minus its breaks, as the free windows left over.
// 9–5 with a 12–1 break -> [9–12, 1–5]
export function freeWindows(range) {
  const windows = []
  let cursor = toMinutes(range.start)
  const end = toMinutes(range.end)
  for (const b of sortBreaks(range.breaks ?? [])) {
    const breakStart = Math.max(toMinutes(b.start), cursor)
    const breakEnd = Math.min(toMinutes(b.end), end)
    if (breakEnd <= cursor) continue
    if (breakStart > cursor) {
      windows.push({ day: range.day, start: toTime(cursor), end: toTime(breakStart) })
    }
    cursor = Math.max(cursor, breakEnd)
  }
  if (cursor < end) {
    windows.push({ day: range.day, start: toTime(cursor), end: toTime(end) })
  }
  return windows
}

function byDayThenStart(a, b) {
  return (
    DAYS.indexOf(a.day) - DAYS.indexOf(b.day) ||
    toMinutes(a.start) - toMinutes(b.start)
  )
}

export function sortRanges(ranges) {
  return [...ranges].sort(byDayThenStart)
}

// Windows where both the business and the customer are free (breaks
// removed), keeping only windows long enough for one slot.
export function findOverlaps(businessHours, customerHours, minutes = DEFAULT_APPOINTMENT_MINUTES) {
  const businessFree = businessHours.flatMap(freeWindows)
  const customerFree = customerHours.flatMap(freeWindows)
  const overlaps = []
  for (const business of businessFree) {
    for (const customer of customerFree) {
      if (business.day !== customer.day) continue
      const start = Math.max(toMinutes(business.start), toMinutes(customer.start))
      const end = Math.min(toMinutes(business.end), toMinutes(customer.end))
      if (end - start >= minutes) {
        overlaps.push({ day: business.day, start: toTime(start), end: toTime(end) })
      }
    }
  }
  return sortRanges(overlaps)
}

// Minutes since Monday 12:00 AM, so times on different days can be compared.
function weekMinutes(day, time) {
  return DAYS.indexOf(day) * 24 * 60 + toMinutes(time)
}

// Every slot of `minutes` that both sides are free for, in week order.
// Short slots can start every 15 minutes and longer ones every 30, so
// suggested times stay easy to read.
function candidateSlots(businessHours, customerHours, minutes) {
  const startEvery = minutes >= 30 ? 30 : 15
  const slots = []
  const seen = new Set()
  for (const window of findOverlaps(businessHours, customerHours, minutes)) {
    const last = toMinutes(window.end) - minutes
    for (let start = toMinutes(window.start); start <= last; start += startEvery) {
      const key = `${window.day} ${start}`
      if (seen.has(key)) continue
      seen.add(key)
      slots.push({ day: window.day, start: toTime(start), end: toTime(start + minutes) })
    }
  }
  return slots.sort((a, b) => weekMinutes(a.day, a.start) - weekMinutes(b.day, b.start))
}

// Up to `max` slots, all on the earliest day that has any, spread out
// across that day: first slot, last slot, and evenly spaced ones between.
function spreadOverEarliestDay(slots, max) {
  if (slots.length === 0) return []
  const day = slots.filter((slot) => slot.day === slots[0].day)
  if (day.length <= max) return day
  if (max === 1) return [day[0]]
  const step = (day.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => day[Math.round(i * step)])
}

// Suggested slots of `minutes` each on the earliest matching day (Monday
// first). `notBefore` (minutes since Monday 12:00 AM) drops anything earlier.
export function suggestSlots(
  businessHours,
  customerHours,
  { minutes = DEFAULT_APPOINTMENT_MINUTES, max = 3, notBefore = 0 } = {},
) {
  const slots = candidateSlots(businessHours, customerHours, minutes).filter(
    (slot) => weekMinutes(slot.day, slot.start) >= notBefore,
  )
  return spreadOverEarliestDay(slots, max)
}

// Drop-off times for a paired booking: only those that leave room for a
// pickup at least `turnaroundMinutes` later in the same week.
export function suggestDropOffs(
  businessHours,
  customerHours,
  { turnaroundMinutes = DEFAULT_TURNAROUND_MINUTES, max = 3 } = {},
) {
  const slots = candidateSlots(businessHours, customerHours, HANDOFF_MINUTES)
  if (slots.length === 0) return []
  const last = slots[slots.length - 1]
  const lastStart = weekMinutes(last.day, last.start)
  const withRoom = slots.filter(
    (slot) => weekMinutes(slot.day, slot.end) + turnaroundMinutes <= lastStart,
  )
  return spreadOverEarliestDay(withRoom, max)
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
    notBefore: weekMinutes(dropOff.day, dropOff.end) + turnaroundMinutes,
  })
}
