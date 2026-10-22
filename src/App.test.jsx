import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { decodeBusiness, encodeBusiness } from './shareLink.js'

function click(name) {
  fireEvent.click(screen.getByRole('button', { name }))
}

// A link needs somewhere to send requests.
function addEmail(email = 'owner@example.com') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
}

function addBusinessHours(day, start, end) {
  fireEvent.change(screen.getByLabelText('Day'), { target: { value: day } })
  fireEvent.change(screen.getByLabelText('Start time'), { target: { value: start } })
  fireEvent.change(screen.getByLabelText('End time'), { target: { value: end } })
  click('Add hours')
}

// A fixed "today" so the calendar is predictable: Monday, October 19, 2026, 8:00 AM.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 19, 8, 0))
})

afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState({}, '', '/')
})

// Opens the app the way a customer would: from a shared link.
function renderCustomerLink(business) {
  window.history.replaceState({}, '', `/?b=${encodeBusiness(business)}`)
  render(<App />)
}

describe('Front page', () => {
  it('shows only the business setup', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'RHBScheduler' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your available hours' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Customer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Book a time' })).not.toBeInTheDocument()
  })
})

describe('Business page', () => {
  it('adds and removes available hours', () => {
    render(<App />)
    addBusinessHours('Tuesday', '10:00', '14:00')

    const list = screen.getByRole('list', { name: 'Available hours' })
    expect(within(list).getByText('Tuesday')).toBeInTheDocument()
    expect(within(list).getByText(/10:00 AM – 2:00 PM/)).toBeInTheDocument()

    click('Remove Tuesday 10:00 AM – 2:00 PM')
    expect(screen.getByText('No hours added yet.')).toBeInTheDocument()
  })

  it('adds unavailability while entering hours', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: 'Monday' } })
    click('+ Add unavailability')
    fireEvent.change(screen.getByLabelText('Unavailability 1 start'), { target: { value: '12:00' } })
    fireEvent.change(screen.getByLabelText('Unavailability 1 end'), { target: { value: '13:00' } })
    click('Add hours')

    const list = screen.getByRole('list', { name: 'Available hours' })
    expect(within(list).getByText('Unavailable 12:00 PM – 1:00 PM')).toBeInTheDocument()
  })

  it('adds and removes unavailability on hours already in the list', () => {
    render(<App />)
    addBusinessHours('Friday', '09:00', '17:00')

    click('Add unavailability to Friday 9:00 AM – 5:00 PM')
    click('Save')
    const list = screen.getByRole('list', { name: 'Available hours' })
    expect(within(list).getByText('Unavailable 12:00 PM – 1:00 PM')).toBeInTheDocument()

    click('Remove unavailability 12:00 PM – 1:00 PM from Friday 9:00 AM – 5:00 PM')
    expect(within(list).queryByText(/Unavailable/)).not.toBeInTheDocument()
  })

  it('rejects unavailability outside the hours', () => {
    render(<App />)
    click('+ Add unavailability')
    fireEvent.change(screen.getByLabelText('Unavailability 1 start'), { target: { value: '18:00' } })
    fireEvent.change(screen.getByLabelText('Unavailability 1 end'), { target: { value: '19:00' } })
    click('Add hours')

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unavailability must fall between 9:00 AM and 5:00 PM.',
    )
    expect(screen.getByText('No hours added yet.')).toBeInTheDocument()
  })

  it('rejects an end time before the start time', () => {
    render(<App />)
    addBusinessHours('Monday', '15:00', '09:00')
    expect(screen.getByRole('alert')).toHaveTextContent('End time must be after start time.')
    expect(screen.getByText('No hours added yet.')).toBeInTheDocument()
  })
})

describe('Appointment settings', () => {
  it('shows the appointment length only when appointments are offered', () => {
    render(<App />)
    const offer = screen.getByLabelText('Offer appointments')
    expect(offer).toBeChecked()
    expect(screen.getByLabelText('Appointment length')).toHaveValue('30')

    fireEvent.click(offer)
    expect(screen.queryByLabelText('Appointment length')).not.toBeInTheDocument()
  })

  it('warns and hides the link when nothing can be booked', () => {
    render(<App />)
    addEmail()
    addBusinessHours('Monday', '09:00', '17:00')
    fireEvent.click(screen.getByLabelText('Offer appointments'))
    fireEvent.click(screen.getByLabelText('Offer pickups and drop-offs'))

    expect(screen.getByRole('alert')).toHaveTextContent('Turn on at least one service.')
    expect(screen.getByText('Turn on a service to get a link.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Customer link')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Offer pickups and drop-offs'))
    const link = screen.getByLabelText('Customer link').value
    expect(decodeBusiness(new URL(link).searchParams.get('b'))).toMatchObject({
      offerAppointments: false,
      offerHandoffs: true,
    })
  })
})

describe('Pickup and drop-off settings', () => {
  it('shows the together option only when pickups and drop-offs are offered', () => {
    render(<App />)
    const offer = screen.getByLabelText('Offer pickups and drop-offs')
    expect(offer).toBeChecked()
    expect(screen.getByLabelText('Schedule drop-off and pickup together')).not.toBeChecked()
    expect(screen.queryByLabelText('Days')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Schedule drop-off and pickup together'))
    // The default gap is 3 hours.
    expect(screen.getByLabelText('Days')).toHaveValue(0)
    expect(screen.getByLabelText('Hours')).toHaveValue(3)

    fireEvent.click(offer)
    expect(screen.queryByText('5 minutes each.')).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('Schedule drop-off and pickup together'),
    ).not.toBeInTheDocument()
  })

  it('puts the settings into the customer link', () => {
    render(<App />)
    addEmail()
    fireEvent.click(screen.getByLabelText('Schedule drop-off and pickup together'))
    fireEvent.change(screen.getByLabelText('Days'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '0' } })
    addBusinessHours('Monday', '09:00', '17:00')

    const link = screen.getByLabelText('Customer link').value
    expect(decodeBusiness(new URL(link).searchParams.get('b'))).toMatchObject({
      offerHandoffs: true,
      handoffsTogether: true,
      turnaroundMinutes: 2 * 1440,
    })
  })

  it('sets the gap in days and hours, up to 28 days', () => {
    render(<App />)
    fireEvent.click(screen.getByLabelText('Schedule drop-off and pickup together'))
    const days = screen.getByLabelText('Days')
    const hours = screen.getByLabelText('Hours')

    fireEvent.change(days, { target: { value: '1' } })
    fireEvent.change(hours, { target: { value: '6' } })
    expect(screen.getByText('Only open days and hours count.')).toBeInTheDocument()
    expect(days).toHaveValue(1)
    expect(hours).toHaveValue(6)

    // Boxes can't go past their limits.
    fireEvent.change(days, { target: { value: '40' } })
    expect(days).toHaveValue(28)
    fireEvent.change(hours, { target: { value: '30' } })
    expect(hours).toHaveValue(23)
  })

  it('rejects gaps under 1 hour or over 28 days, and hides the link', () => {
    render(<App />)
    addEmail()
    addBusinessHours('Monday', '09:00', '17:00')
    fireEvent.click(screen.getByLabelText('Schedule drop-off and pickup together'))

    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '0' } })
    expect(screen.getByRole('alert')).toHaveTextContent('at least 1 hour')
    expect(screen.queryByLabelText('Customer link')).not.toBeInTheDocument()
    expect(screen.getByText('Fix the minimum time to get a link.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Days'), { target: { value: '28' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Customer link')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '1' } })
    expect(screen.getByRole('alert')).toHaveTextContent('at most 28 days')
    expect(screen.queryByLabelText('Customer link')).not.toBeInTheDocument()
  })
})

describe('Share panel', () => {
  it('asks for hours before offering a link', () => {
    render(<App />)
    expect(
      screen.getByText('Add hours to get a link.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Customer link')).not.toBeInTheDocument()
  })

  it('creates a link and QR code that open this business on the customer page', () => {
    const { unmount } = render(<App />)
    addEmail()
    fireEvent.change(screen.getByLabelText('Business name'), {
      target: { value: "Ryan's Laundry" },
    })
    fireEvent.change(screen.getByLabelText('Appointment length'), { target: { value: '45' } })
    addBusinessHours('Tuesday', '10:00', '14:00')

    const link = screen.getByLabelText('Customer link').value
    expect(link).toMatch(/^http:\/\/localhost(:\d+)?\/\?b=[\w-]+$/)
    expect(screen.getByTitle("QR code for Ryan's Laundry booking link")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Preview customer page' })).toHaveAttribute(
      'href',
      link,
    )

    expect(decodeBusiness(new URL(link).searchParams.get('b')).appointmentMinutes).toBe(45)

    // Open that exact link as a customer.
    unmount()
    window.history.replaceState({}, '', link)
    render(<App />)
    expect(screen.getByRole('heading', { name: "Ryan's Laundry" })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your available hours' })).not.toBeInTheDocument()

    click('Appointment')
    click('Tuesday, October 20')
    click('Next')
    click('Send')
    expect(screen.getByText(/The earliest day that works is Tue Oct 20/)).toBeInTheDocument()
  })
})

describe('Customer page (from a shared link)', () => {
  const business = {
    name: 'Ryan Hall Bedding Service',
    appointmentMinutes: 30,
    hours: [
      { day: 'Monday', start: '09:00', end: '17:00', breaks: [] },
      { day: 'Wednesday', start: '09:00', end: '17:00', breaks: [] },
    ],
  }

  it('shows the business name and only the booking chat', () => {
    renderCustomerLink(business)
    expect(
      screen.getByRole('heading', { name: 'Ryan Hall Bedding Service' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Book a time' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Business name')).not.toBeInTheDocument()
  })

  it('walks through the chat and suggests times across the earliest matching day', () => {
    renderCustomerLink(business)
    click('Appointment')
    expect(screen.getByText('To book an appointment, please select available dates.')).toBeInTheDocument()
    click('Wednesday, October 21')
    click('Monday, October 19')
    click('Next')

    // Monday: free 9 AM – 5 PM, but busy 12 – 1 for lunch.
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '17:00' } })
    click('+ Add a busy time (lunch, class…)')
    click('Send')
    expect(
      screen.getByText('9:00 AM – 5:00 PM (busy 12:00 PM – 1:00 PM)'),
    ).toBeInTheDocument()

    // Wednesday: also free, but Monday comes first.
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '17:00' } })
    click('Send')

    expect(
      screen.getByText(
        'The earliest day that works is Mon Oct 19. Here are 3 times across that day for your appointment:',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mon Oct 19 9:00 AM – 9:30 AM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mon Oct 19 1:30 PM – 2:00 PM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mon Oct 19 4:30 PM – 5:00 PM' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Wed Oct 21/ })).not.toBeInTheDocument()

    click('Mon Oct 19 1:30 PM – 2:00 PM')
    expect(
      screen.getByText('Anything else we should know?'),
    ).toBeInTheDocument()
    click('Skip')
    expect(screen.queryByLabelText('Your comments')).not.toBeInTheDocument()
    expect(
      screen.getByText(/You're all set: Appointment on Mon Oct 19 1:30 PM – 2:00 PM/),
    ).toBeInTheDocument()
  })

  it('suggests 5-minute slots for a pickup', () => {
    renderCustomerLink(business)
    click('Pickup')
    expect(screen.getByText('To book a pickup, please select available dates.')).toBeInTheDocument()
    click('Monday, October 19')
    click('Next')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '17:00' } })
    click('+ Add a busy time (lunch, class…)')
    click('Send')

    expect(screen.getByRole('button', { name: 'Mon Oct 19 9:00 AM – 9:05 AM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mon Oct 19 1:30 PM – 1:35 PM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mon Oct 19 4:45 PM – 4:50 PM' })).toBeInTheDocument()
  })

  it("uses the business's appointment length", () => {
    renderCustomerLink({
      name: 'Ryan Hall Bedding Service',
      appointmentMinutes: 60,
      hours: [{ day: 'Tuesday', start: '09:00', end: '12:00', breaks: [] }],
    })
    click('Appointment')
    expect(screen.getByText('To book an appointment, please select available dates.')).toBeInTheDocument()
    click('Tuesday, October 20')
    click('Next')
    click('Send')

    expect(screen.getByRole('button', { name: 'Tue Oct 20 9:00 AM – 10:00 AM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tue Oct 20 10:00 AM – 11:00 AM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tue Oct 20 11:00 AM – 12:00 PM' })).toBeInTheDocument()
  })

  it('keeps the customer within the business hours', () => {
    renderCustomerLink(business)
    click('Drop-off')
    click('Monday, October 19')
    click('Next')

    // The form shows the hours and starts filled in with them.
    expect(screen.getByText('Open 9:00 AM – 5:00 PM')).toBeInTheDocument()
    expect(screen.getByLabelText('From')).toHaveValue('09:00')
    expect(screen.getByLabelText('To')).toHaveValue('17:00')

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '16:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '20:00' } })
    click('Send')
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Please choose times between 9:00 AM and 5:00 PM, when we're open.",
    )
    // Still on the same question.
    expect(screen.getByLabelText('From')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '08:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '10:00' } })
    click('Send')
    expect(screen.getByRole('alert')).toHaveTextContent('between 9:00 AM and 5:00 PM')

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '16:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '17:00' } })
    click('Send')
    expect(screen.getByText('4:00 PM – 5:00 PM')).toBeInTheDocument()
  })

  it("shows each date's own hours, including busy times", () => {
    renderCustomerLink({
      ...business,
      hours: [
        { day: 'Monday', start: '09:00', end: '17:00', breaks: [{ start: '12:00', end: '13:00' }] },
        { day: 'Wednesday', start: '13:00', end: '18:00', breaks: [] },
      ],
    })
    click('Pickup')
    click('Monday, October 19')
    click('Wednesday, October 21')
    click('Next')
    expect(screen.getByText('Open 9:00 AM – 5:00 PM (busy 12:00 PM – 1:00 PM)')).toBeInTheDocument()
    click('Send')
    expect(screen.getByText('Open 1:00 PM – 6:00 PM')).toBeInTheDocument()
    // Monday's 9–5 is copied over, trimmed to Wednesday's hours.
    expect(screen.getByLabelText('From')).toHaveValue('13:00')
    expect(screen.getByLabelText('To')).toHaveValue('17:00')
  })

  it('says so when nothing matches', () => {
    // By 6 PM, every time today has passed.
    vi.setSystemTime(new Date(2026, 9, 19, 18, 0))
    renderCustomerLink(business)
    click('Drop-off')
    click('Monday, October 19')
    click('Next')
    click('Send')

    expect(screen.getByText(/none of those times line up/)).toBeInTheDocument()
  })

  it('says so up front when the link has no hours', () => {
    renderCustomerLink({ name: 'Ryan Hall Bedding Service', hours: [] })
    expect(
      screen.getByText("This business hasn't posted any hours yet. Please check back soon."),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('explains when a link is broken', () => {
    window.history.replaceState({}, '', '/?b=not-a-real-link')
    render(<App />)
    expect(screen.getByRole('alert')).toHaveTextContent("This booking link isn't valid.")
  })
})

describe('Customer page: appointments only', () => {
  it('skips the service question', () => {
    renderCustomerLink({
      name: 'Ryan Hall Bedding Service',
      appointmentMinutes: 60,
      offerHandoffs: false,
      hours: [{ day: 'Monday', start: '09:00', end: '12:00', breaks: [] }],
    })
    expect(
      screen.getByText('Hi! To book an appointment, please select available dates.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pickup' })).not.toBeInTheDocument()

    click('Monday, October 19')
    click('Next')
    click('Send')
    expect(screen.getByRole('button', { name: 'Mon Oct 19 9:00 AM – 10:00 AM' })).toBeInTheDocument()

    click('Start over')
    expect(screen.getByRole('button', { name: 'Monday, October 19' })).toBeInTheDocument()
  })
})

describe('Customer page: drop-off and pickup together', () => {
  const business = {
    name: 'Ryan Hall Bedding Service',
    offerHandoffs: true,
    handoffsTogether: true,
    turnaroundMinutes: 180,
    hours: [
      { day: 'Monday', start: '09:00', end: '17:00', breaks: [] },
      { day: 'Wednesday', start: '09:00', end: '17:00', breaks: [] },
    ],
  }

  function enterTimes(from, to) {
    fireEvent.change(screen.getByLabelText('From'), { target: { value: from } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: to } })
    click('Send')
  }

  it('asks for drop-off and pickup availability separately', () => {
    renderCustomerLink(business)
    expect(screen.queryByRole('button', { name: 'Pickup' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Drop-off' })).not.toBeInTheDocument()

    click('Drop-off & pickup')
    expect(
      screen.getByText(
        'To book a drop-off and pickup, first select available dates for your drop-off.',
      ),
    ).toBeInTheDocument()

    // Drop-off: Monday morning only.
    click('Monday, October 19')
    click('Next')
    enterTimes('09:00', '12:00')

    // Pickup: Monday afternoon or next Monday morning.
    expect(
      screen.getByText(
        "Now select available dates for your pickup. It must be at least 3 hours after your drop-off, counting only the days and hours we're open.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday, October 19' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    click('Monday, October 19')
    click('Monday, October 26')
    click('Next')
    enterTimes('14:00', '17:00')
    enterTimes('09:00', '12:00')

    expect(screen.getByText(/^First, your drop-off\. The earliest day that works is Mon Oct 19/))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mon Oct 19 9:00 AM – 9:05 AM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mon Oct 19 10:30 AM – 10:35 AM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mon Oct 19 11:45 AM – 11:50 AM' })).toBeInTheDocument()

    click('Mon Oct 19 11:45 AM – 11:50 AM')
    // Comments come only after both times are chosen.
    expect(screen.queryByText(/^Anything else we should know/)).not.toBeInTheDocument()
    expect(screen.getByText(/^Now your pickup, at least 3 hours after your drop-off\./))
      .toBeInTheDocument()
    // Pickups come from the pickup availability, at least 3 open hours after
    // the 11:45 AM drop-off starts.
    expect(screen.getByRole('button', { name: 'Mon Oct 19 2:45 PM – 2:50 PM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mon Oct 19 3:45 PM – 3:50 PM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mon Oct 19 4:45 PM – 4:50 PM' })).toBeInTheDocument()

    click('Mon Oct 19 3:45 PM – 3:50 PM')
    click('Skip')
    expect(
      screen.getByText(
        /You're all set: Drop-off on Mon Oct 19 11:45 AM – 11:50 AM and pickup on Mon Oct 19 3:45 PM – 3:50 PM/,
      ),
    ).toBeInTheDocument()
  })

  it('greys out pickup dates that are too soon after the drop-off', () => {
    renderCustomerLink({ ...business, turnaroundMinutes: 2 * 1440 })
    click('Drop-off & pickup')
    click('Monday, October 19')
    click('Next')
    enterTimes('09:00', '12:00')

    // Open only Mon and Wed: 2 days of open time from Mon Oct 19 9 AM is
    // Mon (15 hours) + Wed (24 hours) + 9 hours of the next Monday.
    expect(screen.queryByRole('button', { name: /October 21/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday, October 26' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Wednesday, October 28' })).toBeEnabled()
  })

  it('says so when there is no room for both', () => {
    renderCustomerLink(business)
    click('Drop-off & pickup')
    click('Monday, October 19')
    click('Next')
    enterTimes('09:00', '11:00')
    click('Monday, October 19')
    click('Next')
    enterTimes('09:00', '11:00')

    expect(
      screen.getByText(/couldn't fit a drop-off and a pickup at least 3 hours apart/),
    ).toBeInTheDocument()
  })

  it('starts over from the drop-off dates', () => {
    renderCustomerLink(business)
    click('Drop-off & pickup')
    click('Monday, October 19')
    click('Next')
    enterTimes('09:00', '12:00')
    click('Start over')
    click('Drop-off & pickup')
    expect(
      screen.getByText(
        'To book a drop-off and pickup, first select available dates for your drop-off.',
      ),
    ).toBeInTheDocument()
    click('Monday, October 19')
    click('Next')
    enterTimes('09:00', '12:00')
    expect(screen.getByText(/^Now select available dates for your pickup/)).toBeInTheDocument()
  })
})

describe('Customer page: no appointments', () => {
  const hours = [{ day: 'Monday', start: '09:00', end: '17:00', breaks: [] }]

  it('offers only pickup and drop-off', () => {
    renderCustomerLink({ name: 'Ryan Hall Bedding Service', offerAppointments: false, hours })
    expect(screen.queryByRole('button', { name: 'Appointment' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pickup' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drop-off' })).toBeInTheDocument()
  })

  it('skips the question when the paired booking is the only option', () => {
    renderCustomerLink({
      name: 'Ryan Hall Bedding Service',
      offerAppointments: false,
      handoffsTogether: true,
      turnaroundMinutes: 180,
      hours,
    })
    expect(
      screen.getByText(
        'Hi! To book a drop-off and pickup, first select available dates for your drop-off.',
      ),
    ).toBeInTheDocument()

    click('Monday, October 19')
    click('Next')
    click('Send')
    expect(screen.getByText(/^Now select available dates for your pickup/)).toBeInTheDocument()
    click('Monday, October 19')
    click('Next')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '17:00' } })
    click('Send')
    expect(screen.getByText(/^First, your drop-off\./)).toBeInTheDocument()
  })

  it('says so when nothing can be booked', () => {
    renderCustomerLink({
      name: 'Ryan Hall Bedding Service',
      offerAppointments: false,
      offerHandoffs: false,
      hours,
    })
    expect(screen.getByText("Sorry, this business isn't taking bookings right now."))
      .toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('Customer page: final comments', () => {
  const business = {
    name: 'Ryan Hall Bedding Service',
    hours: [{ day: 'Monday', start: '09:00', end: '17:00', breaks: [] }],
  }

  function bookPickup() {
    renderCustomerLink(business)
    click('Pickup')
    click('Monday, October 19')
    click('Next')
    click('Send')
    click('Mon Oct 19 9:00 AM – 9:05 AM')
  }

  it('asks a yes or no question before finishing', () => {
    bookPickup()
    expect(
      screen.getByText('Anything else we should know?'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument()
    expect(screen.queryByText(/You're all set/)).not.toBeInTheDocument()
  })

  it('shows a text box when the customer says yes', () => {
    bookPickup()
    click('Yes')
    expect(screen.getByText('What would you like the business to know?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument()

    click('Send')
    expect(screen.getByRole('alert')).toHaveTextContent('Please type a comment')

    fireEvent.change(screen.getByLabelText('Your comments'), {
      target: { value: 'Please knock, the doorbell is broken.' },
    })
    click('Send')
    expect(screen.getByText('Please knock, the doorbell is broken.')).toBeInTheDocument()
    expect(
      screen.getByText(
        /You're all set: Pickup on Mon Oct 19 9:00 AM – 9:05 AM\. Thanks for your note\./,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Your comments')).not.toBeInTheDocument()
  })

  it('finishes straight away when the customer skips', () => {
    bookPickup()
    click('Skip')
    expect(screen.getByText(/You're all set: Pickup on Mon Oct 19 9:00 AM – 9:05 AM\. \(This/))
      .toBeInTheDocument()
  })
})

describe('Customer page: calendar', () => {
  const business = {
    name: 'Ryan Hall Bedding Service',
    hours: [
      { day: 'Monday', start: '09:00', end: '17:00', breaks: [] },
      { day: 'Wednesday', start: '09:00', end: '17:00', breaks: [] },
    ],
  }

  function openCalendar() {
    renderCustomerLink(business)
    click('Pickup')
  }

  it('only lets customers pick open dates within the next 4 weeks', () => {
    openCalendar()
    const date = (name) => screen.getByRole('button', { name })

    expect(date('Monday, October 19')).toBeEnabled()
    expect(date('Wednesday, October 21')).toBeEnabled()
    expect(date('Tuesday, October 20 (unavailable)')).toBeDisabled()
    expect(date('Monday, November 9')).toBeEnabled()
    // Today is a Monday, so the calendar runs exactly 4 weeks: Oct 19 – Nov 15.
    expect(screen.queryByRole('button', { name: /October 18/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /November 16/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /day, (October|November)/ })).toHaveLength(28)
  })

  it('marks picked dates and needs at least one before Next', () => {
    openCalendar()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    click('Wednesday, October 21')
    expect(screen.getByRole('button', { name: 'Wednesday, October 21' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()

    click('Wednesday, October 21')
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('asks about each picked date in order', () => {
    openCalendar()
    click('Monday, October 26')
    click('Wednesday, October 21')
    click('Next')

    expect(screen.getByText('Wed Oct 21, Mon Oct 26')).toBeInTheDocument()
    expect(screen.getByText('What times are you free on Wed Oct 21?')).toBeInTheDocument()
    click('Send')
    expect(screen.getByText('And on Mon Oct 26?')).toBeInTheDocument()
  })

  it('skips times that have already passed today', () => {
    vi.setSystemTime(new Date(2026, 9, 19, 16, 50))
    openCalendar()
    click('Monday, October 19')
    click('Wednesday, October 21')
    click('Next')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '17:00' } })
    click('Send')
    click('Send')

    // At 4:50 PM the last Monday pickup (4:45) has passed, so it moves to Wednesday.
    expect(screen.getByText(/The earliest day that works is Wed Oct 21/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Mon Oct 19/ })).not.toBeInTheDocument()
  })
})

describe('Customer page: calendar length for drop-off and pickup', () => {
  const hours = [{ day: 'Monday', start: '09:00', end: '17:00', breaks: [] }]

  it('shows extra days to fit a long gap before the pickup', () => {
    renderCustomerLink({
      name: 'Ryan Hall Bedding Service',
      offerAppointments: false,
      handoffsTogether: true,
      turnaroundMinutes: 14 * 1440,
      hours,
    })
    // Drop-off dates: the usual 4 weeks.
    expect(screen.queryByRole('button', { name: /November 16/ })).not.toBeInTheDocument()
    click('Monday, October 19')
    click('Next')
    click('Send')

    // Open only on Mondays, so a 14-day gap is 14 Mondays of open time:
    // pickups start Mon Jan 25, and the calendar runs to 14 Mondays past the
    // last drop-off date (through Feb 16).
    expect(screen.queryByRole('button', { name: /January 18/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday, January 25' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Monday, February 15' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /February 22/ })).not.toBeInTheDocument()
  })

  it('keeps the usual 4 weeks for other bookings', () => {
    renderCustomerLink({ name: 'Ryan Hall Bedding Service', hours })
    click('Pickup')
    expect(screen.getByRole('button', { name: 'Monday, November 9' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /November 16/ })).not.toBeInTheDocument()
  })
})

describe('Customer page: later dates start with the first date\'s times', () => {
  const business = {
    name: 'Ryan Hall Bedding Service',
    hours: [
      { day: 'Monday', start: '09:00', end: '17:00', breaks: [] },
      { day: 'Tuesday', start: '09:00', end: '17:00', breaks: [] },
      { day: 'Wednesday', start: '13:00', end: '18:00', breaks: [] },
    ],
  }

  function startPickup(...dates) {
    renderCustomerLink(business)
    click('Pickup')
    for (const date of dates) click(date)
    click('Next')
  }

  it('copies the times and busy times to the next dates', () => {
    startPickup('Monday, October 19', 'Tuesday, October 20', 'Monday, October 26')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '10:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '15:00' } })
    click('+ Add a busy time (lunch, class…)')
    click('Send')

    for (let i = 0; i < 2; i++) {
      expect(screen.getByLabelText('From')).toHaveValue('10:00')
      expect(screen.getByLabelText('To')).toHaveValue('15:00')
      expect(screen.getByLabelText('Break 1 start')).toHaveValue('12:00')
      expect(screen.getByLabelText('Break 1 end')).toHaveValue('13:00')
      click('Send')
    }
    expect(screen.getAllByText('10:00 AM – 3:00 PM (busy 12:00 PM – 1:00 PM)')).toHaveLength(3)
  })

  it('can still be changed for each date', () => {
    startPickup('Monday, October 19', 'Tuesday, October 20')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '10:00' } })
    click('Send')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '14:00' } })
    click('Send')
    expect(screen.getByText('10:00 AM – 5:00 PM')).toBeInTheDocument()
    expect(screen.getByText('2:00 PM – 5:00 PM')).toBeInTheDocument()
  })

  it("trims the copied times to a date's hours, dropping busy times outside them", () => {
    startPickup('Monday, October 19', 'Wednesday, October 21')
    // Monday 10 AM – 3 PM, busy at lunch; Wednesday opens at 1 PM.
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '10:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '15:00' } })
    click('+ Add a busy time (lunch, class…)')
    click('Send')

    expect(screen.getByLabelText('From')).toHaveValue('13:00')
    expect(screen.getByLabelText('To')).toHaveValue('15:00')
    expect(screen.queryByLabelText('Break 1 start')).not.toBeInTheDocument()
  })

  it("uses the date's own hours when the first date's times don't overlap them", () => {
    startPickup('Monday, October 19', 'Wednesday, October 21')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '11:00' } })
    click('Send')

    expect(screen.getByLabelText('From')).toHaveValue('13:00')
    expect(screen.getByLabelText('To')).toHaveValue('18:00')
  })

  it('starts the pickup dates fresh, then copies from the first pickup date', () => {
    renderCustomerLink({
      ...business,
      offerAppointments: false,
      handoffsTogether: true,
      turnaroundMinutes: 60,
    })
    click('Monday, October 19')
    click('Next')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '10:00' } })
    click('Send')

    click('Tuesday, October 20')
    click('Monday, October 26')
    click('Next')
    // First pickup date: the business's hours, not the drop-off's times.
    expect(screen.getByLabelText('From')).toHaveValue('09:00')
    expect(screen.getByLabelText('To')).toHaveValue('17:00')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '15:00' } })
    click('Send')
    // Second pickup date: copied from the first pickup date.
    expect(screen.getByLabelText('From')).toHaveValue('15:00')
    expect(screen.getByLabelText('To')).toHaveValue('17:00')
  })
})

describe('Contact details (backup: email and text)', () => {
  it('needs an email or phone before showing a link', () => {
    render(<App />)
    addBusinessHours('Monday', '09:00', '17:00')
    expect(screen.getByText('Add an email or phone to get a link.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Customer link')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Phone (for texts)'), {
      target: { value: '+1 (555) 123-4567' },
    })
    expect(screen.getByLabelText('Customer link')).toBeInTheDocument()
  })

  it('checks the email and phone once the business leaves the field', () => {
    render(<App />)
    addBusinessHours('Monday', '09:00', '17:00')
    const email = screen.getByLabelText('Email')
    fireEvent.change(email, { target: { value: 'not-an-email' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.blur(email)
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.')
    expect(screen.getByText('Fix the email or phone to get a link.')).toBeInTheDocument()

    fireEvent.change(email, { target: { value: 'owner@example.com' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    const phone = screen.getByLabelText('Phone (for texts)')
    fireEvent.change(phone, { target: { value: '123' } })
    fireEvent.blur(phone)
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid phone number.')
  })

  it('puts the email and phone into the link', () => {
    render(<App />)
    addEmail()
    fireEvent.change(screen.getByLabelText('Phone (for texts)'), { target: { value: '5551234567' } })
    addBusinessHours('Monday', '09:00', '17:00')
    const link = screen.getByLabelText('Customer link').value
    expect(decodeBusiness(new URL(link).searchParams.get('b'))).toMatchObject({
      contactEmail: 'owner@example.com',
      contactPhone: '5551234567',
    })
  })
})

describe('Customer page: sending the request', () => {
  const business = {
    name: 'Ryan Hall Bedding Service',
    contactEmail: 'owner@example.com',
    contactPhone: '+1 (555) 123-4567',
    hours: [{ day: 'Monday', start: '09:00', end: '17:00', breaks: [] }],
  }

  function bookPickup(details = business) {
    renderCustomerLink(details)
    click('Pickup')
    click('Monday, October 19')
    click('Next')
    click('Send')
    click('Mon Oct 19 9:00 AM – 9:05 AM')
  }

  it('ends with buttons to send the request by email or text', () => {
    bookPickup()
    click('Yes')
    fireEvent.change(screen.getByLabelText('Your comments'), { target: { value: 'Two beds.' } })
    click('Send')

    expect(
      screen.getByText(
        "Your request: Pickup on Mon Oct 19 9:00 AM – 9:05 AM. Thanks for your note. Send it to the business and they'll confirm your time.",
      ),
    ).toBeInTheDocument()

    const body = [
      'Booking request for Ryan Hall Bedding Service',
      'Pickup on Mon Oct 19 9:00 AM – 9:05 AM.',
      'Comments: Two beds.',
    ].join('\n')
    const email = screen.getByRole('link', { name: 'Send by email' })
    expect(email).toHaveAttribute(
      'href',
      `mailto:owner@example.com?subject=${encodeURIComponent('Booking request: Pickup')}&body=${encodeURIComponent(body)}`,
    )
    const text = screen.getByRole('link', { name: 'Send by text' })
    expect(text).toHaveAttribute('href', `sms:+15551234567?&body=${encodeURIComponent(body)}`)
  })

  it('thanks the customer once they tap a send button', () => {
    bookPickup()
    click('Skip')
    const email = screen.getByRole('link', { name: 'Send by email' })
    // Stop jsdom from trying to follow the mailto: link.
    email.addEventListener('click', (event) => event.preventDefault())
    fireEvent.click(email)
    fireEvent.click(email)
    expect(
      screen.getAllByText('Thanks! The business will confirm your time once they get your request.'),
    ).toHaveLength(1)
    // The buttons stay, in case the app didn't open.
    expect(screen.getByRole('link', { name: 'Send by email' })).toBeInTheDocument()
  })

  it('only shows the ways the business can be reached', () => {
    bookPickup({ ...business, contactPhone: '' })
    click('Skip')
    expect(screen.getByRole('link', { name: 'Send by email' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Send by text' })).not.toBeInTheDocument()
  })

  it('includes both times for a drop-off and pickup', () => {
    renderCustomerLink({
      ...business,
      offerAppointments: false,
      handoffsTogether: true,
      turnaroundMinutes: 60,
    })
    click('Monday, October 19')
    click('Next')
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '10:00' } })
    click('Send')
    click('Monday, October 19')
    click('Next')
    click('Send')
    click('Mon Oct 19 9:00 AM – 9:05 AM')
    click('Mon Oct 19 10:00 AM – 10:05 AM')
    click('Skip')
    const href = screen.getByRole('link', { name: 'Send by text' }).getAttribute('href')
    expect(decodeURIComponent(href)).toContain(
      'Drop-off on Mon Oct 19 9:00 AM – 9:05 AM and pickup on Mon Oct 19 10:00 AM – 10:05 AM.',
    )
  })
})
