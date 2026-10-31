import { describe, expect, it } from 'vitest'
import { MAX_DESCRIPTION_LENGTH, cleanRanges, datesFrom, descriptionError, isDate } from './assistantRules.js'

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
    expect(descriptionError('   ')).toBe('Please tell me when you are free.')
    expect(descriptionError(null)).toBe('Please tell me when you are free.')
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
