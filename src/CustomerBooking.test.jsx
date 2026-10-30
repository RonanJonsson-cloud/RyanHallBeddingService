import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CustomerPage from './CustomerPage.jsx'

// The customer chat when bookings are saved (the cloud version of the app).

function click(name) {
  fireEvent.click(screen.getByRole('button', { name }))
}

const business = {
  name: 'Kairo',
  appointmentMinutes: 30,
  hours: [{ day: 'Monday', start: '09:00', end: '10:00', breaks: [] }],
}

// Monday, October 19, 2026, 8:00 AM.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 19, 8, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

function askForTimes(props) {
  render(<CustomerPage business={business} {...props} />)
  click('Appointment')
  click('Monday, October 19')
  click('Next')
  click('Send')
}

function fillDetails(name, contact) {
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Email or phone'), { target: { value: contact } })
  click('Book')
}

describe('Customer page: saved bookings', () => {
  it('never suggests times that are already taken', () => {
    askForTimes({ taken: [{ date: '2026-10-19', start: '09:00', end: '09:30' }] })
    expect(screen.getByRole('button', { name: 'Mon Oct 19 9:30 AM – 10:00 AM' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /9:00 AM – 9:30 AM/ })).not.toBeInTheDocument()
  })

  it('says so when every matching time is taken', () => {
    askForTimes({ taken: [{ date: '2026-10-19', start: '09:00', end: '10:00' }] })
    expect(screen.getByText(/none of those times line up/)).toBeInTheDocument()
  })

  it('asks for the customer details and books the time', async () => {
    const onBook = vi.fn().mockResolvedValue({ ok: true, message: '' })
    askForTimes({ onBook })
    click('Mon Oct 19 9:00 AM – 9:30 AM')
    click('Yes')
    fireEvent.change(screen.getByLabelText('Your comments'), { target: { value: 'Side door, please.' } })
    click('Send')

    expect(screen.getByText(/Last step: your name/)).toBeInTheDocument()
    click('Book')
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter your name.')
    fillDetails('Sam', 'not a phone')
    expect(screen.getByRole('alert')).toHaveTextContent('valid email or phone')

    fillDetails('Sam', 'sam@example.com')
    expect(
      await screen.findByText(
        "You're booked: Appointment on Mon Oct 19 9:00 AM – 9:30 AM. Thanks for your note. The business will reach you at sam@example.com if anything changes.",
      ),
    ).toBeInTheDocument()
    expect(onBook).toHaveBeenCalledWith({
      service: 'Appointment',
      slots: [{ date: '2026-10-19', start: '09:00', end: '09:30' }],
      name: 'Sam',
      contact: 'sam@example.com',
      comments: 'Side door, please.',
    })
    expect(screen.queryByText(/This is a demo/)).not.toBeInTheDocument()
  })

  it('explains when someone else booked the time first', async () => {
    const onBook = vi.fn().mockResolvedValue({ ok: false, message: 'Sorry, someone just booked that time.' })
    askForTimes({ onBook })
    click('Mon Oct 19 9:00 AM – 9:30 AM')
    click('Skip')
    fillDetails('Sam', '202-555-0123')
    expect(
      await screen.findByText('Sorry, someone just booked that time. Tap Start over to choose another time.'),
    ).toBeInTheDocument()
    expect(onBook.mock.calls[0][0].comments).toBeNull()
    expect(screen.getByRole('button', { name: 'Start over' })).toBeInTheDocument()
  })

  it('explains when the booking could not be sent', async () => {
    askForTimes({ onBook: vi.fn().mockRejectedValue(new Error('offline')) })
    click('Mon Oct 19 9:00 AM – 9:30 AM')
    click('Skip')
    fillDetails('Sam', 'sam@example.com')
    expect(await screen.findByText(/something went wrong and your time wasn't booked/)).toBeInTheDocument()
  })
})
