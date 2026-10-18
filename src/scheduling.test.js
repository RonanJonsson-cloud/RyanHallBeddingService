import { describe, expect, it } from 'vitest'
import {
  PAIRED_SERVICE,
  earliestPickup,
  earliestPickupDate,
  turnaroundError,
  addDays,
  availableServices,
  findOverlaps,
  formatDate,
  formatDuration,
  formatLongDate,
  formatRangeWithBreaks,
  formatTime,
  freeWindows,
  nowOnTimeline,
  rangeError,
  suggestDropOffs,
  suggestPickups,
  suggestSlots,
  timelineMinutes,
  weekdayOf,
} from './scheduling.js'

describe('formatTime', () => {
  it('converts 24-hour times to 12-hour times', () => {
    expect(formatTime('09:00')).toBe('9:00 AM')
    expect(formatTime('12:30')).toBe('12:30 PM')
    expect(formatTime('00:15')).toBe('12:15 AM')
    expect(formatTime('17:45')).toBe('5:45 PM')
  })
})

describe('formatDuration', () => {
  it('reads naturally', () => {
    expect(formatDuration(5)).toBe('5 minutes')
    expect(formatDuration(60)).toBe('1 hour')
    expect(formatDuration(90)).toBe('1 hour 30 minutes')
    expect(formatDuration(120)).toBe('2 hours')
    expect(formatDuration(1440)).toBe('1 day')
    expect(formatDuration(2880)).toBe('2 days')
  })
})

describe('formatRangeWithBreaks', () => {
  it('lists busy times after the range', () => {
    const range = {
      start: '09:00',
      end: '17:00',
      breaks: [
        { start: '15:00', end: '15:30' },
        { start: '12:00', end: '13:00' },
      ],
    }
    expect(formatRangeWithBreaks(range)).toBe(
      '9:00 AM – 5:00 PM (busy 12:00 PM – 1:00 PM, 3:00 PM – 3:30 PM)',
    )
  })
})

describe('rangeError', () => {
  it('accepts a range with a break inside it', () => {
    expect(rangeError('09:00', '17:00', [{ start: '12:00', end: '13:00' }])).toBe('')
  })

  it('rejects a range that ends before it starts', () => {
    expect(rangeError('17:00', '09:00')).toBe('End time must be after start time.')
  })

  it('rejects a break outside the range', () => {
    expect(rangeError('09:00', '12:00', [{ start: '11:30', end: '13:00' }])).toBe(
      'Breaks must fall between 9:00 AM and 12:00 PM.',
    )
  })

  it('rejects a break that ends before it starts', () => {
    expect(rangeError('09:00', '17:00', [{ start: '13:00', end: '12:00' }])).toBe(
      'Each break must end after it starts.',
    )
  })
})

describe('freeWindows', () => {
  it('returns the whole range when there are no breaks', () => {
    expect(freeWindows({ day: 'Monday', start: '09:00', end: '17:00' })).toEqual([
      { day: 'Monday', start: '09:00', end: '17:00' },
    ])
  })

  it('cuts breaks out of the range', () => {
    const range = {
      day: 'Monday',
      start: '09:00',
      end: '17:00',
      breaks: [
        { start: '15:00', end: '15:30' },
        { start: '12:00', end: '13:00' },
      ],
    }
    expect(freeWindows(range)).toEqual([
      { day: 'Monday', start: '09:00', end: '12:00' },
      { day: 'Monday', start: '13:00', end: '15:00' },
      { day: 'Monday', start: '15:30', end: '17:00' },
    ])
  })

  it('handles overlapping breaks and breaks at the edges', () => {
    const range = {
      day: 'Monday',
      start: '09:00',
      end: '17:00',
      breaks: [
        { start: '09:00', end: '10:00' },
        { start: '12:00', end: '13:30' },
        { start: '13:00', end: '14:00' },
        { start: '16:00', end: '17:00' },
      ],
    }
    expect(freeWindows(range)).toEqual([
      { day: 'Monday', start: '10:00', end: '12:00' },
      { day: 'Monday', start: '14:00', end: '16:00' },
    ])
  })
})

// Dates used below: Mon Oct 19 2026 starts the week.
const MON = '2026-10-19'
const TUE = '2026-10-20'
const WED = '2026-10-21'
const NEXT_MON = '2026-10-26'

describe('dates', () => {
  it('knows the weekday of a date', () => {
    expect(weekdayOf(MON)).toBe('Monday')
    expect(weekdayOf('2026-10-25')).toBe('Sunday')
  })

  it('formats dates for the chat', () => {
    expect(formatDate(MON)).toBe('Mon Oct 19')
    expect(formatLongDate('2026-11-01')).toBe('Sunday, November 1')
  })

  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays(MON, 7)).toBe(NEXT_MON)
  })

  it('keeps whole days 24 hours apart, even when daylight saving ends', () => {
    expect(timelineMinutes('2026-11-02', '00:00') - timelineMinutes('2026-11-01', '00:00')).toBe(
      1440,
    )
  })
})

describe('findOverlaps', () => {
  it('matches a date with the business hours for its weekday', () => {
    const business = [{ day: 'Monday', start: '09:00', end: '12:00' }]
    const customer = [{ date: MON, start: '10:30', end: '14:00' }]
    expect(findOverlaps(business, customer)).toEqual([
      { date: MON, start: '10:30', end: '12:00' },
    ])
  })

  it('ignores dates when the business is closed', () => {
    const business = [{ day: 'Monday', start: '09:00', end: '12:00' }]
    const customer = [{ date: TUE, start: '09:00', end: '12:00' }]
    expect(findOverlaps(business, customer)).toEqual([])
  })

  it('ignores overlaps shorter than one slot', () => {
    const business = [{ day: 'Monday', start: '09:00', end: '10:00' }]
    const customer = [{ date: MON, start: '09:45', end: '11:00' }]
    expect(findOverlaps(business, customer)).toEqual([])
  })

  it("skips both sides' busy times", () => {
    const business = [
      { day: 'Monday', start: '09:00', end: '17:00', breaks: [{ start: '12:00', end: '13:00' }] },
    ]
    const customer = [
      { date: MON, start: '11:00', end: '15:00', breaks: [{ start: '13:30', end: '14:30' }] },
    ]
    expect(findOverlaps(business, customer)).toEqual([
      { date: MON, start: '11:00', end: '12:00' },
      { date: MON, start: '13:00', end: '13:30' },
      { date: MON, start: '14:30', end: '15:00' },
    ])
  })
})

describe('suggestSlots', () => {
  it('only suggests times on the earliest matching date', () => {
    const business = [
      { day: 'Monday', start: '09:00', end: '17:00' },
      { day: 'Wednesday', start: '09:00', end: '17:00' },
    ]
    const customer = [
      { date: WED, start: '09:00', end: '17:00' },
      { date: MON, start: '13:00', end: '14:00' },
    ]
    expect(suggestSlots(business, customer)).toEqual([
      { date: MON, start: '13:00', end: '13:30' },
      { date: MON, start: '13:30', end: '14:00' },
    ])
  })

  it('treats the same weekday in different weeks as different dates', () => {
    const business = [{ day: 'Monday', start: '09:00', end: '12:00' }]
    const customer = [
      { date: NEXT_MON, start: '09:00', end: '12:00' },
      { date: MON, start: '11:00', end: '12:00' },
    ]
    expect(suggestSlots(business, customer)).toEqual([
      { date: MON, start: '11:00', end: '11:30' },
      { date: MON, start: '11:30', end: '12:00' },
    ])
  })

  it('spreads three times from start to end of that date', () => {
    const business = [{ day: 'Tuesday', start: '09:00', end: '17:00' }]
    const customer = [{ date: TUE, start: '09:00', end: '17:00' }]
    expect(suggestSlots(business, customer)).toEqual([
      { date: TUE, start: '09:00', end: '09:30' },
      { date: TUE, start: '13:00', end: '13:30' },
      { date: TUE, start: '16:30', end: '17:00' },
    ])
  })

  it('skips times that have already passed', () => {
    const business = [{ day: 'Monday', start: '09:00', end: '12:00' }]
    const customer = [{ date: MON, start: '09:00', end: '12:00' }]
    const notBefore = nowOnTimeline(new Date(2026, 9, 19, 10, 10))
    expect(suggestSlots(business, customer, { notBefore })).toEqual([
      { date: MON, start: '10:30', end: '11:00' },
      { date: MON, start: '11:00', end: '11:30' },
      { date: MON, start: '11:30', end: '12:00' },
    ])
  })

  it('moves to the next date when today has no times left', () => {
    const business = [{ day: 'Monday', start: '09:00', end: '12:00' }]
    const customer = [
      { date: MON, start: '09:00', end: '12:00' },
      { date: NEXT_MON, start: '09:00', end: '10:00' },
    ]
    const notBefore = nowOnTimeline(new Date(2026, 9, 19, 13, 0))
    expect(suggestSlots(business, customer, { notBefore })).toEqual([
      { date: NEXT_MON, start: '09:00', end: '09:30' },
      { date: NEXT_MON, start: '09:30', end: '10:00' },
    ])
  })

  it('never suggests a time during a break', () => {
    const business = [
      { day: 'Monday', start: '11:00', end: '14:00', breaks: [{ start: '12:00', end: '13:30' }] },
    ]
    const customer = [{ date: MON, start: '11:00', end: '14:00' }]
    expect(suggestSlots(business, customer)).toEqual([
      { date: MON, start: '11:00', end: '11:30' },
      { date: MON, start: '11:30', end: '12:00' },
      { date: MON, start: '13:30', end: '14:00' },
    ])
  })

  it('does not repeat a slot when business hours overlap each other', () => {
    const business = [
      { day: 'Monday', start: '09:00', end: '10:00' },
      { day: 'Monday', start: '09:00', end: '10:00' },
    ]
    const customer = [{ date: MON, start: '09:00', end: '10:00' }]
    expect(suggestSlots(business, customer)).toEqual([
      { date: MON, start: '09:00', end: '09:30' },
      { date: MON, start: '09:30', end: '10:00' },
    ])
  })

  it('makes 5-minute slots that start every 15 minutes', () => {
    const business = [{ day: 'Monday', start: '09:00', end: '10:00' }]
    const customer = [{ date: MON, start: '09:00', end: '09:40' }]
    expect(suggestSlots(business, customer, { minutes: 5 })).toEqual([
      { date: MON, start: '09:00', end: '09:05' },
      { date: MON, start: '09:15', end: '09:20' },
      { date: MON, start: '09:30', end: '09:35' },
    ])
  })

  it('makes long appointments that start every 30 minutes', () => {
    const business = [{ day: 'Monday', start: '09:00', end: '12:00' }]
    const customer = [{ date: MON, start: '09:00', end: '12:00' }]
    expect(suggestSlots(business, customer, { minutes: 90 })).toEqual([
      { date: MON, start: '09:00', end: '10:30' },
      { date: MON, start: '10:00', end: '11:30' },
      { date: MON, start: '10:30', end: '12:00' },
    ])
  })

  it('skips a date whose free time is shorter than the appointment', () => {
    const business = [
      { day: 'Monday', start: '09:00', end: '10:00' },
      { day: 'Tuesday', start: '09:00', end: '17:00' },
    ]
    const customer = [
      { date: MON, start: '09:00', end: '10:00' },
      { date: TUE, start: '15:00', end: '17:00' },
    ]
    expect(suggestSlots(business, customer, { minutes: 120 })).toEqual([
      { date: TUE, start: '15:00', end: '17:00' },
    ])
    expect(suggestSlots(business, customer, { minutes: 5 })[0].date).toBe(MON)
  })

  it('returns nothing when there is no match', () => {
    const business = [{ day: 'Monday', start: '09:00', end: '12:00' }]
    const customer = [{ date: MON, start: '13:00', end: '15:00' }]
    expect(suggestSlots(business, customer)).toEqual([])
  })
})

describe('availableServices', () => {
  it('leaves out appointments when they are off', () => {
    expect(
      availableServices({ offerAppointments: false, offerHandoffs: true, handoffsTogether: false }),
    ).toEqual(['Pickup', 'Drop-off'])
    expect(
      availableServices({ offerAppointments: false, offerHandoffs: true, handoffsTogether: true }),
    ).toEqual([PAIRED_SERVICE])
  })

  it('offers nothing when everything is off', () => {
    expect(availableServices({ offerAppointments: false, offerHandoffs: false })).toEqual([])
  })

  it('offers only appointments when pickups and drop-offs are off', () => {
    expect(availableServices({ offerHandoffs: false, handoffsTogether: true })).toEqual([
      'Appointment',
    ])
  })

  it('offers pickups and drop-offs separately', () => {
    expect(availableServices({ offerHandoffs: true, handoffsTogether: false })).toEqual([
      'Appointment',
      'Pickup',
      'Drop-off',
    ])
  })

  it('offers them as one paired booking when scheduled together', () => {
    expect(availableServices({ offerHandoffs: true, handoffsTogether: true })).toEqual([
      'Appointment',
      PAIRED_SERVICE,
    ])
  })
})

describe('paired drop-off and pickup', () => {
  const business = [{ day: 'Monday', start: '09:00', end: '17:00' }]
  const customer = [
    { date: MON, start: '09:00', end: '12:00' },
    { date: MON, start: '15:00', end: '17:00' },
  ]

  it('only offers drop-offs that leave room for a pickup afterwards', () => {
    expect(suggestDropOffs(business, customer, { turnaroundMinutes: 180 })).toEqual([
      { date: MON, start: '09:00', end: '09:05' },
      { date: MON, start: '10:30', end: '10:35' },
      { date: MON, start: '11:45', end: '11:50' },
    ])
  })

  it('offers pickups at least the turnaround time after the drop-off', () => {
    const dropOff = { date: MON, start: '11:45', end: '11:50' }
    expect(suggestPickups(business, customer, dropOff, { turnaroundMinutes: 180 })).toEqual([
      { date: MON, start: '15:00', end: '15:05' },
      { date: MON, start: '16:00', end: '16:05' },
      { date: MON, start: '16:45', end: '16:50' },
    ])
  })

  it('carries a long turnaround over to a later date', () => {
    const hours = [
      { day: 'Monday', start: '09:00', end: '10:00' },
      { day: 'Tuesday', start: '09:00', end: '10:00' },
    ]
    const free = [
      { date: MON, start: '09:00', end: '10:00' },
      { date: TUE, start: '09:00', end: '10:00' },
    ]
    // 1 day later at the same time of day.
    expect(suggestDropOffs(hours, free, { turnaroundMinutes: 1440 })).toEqual([
      { date: MON, start: '09:00', end: '09:05' },
      { date: MON, start: '09:30', end: '09:35' },
      { date: MON, start: '09:45', end: '09:50' },
    ])
    const dropOff = { date: MON, start: '09:30', end: '09:35' }
    expect(suggestPickups(hours, free, dropOff, { turnaroundMinutes: 1440 })).toEqual([
      { date: TUE, start: '09:30', end: '09:35' },
      { date: TUE, start: '09:45', end: '09:50' },
    ])
  })

  it('lets a Sunday drop-off have its pickup the next Monday', () => {
    const hours = [
      { day: 'Sunday', start: '09:00', end: '10:00' },
      { day: 'Monday', start: '09:00', end: '10:00' },
    ]
    const free = [
      { date: '2026-10-25', start: '09:00', end: '10:00' },
      { date: NEXT_MON, start: '09:00', end: '10:00' },
    ]
    const dropOffs = suggestDropOffs(hours, free, { turnaroundMinutes: 1440 })
    expect(dropOffs[0].date).toBe('2026-10-25')
    expect(suggestPickups(hours, free, dropOffs[0], { turnaroundMinutes: 1440 })[0]).toEqual({
      date: NEXT_MON,
      start: '09:00',
      end: '09:05',
    })
  })

  it('offers nothing when the turnaround cannot fit', () => {
    const hours = [
      { day: 'Monday', start: '09:00', end: '10:00' },
      { day: 'Tuesday', start: '09:00', end: '10:00' },
    ]
    const free = [
      { date: MON, start: '09:00', end: '10:00' },
      { date: TUE, start: '09:00', end: '10:00' },
    ]
    expect(suggestDropOffs(hours, free, { turnaroundMinutes: 2880 })).toEqual([])
  })
})

describe('turnaroundError', () => {
  it('accepts 1 hour to 28 days', () => {
    expect(turnaroundError(60)).toBe('')
    expect(turnaroundError(3 * 1440 + 5 * 60)).toBe('')
    expect(turnaroundError(28 * 1440)).toBe('')
  })

  it('rejects anything shorter or longer', () => {
    expect(turnaroundError(0)).toBe('The minimum time must be at least 1 hour.')
    expect(turnaroundError(28 * 1440 + 60)).toBe('The minimum time can be at most 28 days.')
  })
})

describe('separate pickup availability', () => {
  const business = [{ day: 'Monday', start: '09:00', end: '17:00' }]
  const dropOffHours = [{ date: MON, start: '09:00', end: '17:00' }]

  it('only offers drop-offs with room before a pickup the customer can make', () => {
    // Pickups can start 2:00–2:45 PM, so with a 3-hour gap a drop-off must
    // start by 11:45 AM.
    const pickupHours = [{ date: MON, start: '14:00', end: '15:00' }]
    const dropOffs = suggestDropOffs(business, dropOffHours, {
      pickupHours,
      turnaroundMinutes: 180,
    })
    expect(dropOffs).toEqual([
      { date: MON, start: '09:00', end: '09:05' },
      { date: MON, start: '10:30', end: '10:35' },
      { date: MON, start: '11:45', end: '11:50' },
    ])
    expect(suggestPickups(business, pickupHours, dropOffs[2], { turnaroundMinutes: 180 })).toEqual([
      { date: MON, start: '14:45', end: '14:50' },
    ])
  })

  it('offers nothing when the pickup availability is too early', () => {
    const pickupHours = [{ date: MON, start: '09:00', end: '10:00' }]
    expect(
      suggestDropOffs(business, dropOffHours, { pickupHours, turnaroundMinutes: 180 }),
    ).toEqual([])
  })
})

describe('earliestPickup: only open days and hours count', () => {
  const FRI = '2026-10-23'
  const NEXT_TUE = '2026-10-27'
  // Open 9 AM – 5 PM on weekdays, with lunch off on Mondays.
  const weekdays = [
    { day: 'Monday', start: '09:00', end: '17:00', breaks: [{ start: '12:00', end: '13:00' }] },
    ...['Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => ({
      day,
      start: '09:00',
      end: '17:00',
    })),
  ]
  const at = (date, time) => timelineMinutes(date, time)

  it('moves whole days to the same time on a later open day', () => {
    // Fri 10 AM + 2 days, skipping Sat and Sun -> Tue 10 AM.
    expect(earliestPickup(FRI, '10:00', 2 * 1440, weekdays)).toBe(at(NEXT_TUE, '10:00'))
    expect(earliestPickupDate(FRI, '10:00', 2 * 1440, weekdays)).toBe(NEXT_TUE)
  })

  it('counts hours only while the business is open', () => {
    // Fri 3 PM + 3 hours: 2 hours on Friday, then 1 hour on Monday -> Mon 10 AM.
    expect(earliestPickup(FRI, '15:00', 180, weekdays)).toBe(at(NEXT_MON, '10:00'))
    // Tue 10 AM + 3 hours stays the same day -> Tue 1 PM.
    expect(earliestPickup(TUE, '10:00', 180, weekdays)).toBe(at(TUE, '13:00'))
  })

  it('skips busy times when counting hours', () => {
    // Mon 11 AM + 2 hours: 11–12, lunch off, then 1–2 PM -> Mon 2 PM.
    expect(earliestPickup(MON, '11:00', 120, weekdays)).toBe(at(MON, '14:00'))
  })

  it('adds the days first, then the open hours', () => {
    // Fri 4 PM + 1 day 2 hours: Mon 4 PM, then 1 hour Monday and 1 hour
    // Tuesday morning -> Tue 10 AM.
    expect(earliestPickup(FRI, '16:00', 1440 + 120, weekdays)).toBe(at(NEXT_TUE, '10:00'))
  })

  it('never ends when the business has no hours', () => {
    expect(earliestPickup(MON, '09:00', 60, [])).toBe(Infinity)
    expect(earliestPickupDate(MON, '09:00', 60, [])).toBeNull()
  })

  it('suggests a Tuesday 10 AM pickup after a Friday 10 AM drop-off with a 2-day gap', () => {
    const dropOff = { date: FRI, start: '10:00', end: '10:05' }
    const free = [
      { date: NEXT_MON, start: '09:00', end: '17:00' },
      { date: NEXT_TUE, start: '09:00', end: '17:00' },
    ]
    const pickups = suggestPickups(weekdays, free, dropOff, { turnaroundMinutes: 2 * 1440 })
    expect(pickups[0]).toEqual({ date: NEXT_TUE, start: '10:00', end: '10:05' })
  })
})
