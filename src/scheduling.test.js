import { describe, expect, it } from 'vitest'
import {
  findOverlaps,
  formatDuration,
  formatRangeWithBreaks,
  formatTime,
  freeWindows,
  rangeError,
  suggestSlots,
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

describe('findOverlaps', () => {
  it('finds the window where both schedules are free on the same day', () => {
    const business = [{ day: 'Monday', start: '09:00', end: '12:00' }]
    const customer = [{ day: 'Monday', start: '10:30', end: '14:00' }]
    expect(findOverlaps(business, customer)).toEqual([
      { day: 'Monday', start: '10:30', end: '12:00' },
    ])
  })

  it('ignores different days', () => {
    const business = [{ day: 'Monday', start: '09:00', end: '12:00' }]
    const customer = [{ day: 'Tuesday', start: '09:00', end: '12:00' }]
    expect(findOverlaps(business, customer)).toEqual([])
  })

  it('ignores overlaps shorter than one slot', () => {
    const business = [{ day: 'Monday', start: '09:00', end: '10:00' }]
    const customer = [{ day: 'Monday', start: '09:45', end: '11:00' }]
    expect(findOverlaps(business, customer)).toEqual([])
  })

  it("skips both sides' busy times", () => {
    const business = [
      { day: 'Monday', start: '09:00', end: '17:00', breaks: [{ start: '12:00', end: '13:00' }] },
    ]
    const customer = [
      { day: 'Monday', start: '11:00', end: '15:00', breaks: [{ start: '13:30', end: '14:30' }] },
    ]
    expect(findOverlaps(business, customer)).toEqual([
      { day: 'Monday', start: '11:00', end: '12:00' },
      { day: 'Monday', start: '13:00', end: '13:30' },
      { day: 'Monday', start: '14:30', end: '15:00' },
    ])
  })
})

describe('suggestSlots', () => {
  it('only suggests times on the earliest matching day', () => {
    const business = [
      { day: 'Monday', start: '09:00', end: '17:00' },
      { day: 'Wednesday', start: '09:00', end: '17:00' },
    ]
    const customer = [
      { day: 'Wednesday', start: '09:00', end: '17:00' },
      { day: 'Monday', start: '13:00', end: '14:00' },
    ]
    expect(suggestSlots(business, customer)).toEqual([
      { day: 'Monday', start: '13:00', end: '13:30' },
      { day: 'Monday', start: '13:30', end: '14:00' },
    ])
  })

  it('spreads three times from start to end of that day', () => {
    const business = [{ day: 'Tuesday', start: '09:00', end: '17:00' }]
    const customer = [{ day: 'Tuesday', start: '09:00', end: '17:00' }]
    expect(suggestSlots(business, customer)).toEqual([
      { day: 'Tuesday', start: '09:00', end: '09:30' },
      { day: 'Tuesday', start: '13:00', end: '13:30' },
      { day: 'Tuesday', start: '16:30', end: '17:00' },
    ])
  })

  it('never suggests a time during a break', () => {
    const business = [
      { day: 'Monday', start: '11:00', end: '14:00', breaks: [{ start: '12:00', end: '13:30' }] },
    ]
    const customer = [{ day: 'Monday', start: '11:00', end: '14:00' }]
    expect(suggestSlots(business, customer)).toEqual([
      { day: 'Monday', start: '11:00', end: '11:30' },
      { day: 'Monday', start: '11:30', end: '12:00' },
      { day: 'Monday', start: '13:30', end: '14:00' },
    ])
  })

  it('does not repeat a slot when business hours overlap each other', () => {
    const business = [
      { day: 'Monday', start: '09:00', end: '10:00' },
      { day: 'Monday', start: '09:00', end: '10:00' },
    ]
    const customer = [{ day: 'Monday', start: '09:00', end: '10:00' }]
    expect(suggestSlots(business, customer)).toEqual([
      { day: 'Monday', start: '09:00', end: '09:30' },
      { day: 'Monday', start: '09:30', end: '10:00' },
    ])
  })

  it('makes 5-minute slots that start every 15 minutes', () => {
    const business = [{ day: 'Monday', start: '09:00', end: '10:00' }]
    const customer = [{ day: 'Monday', start: '09:00', end: '09:40' }]
    expect(suggestSlots(business, customer, { minutes: 5 })).toEqual([
      { day: 'Monday', start: '09:00', end: '09:05' },
      { day: 'Monday', start: '09:15', end: '09:20' },
      { day: 'Monday', start: '09:30', end: '09:35' },
    ])
  })

  it('makes long appointments that start every 30 minutes', () => {
    const business = [{ day: 'Monday', start: '09:00', end: '12:00' }]
    const customer = [{ day: 'Monday', start: '09:00', end: '12:00' }]
    expect(suggestSlots(business, customer, { minutes: 90 })).toEqual([
      { day: 'Monday', start: '09:00', end: '10:30' },
      { day: 'Monday', start: '10:00', end: '11:30' },
      { day: 'Monday', start: '10:30', end: '12:00' },
    ])
  })

  it('skips a day whose free time is shorter than the appointment', () => {
    const business = [
      { day: 'Monday', start: '09:00', end: '10:00' },
      { day: 'Tuesday', start: '09:00', end: '17:00' },
    ]
    const customer = [
      { day: 'Monday', start: '09:00', end: '10:00' },
      { day: 'Tuesday', start: '15:00', end: '17:00' },
    ]
    expect(suggestSlots(business, customer, { minutes: 120 })).toEqual([
      { day: 'Tuesday', start: '15:00', end: '17:00' },
    ])
    expect(suggestSlots(business, customer, { minutes: 5 })[0].day).toBe('Monday')
  })

  it('returns nothing when there is no match', () => {
    const business = [{ day: 'Monday', start: '09:00', end: '12:00' }]
    const customer = [{ day: 'Monday', start: '13:00', end: '15:00' }]
    expect(suggestSlots(business, customer)).toEqual([])
  })
})
