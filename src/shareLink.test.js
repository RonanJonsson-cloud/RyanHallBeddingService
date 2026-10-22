import { describe, expect, it } from 'vitest'
import { customerLink, decodeBusiness, encodeBusiness } from './shareLink.js'

const encode = (value) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const business = {
  name: 'Café Ryan — Bedding',
  offerAppointments: true,
  appointmentMinutes: 45,
  offerHandoffs: true,
  handoffsTogether: true,
  turnaroundMinutes: 1440,
  contactEmail: 'owner@example.com',
  contactPhone: '+1 (555) 123-4567',
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

  it('round-trips a business that does not offer appointments', () => {
    const decoded = decodeBusiness(encodeBusiness({ ...business, offerAppointments: false }))
    expect(decoded.offerAppointments).toBe(false)
  })

  it('round-trips a business that only offers appointments', () => {
    const decoded = decodeBusiness(encodeBusiness({ ...business, offerHandoffs: false }))
    expect(decoded.offerHandoffs).toBe(false)
    expect(decoded.handoffsTogether).toBe(false)
  })

  it('fills in defaults for links made before these settings existed', () => {
    const oldLink = encode({ n: 'X', h: [[0, '0900', '1700']] })
    expect(decodeBusiness(oldLink)).toMatchObject({
      contactEmail: '',
      contactPhone: '',
      offerAppointments: true,
      appointmentMinutes: 30,
      offerHandoffs: true,
      handoffsTogether: false,
      turnaroundMinutes: 180,
    })
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
    expect(decodeBusiness(encode({ n: 'X', h: [[9, '0900', '1700']] }))).toBeNull()
    expect(decodeBusiness(encode({ n: 'X', h: [[0, '1700', '0900']] }))).toBeNull()
    expect(decodeBusiness(encode({ n: 'X', h: [[0, '2500', '2600']] }))).toBeNull()
    expect(decodeBusiness(encode({ n: 'X', h: [[0, '0900', '1700', '1200']] }))).toBeNull()
    expect(decodeBusiness(encode({ n: 42, h: [] }))).toBeNull()
  })

  it('accepts a gap of up to 28 days', () => {
    const decoded = decodeBusiness(encodeBusiness({ ...business, turnaroundMinutes: 28 * 1440 }))
    expect(decoded.turnaroundMinutes).toBe(28 * 1440)
  })

  it('rejects bad contact details', () => {
    for (const em of ['not-an-email', 'a@b', 42, 'x@y.com?cc=evil@z.com']) {
      expect(decodeBusiness(encode({ n: 'X', em, h: [] }))).toBeNull()
    }
    for (const ph of ['123', 'call me', 5551234567]) {
      expect(decodeBusiness(encode({ n: 'X', ph, h: [] }))).toBeNull()
    }
  })

  it('rejects impossible pickup and drop-off settings', () => {
    for (const o of [2, -1, '0', false]) {
      expect(decodeBusiness(encode({ n: 'X', o, h: [] }))).toBeNull()
    }
    for (const p of [3, -1, '2', true]) {
      expect(decodeBusiness(encode({ n: 'X', p, h: [] }))).toBeNull()
    }
    for (const t of [0, 7, 30, 28 * 1440 + 60, '180']) {
      expect(decodeBusiness(encode({ n: 'X', p: 2, t, h: [] }))).toBeNull()
    }
  })

  it('rejects impossible appointment lengths', () => {
    for (const a of [0, 7, -30, 1000, '30', 12.5]) {
      expect(decodeBusiness(encode({ n: 'X', a, h: [] }))).toBeNull()
    }
  })
})
