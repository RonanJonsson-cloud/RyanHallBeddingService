import { describe, expect, it } from 'vitest'
import {
  bookingError,
  contactError,
  detailsError,
  findClash,
  withoutTaken,
} from './bookingRules.js'
import { PAIRED_SERVICE } from './scheduling.js'

const business = {
  name: 'Ryan Hall Bedding Service',
  offerAppointments: true,
  appointmentMinutes: 30,
  offerHandoffs: true,
  handoffsTogether: false,
  turnaroundMinutes: 180,
  hours: [{ day: 'Monday', start: '09:00', end: '17:00', breaks: [{ start: '12:00', end: '13:00' }] }],
}
const options = { earliestDate: '2026-10-19' }

describe('contactError', () => {
  it('accepts emails and phone numbers', () => {
    expect(contactError('sam@example.com')).toBe('')
    expect(contactError('(202) 555-0123')).toBe('')
    expect(contactError('+1 202 555 0123')).toBe('')
  })

  it('rejects anything else', () => {
    expect(contactError('')).toBe('Please enter an email or phone number.')
    expect(contactError('sam@example')).toMatch(/valid email/)
    expect(contactError('555-01')).toMatch(/valid email or phone/)
    expect(contactError('call me maybe')).toMatch(/valid email or phone/)
  })
})

describe('detailsError', () => {
  it('needs a name and a way to reach the customer', () => {
    expect(detailsError({ name: ' ', contact: 'sam@example.com' })).toBe('Please enter your name.')
    expect(detailsError({ name: 'Sam', contact: '' })).toBe('Please enter an email or phone number.')
    expect(detailsError({ name: 'Sam', contact: 'sam@example.com', comments: null })).toBe('')
  })

  it('limits long names and comments', () => {
    expect(detailsError({ name: 'x'.repeat(81), contact: 'sam@example.com' })).toMatch(/name/)
    expect(
      detailsError({ name: 'Sam', contact: 'sam@example.com', comments: 'x'.repeat(501) }),
    ).toMatch(/comments/)
  })
})

describe('bookingError', () => {
  it('accepts a slot the business is open for', () => {
    const slots = [{ date: '2026-10-19', start: '09:00', end: '09:30' }]
    expect(bookingError(business, 'Appointment', slots, options)).toBe('')
  })

  it('rejects services the business does not offer', () => {
    const slots = [{ date: '2026-10-19', start: '09:00', end: '09:05' }]
    expect(bookingError({ ...business, offerHandoffs: false }, 'Pickup', slots, options)).toBe(
      "That service isn't offered.",
    )
  })

  it('rejects the wrong length, past dates, and closed or busy times', () => {
    const at = (date, start, end) => [{ date, start, end }]
    expect(bookingError(business, 'Appointment', at('2026-10-19', '09:00', '10:00'), options)).toBe(
      "Those times aren't valid.",
    )
    expect(bookingError(business, 'Appointment', at('2026-10-12', '09:00', '09:30'), options)).toBe(
      'That time has already passed.',
    )
    // Tuesday: closed.
    expect(bookingError(business, 'Appointment', at('2026-10-20', '09:00', '09:30'), options)).toMatch(
      /outside/,
    )
    // Over the lunch break.
    expect(bookingError(business, 'Appointment', at('2026-10-19', '11:45', '12:15'), options)).toMatch(
      /outside/,
    )
    expect(bookingError(business, 'Appointment', at('2026-10-19', '17:00', '17:30'), options)).toMatch(
      /outside/,
    )
  })

  it('rejects malformed slots', () => {
    expect(bookingError(business, 'Appointment', null, options)).toBe("Those times aren't valid.")
    expect(bookingError(business, 'Appointment', [], options)).toBe("Those times aren't valid.")
    expect(
      bookingError(business, 'Appointment', [{ date: 'soon', start: '9', end: '10' }], options),
    ).toBe("Those times aren't valid.")
  })

  it('checks the gap between a drop-off and pickup', () => {
    const paired = { ...business, handoffsTogether: true }
    const dropOff = { date: '2026-10-19', start: '09:00', end: '09:05' }
    // 3 open hours after 9 AM is 12 PM, but 12–1 is busy, so 1 PM.
    expect(
      bookingError(paired, PAIRED_SERVICE, [dropOff, { date: '2026-10-19', start: '12:30', end: '12:35' }], options),
    ).toMatch(/outside/)
    expect(
      bookingError(paired, PAIRED_SERVICE, [dropOff, { date: '2026-10-19', start: '11:00', end: '11:05' }], options),
    ).toBe('The pickup is too soon after the drop-off.')
    expect(
      bookingError(paired, PAIRED_SERVICE, [dropOff, { date: '2026-10-19', start: '13:00', end: '13:05' }], options),
    ).toBe('')
    expect(bookingError(paired, PAIRED_SERVICE, [dropOff], options)).toBe("Those times aren't valid.")
  })
})

describe('findClash', () => {
  const taken = [{ date: '2026-10-19', start: '10:00', end: '10:30' }]

  it('finds overlapping times on the same date', () => {
    expect(findClash([{ date: '2026-10-19', start: '10:15', end: '10:45' }], taken)).toEqual(taken[0])
    expect(findClash([{ date: '2026-10-19', start: '09:45', end: '10:45' }], taken)).toEqual(taken[0])
  })

  it('allows times that only touch, or are on other dates', () => {
    expect(findClash([{ date: '2026-10-19', start: '10:30', end: '11:00' }], taken)).toBeNull()
    expect(findClash([{ date: '2026-10-19', start: '09:30', end: '10:00' }], taken)).toBeNull()
    expect(findClash([{ date: '2026-10-26', start: '10:00', end: '10:30' }], taken)).toBeNull()
  })
})

describe('withoutTaken', () => {
  it('adds taken times on the same date as busy times', () => {
    const hours = [
      { date: '2026-10-19', start: '09:00', end: '17:00', breaks: [{ start: '12:00', end: '13:00' }] },
      { date: '2026-10-21', start: '09:00', end: '17:00', breaks: [] },
    ]
    const taken = [{ date: '2026-10-19', start: '10:00', end: '10:30' }]
    expect(withoutTaken(hours, taken)).toEqual([
      {
        date: '2026-10-19',
        start: '09:00',
        end: '17:00',
        breaks: [
          { start: '12:00', end: '13:00' },
          { start: '10:00', end: '10:30' },
        ],
      },
      hours[1],
    ])
  })
})
