import {
  DAYS,
  DEFAULT_APPOINTMENT_MINUTES,
  DEFAULT_TURNAROUND_MINUTES,
  MAX_TURNAROUND_MINUTES,
  isValidRange,
} from './scheduling.js'

// With no database yet, the business's name and hours travel inside the
// customer link itself: ?b=<compact JSON, base64url-encoded>.
export const LINK_PARAM = 'b'
const MAX_NAME_LENGTH = 80
const MAX_APPOINTMENT_MINUTES = 8 * 60

// How pickups and drop-offs are offered, stored as one small number.
const HANDOFFS_OFF = 0
const HANDOFFS_SEPARATE = 1
const HANDOFFS_TOGETHER = 2
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(encoded) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

// { name, offerAppointments, appointmentMinutes, offerHandoffs, handoffsTogether,
//   turnaroundMinutes, hours: [{ day, start, end, breaks }] } -> short string.
// Days become 0–6 and times drop their colons to keep the QR code small.
export function encodeBusiness({
  name,
  offerAppointments = true,
  appointmentMinutes = DEFAULT_APPOINTMENT_MINUTES,
  offerHandoffs = true,
  handoffsTogether = false,
  turnaroundMinutes = DEFAULT_TURNAROUND_MINUTES,
  hours,
}) {
  const handoffs = !offerHandoffs
    ? HANDOFFS_OFF
    : handoffsTogether
      ? HANDOFFS_TOGETHER
      : HANDOFFS_SEPARATE
  const compact = {
    n: name.trim().slice(0, MAX_NAME_LENGTH),
    // Left out unless appointments are off, so older links still mean "on".
    ...(!offerAppointments && { o: 0 }),
    a: appointmentMinutes,
    p: handoffs,
    ...(handoffs === HANDOFFS_TOGETHER && { t: turnaroundMinutes }),
    h: hours.map((range) => [
      DAYS.indexOf(range.day),
      range.start.replace(':', ''),
      range.end.replace(':', ''),
      ...(range.breaks ?? []).flatMap((b) => [b.start.replace(':', ''), b.end.replace(':', '')]),
    ]),
  }
  return toBase64Url(JSON.stringify(compact))
}

// A whole number of minutes, in 5-minute steps, within [min, max].
function isMinutes(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max && value % 5 === 0
}

function expandTime(value) {
  if (typeof value !== 'string' || value.length !== 4) return null
  const time = `${value.slice(0, 2)}:${value.slice(2)}`
  return TIME.test(time) ? time : null
}

// The reverse of encodeBusiness. Links can be typed or edited by anyone,
// so anything malformed returns null instead of half-working data.
export function decodeBusiness(encoded) {
  try {
    const compact = JSON.parse(fromBase64Url(encoded))
    if (typeof compact?.n !== 'string' || !Array.isArray(compact.h)) return null

    // Older links are missing newer settings; fill in what they used to mean.
    const appointments = compact.o ?? 1
    const appointmentMinutes = compact.a ?? DEFAULT_APPOINTMENT_MINUTES
    const handoffs = compact.p ?? HANDOFFS_SEPARATE
    const turnaroundMinutes = compact.t ?? DEFAULT_TURNAROUND_MINUTES
    if (appointments !== 0 && appointments !== 1) return null
    if (!isMinutes(appointmentMinutes, 5, MAX_APPOINTMENT_MINUTES)) return null
    if (![HANDOFFS_OFF, HANDOFFS_SEPARATE, HANDOFFS_TOGETHER].includes(handoffs)) return null
    if (!isMinutes(turnaroundMinutes, 60, MAX_TURNAROUND_MINUTES)) return null

    const hours = compact.h.map((entry) => {
      if (!Array.isArray(entry) || entry.length < 3 || entry.length % 2 === 0) throw new Error()
      const [dayIndex, ...times] = entry
      const day = DAYS[dayIndex]
      const [start, end, ...breakTimes] = times.map(expandTime)
      if (!day || !start || !end || breakTimes.includes(null)) throw new Error()
      if (!isValidRange(start, end)) throw new Error()
      const breaks = []
      for (let i = 0; i < breakTimes.length; i += 2) {
        breaks.push({ start: breakTimes[i], end: breakTimes[i + 1] })
      }
      return { day, start, end, breaks }
    })

    return {
      name: compact.n.slice(0, MAX_NAME_LENGTH),
      offerAppointments: appointments === 1,
      appointmentMinutes,
      offerHandoffs: handoffs !== HANDOFFS_OFF,
      handoffsTogether: handoffs === HANDOFFS_TOGETHER,
      turnaroundMinutes,
      hours,
    }
  } catch {
    return null
  }
}

export function customerLink(business, base = window.location.origin + window.location.pathname) {
  return `${base}?${LINK_PARAM}=${encodeBusiness(business)}`
}
