// How customers send their booking request to the business on this
// branch: by opening their own email or messaging app, ready to send.

// Kept strict so the address can go straight into a mailto: link.
const EMAIL = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/
const PHONE = /^\+?[\d\s().-]+$/
export const MAX_EMAIL_LENGTH = 254

export function emailError(email) {
  if (!email) return ''
  return EMAIL.test(email) && email.length <= MAX_EMAIL_LENGTH
    ? ''
    : 'Enter a valid email address.'
}

export function phoneError(phone) {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '').length
  return PHONE.test(phone) && digits >= 7 && digits <= 15 ? '' : 'Enter a valid phone number.'
}

// '' when the business can receive requests: at least one way, both valid.
export function contactError({ contactEmail = '', contactPhone = '' }) {
  if (!contactEmail && !contactPhone) return 'Add an email or phone number.'
  return emailError(contactEmail) || phoneError(contactPhone)
}

export function emailLink(email, subject, body) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// "?&body=" opens with the message filled in on both iPhone and Android.
export function textLink(phone, body) {
  return `sms:${phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`
}
