import { describe, expect, it } from 'vitest'
import {
  MAX_DESCRIPTION_LENGTH,
  cleanRanges,
  datesFrom,
  descriptionError,
  expandTimes,
  isDate,
} from './assistantRules.js'

describe('datesFrom', () => {
  it('lists each date with its weekday', () => {
    expect(datesFrom('2026-10-31', 3)).toEqual([
      { date: '2026-10-31', weekday: 'Saturday' },
      { date: '2026-11-01', weekday: 'Sunday' },
      { date: '2026-11-02', weekday: 'Monday' },
    ])
  })
})

describe('descriptionError', () => {
  it('needs some text, but not too much', () => {
    expect(descriptionError('weekday mornings')).toBe('')
    expect(descriptionError('   ')).toBe('Please tell us when you are free.')
    expect(descriptionError(null)).toBe('Please tell us when you are free.')
    expect(descriptionError('x'.repeat(MAX_DESCRIPTION_LENGTH + 1))).toMatch(/under 300 characters/)
  })
})

describe('isDate', () => {
  it('accepts only YYYY-MM-DD', () => {
    expect(isDate('2026-10-31')).toBe(true)
    expect(isDate('2026-13-01')).toBe(false)
    expect(isDate('Oct 31')).toBe(false)
    expect(isDate(20261031)).toBe(false)
  })
})

describe('expandTimes', () => {
  // Fri Oct 30 to Thu Nov 12.
  const dates = datesFrom('2026-10-30', 14)

  it('covers every date on a repeating weekday, plus exact dates', () => {
    expect(
      expandTimes(
        {
          times: [
            { days: ['Friday'], start: '09:00', end: '11:00' },
            { days: ['2026-11-03'], start: '13:00', end: '15:00' },
          ],
          skipDates: [],
        },
        dates,
      ),
    ).toEqual([
      { date: '2026-10-30', start: '09:00', end: '11:00', breaks: [] },
      { date: '2026-11-03', start: '13:00', end: '15:00', breaks: [] },
      { date: '2026-11-06', start: '09:00', end: '11:00', breaks: [] },
    ])
  })

  it('leaves out skipped dates and anything unusable', () => {
    expect(
      expandTimes(
        {
          times: [
            { days: ['Friday', 'Funday', '2027-01-01'], start: '09:00', end: '11:00' },
            { days: 'Friday', start: '09:00', end: '11:00' },
            null,
          ],
          skipDates: ['2026-10-30'],
        },
        dates,
      ),
    ).toEqual([{ date: '2026-11-06', start: '09:00', end: '11:00', breaks: [] }])
    expect(expandTimes({ times: 'all week', skipDates: null }, dates)).toEqual([])
  })
})

describe('cleanRanges', () => {
  const allowed = ['2026-11-02', '2026-11-03']

  it('keeps well-formed ranges on allowed dates, in time order', () => {
    expect(
      cleanRanges(
        [
          { date: '2026-11-03', start: '08:00', end: '12:00', extra: 'ignored' },
          { date: '2026-11-02', start: '13:00', end: '17:00' },
          { date: '2026-11-02', start: '08:00', end: '12:00' },
        ],
        allowed,
      ),
    ).toEqual([
      { date: '2026-11-02', start: '08:00', end: '12:00', breaks: [] },
      { date: '2026-11-02', start: '13:00', end: '17:00', breaks: [] },
      { date: '2026-11-03', start: '08:00', end: '12:00', breaks: [] },
    ])
  })

  it('drops anything else', () => {
    expect(
      cleanRanges(
        [
          { date: '2026-11-04', start: '08:00', end: '12:00' },
          { date: '2026-11-02', start: '12:00', end: '08:00' },
          { date: '2026-11-02', start: '8am', end: '12:00' },
          { date: '2026-11-02', start: '08:00', end: '24:00' },
          null,
          'Monday',
        ],
        allowed,
      ),
    ).toEqual([])
    expect(cleanRanges('not a list', allowed)).toEqual([])
  })
})
