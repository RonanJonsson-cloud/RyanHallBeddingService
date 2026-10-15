import { describe, expect, it } from 'vitest'
import { customerLink, decodeBusiness, encodeBusiness } from './shareLink.js'

const business = {
  name: 'Café Ryan — Bedding',
  hours: [
    {
      day: 'Monday',
      start: '09:00',
      end: '17:00',
      breaks: [
        { start: '12:00', end: '13:00' },
        { start: '15:00', end: '15:30' },
      ],
    },
    { day: 'Sunday', start: '13:30', end: '18:45', breaks: [] },
  ],
}

describe('share links', () => {
  it('round-trips the name, hours and busy times', () => {
    expect(decodeBusiness(encodeBusiness(business))).toEqual(business)
  })

  it('uses only URL-safe characters', () => {
    expect(encodeBusiness(business)).toMatch(/^[\w-]+$/)
  })

  it('builds a link from a base URL', () => {
    const link = customerLink(business, 'https://example.com/')
    expect(link.startsWith('https://example.com/?b=')).toBe(true)
  })

  it('rejects text that is not a link code', () => {
    expect(decodeBusiness('not-a-real-link')).toBeNull()
    expect(decodeBusiness('')).toBeNull()
  })

  it('rejects codes with impossible hours', () => {
    const encode = (value) =>
      btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(decodeBusiness(encode({ n: 'X', h: [[9, '0900', '1700']] }))).toBeNull()
    expect(decodeBusiness(encode({ n: 'X', h: [[0, '1700', '0900']] }))).toBeNull()
    expect(decodeBusiness(encode({ n: 'X', h: [[0, '2500', '2600']] }))).toBeNull()
    expect(decodeBusiness(encode({ n: 'X', h: [[0, '0900', '1700', '1200']] }))).toBeNull()
    expect(decodeBusiness(encode({ n: 42, h: [] }))).toBeNull()
  })
})
