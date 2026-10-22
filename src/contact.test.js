import { describe, expect, it } from 'vitest'
import { contactError, emailError, emailLink, phoneError, textLink } from './contact.js'

describe('contact details', () => {
  it('accepts normal emails and phone numbers', () => {
    expect(emailError('owner@example.com')).toBe('')
    expect(emailError('first.last+bookings@mail.cua.edu')).toBe('')
    expect(phoneError('+1 (555) 123-4567')).toBe('')
    expect(phoneError('5551234567')).toBe('')
  })

  it('rejects malformed ones', () => {
    expect(emailError('owner@')).toBe('Enter a valid email address.')
    expect(emailError('owner@example.com?cc=x@y.com')).toBe('Enter a valid email address.')
    expect(phoneError('12345')).toBe('Enter a valid phone number.')
    expect(phoneError('555-CALL-NOW')).toBe('Enter a valid phone number.')
  })

  it('needs at least one way to reach the business', () => {
    expect(contactError({ contactEmail: '', contactPhone: '' })).toBe('Add an email or phone number.')
    expect(contactError({ contactEmail: 'owner@example.com', contactPhone: '' })).toBe('')
    expect(contactError({ contactEmail: '', contactPhone: '5551234567' })).toBe('')
  })

  it('builds links that open the email or messaging app', () => {
    expect(emailLink('owner@example.com', 'Hi there', 'Line 1\nLine 2')).toBe(
      'mailto:owner@example.com?subject=Hi%20there&body=Line%201%0ALine%202',
    )
    expect(textLink('+1 (555) 123-4567', 'Hi & bye')).toBe('sms:+15551234567?&body=Hi%20%26%20bye')
  })
})
