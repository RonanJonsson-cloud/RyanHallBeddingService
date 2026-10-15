export const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

export const SERVICES = ['Appointment', 'Pickup', 'Drop-off']

// Every suggested slot is this long.
export const SLOT_MINUTES = 30

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
export function findOverlaps(businessHours, customerHours) {
  const businessFree = businessHours.flatMap(freeWindows)
  const customerFree = customerHours.flatMap(freeWindows)
  const overlaps = []
  for (const business of businessFree) {
    for (const customer of customerFree) {
      if (business.day !== customer.day) continue
      const start = Math.max(toMinutes(business.start), toMinutes(customer.start))
      const end = Math.min(toMinutes(business.end), toMinutes(customer.end))
      if (end - start >= SLOT_MINUTES) {
        overlaps.push({ day: business.day, start: toTime(start), end: toTime(end) })
      }
    }
  }
  return sortRanges(overlaps)
}

// Up to `max` slots, all on the earliest day (Monday first) that has a
// match, spread out across that day: first slot, last slot, and evenly
// spaced ones in between.
export function suggestSlots(businessHours, customerHours, max = 3) {
  const overlaps = findOverlaps(businessHours, customerHours)
  if (overlaps.length === 0) return []
  const earliestDay = overlaps[0].day

  const slots = []
  const seen = new Set()
  for (const window of overlaps.filter((o) => o.day === earliestDay)) {
    const last = toMinutes(window.end) - SLOT_MINUTES
    for (let start = toMinutes(window.start); start <= last; start += SLOT_MINUTES) {
      if (seen.has(start)) continue
      seen.add(start)
      slots.push({ day: earliestDay, start: toTime(start), end: toTime(start + SLOT_MINUTES) })
    }
  }
  slots.sort((a, b) => toMinutes(a.start) - toMinutes(b.start))

  if (slots.length <= max) return slots
  if (max === 1) return [slots[0]]
  const step = (slots.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => slots[Math.round(i * step)])
}
