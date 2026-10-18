import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { decodeBusiness, encodeBusiness } from './shareLink.js'

function click(name) {
  fireEvent.click(screen.getByRole('button', { name }))
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

  it('adds a busy time while entering hours', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: 'Monday' } })
    click('+ Add a busy time (lunch, class…)')
    fireEvent.change(screen.getByLabelText('Break 1 start'), { target: { value: '12:00' } })
    fireEvent.change(screen.getByLabelText('Break 1 end'), { target: { value: '13:00' } })
    click('Add hours')

    const list = screen.getByRole('list', { name: 'Available hours' })
    expect(within(list).getByText('Busy 12:00 PM – 1:00 PM')).toBeInTheDocument()
  })

  it('adds and removes a busy time on hours already in the list', () => {
    render(<App />)
    addBusinessHours('Friday', '09:00', '17:00')

    click('Add busy time to Friday 9:00 AM – 5:00 PM')
    click('Save')
    const list = screen.getByRole('list', { name: 'Available hours' })
    expect(within(list).getByText('Busy 12:00 PM – 1:00 PM')).toBeInTheDocument()

    click('Remove busy time 12:00 PM – 1:00 PM from Friday 9:00 AM – 5:00 PM')
    expect(within(list).queryByText(/Busy/)).not.toBeInTheDocument()
  })

  it('rejects a busy time outside the hours', () => {
    render(<App />)
    click('+ Add a busy time (lunch, class…)')
    fireEvent.change(screen.getByLabelText('Break 1 start'), { target: { value: '18:00' } })
    fireEvent.change(screen.getByLabelText('Break 1 end'), { target: { value: '19:00' } })
    click('Add hours')

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Breaks must fall between 9:00 AM and 5:00 PM.',
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
    expect(screen.getByText("Customers can't book appointments.")).toBeInTheDocument()
  })

  it('warns and hides the link when nothing can be booked', () => {
    render(<App />)
    addBusinessHours('Monday', '09:00', '17:00')
    fireEvent.click(screen.getByLabelText('Offer appointments'))
    fireEvent.click(screen.getByLabelText('Offer pickups and drop-offs'))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Turn on appointments or pickups and drop-offs',
    )
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
    expect(screen.getByText("Customers can't book pickups or drop-offs.")).toBeInTheDocument()
    expect(
      screen.queryByLabelText('Schedule drop-off and pickup together'),
    ).not.toBeInTheDocument()
  })

  it('puts the settings into the customer link', () => {
    render(<App />)
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
    expect(
      screen.getByText(
        /Pickups will be at least 1 day 6 hours after the drop-off, not counting days you're closed\./,
      ),
    ).toBeInTheDocument()

    // Boxes can't go past their limits.
    fireEvent.change(days, { target: { value: '40' } })
    expect(days).toHaveValue(28)
    fireEvent.change(hours, { target: { value: '30' } })
    expect(hours).toHaveValue(23)
  })

  it('rejects gaps under 1 hour or over 28 days, and hides the link', () => {
    render(<App />)
    addBusinessHours('Monday', '09:00', '17:00')
    fireEvent.click(screen.getByLabelText('Schedule drop-off and pickup together'))

    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '0' } })
    expect(screen.getByRole('alert')).toHaveTextContent('at least 1 hour')
    expect(screen.queryByLabelText('Customer link')).not.toBeInTheDocument()
    expect(screen.getByText(/Fix the minimum time between drop-off and pickup/))
      .toBeInTheDocument()

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
      screen.getByText('Add your hours above to get a customer link and QR code.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Customer link')).not.toBeInTheDocument()
  })

  it('creates a link and QR code that open this business on the customer page', () => {
    const { unmount } = render(<App />)
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

  it('says so when nothing matches', () => {
    renderCustomerLink(business)
    click('Drop-off')
    click('Monday, October 19')
    click('Next')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '18:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '20:00' } })
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
        "Now select available dates for your pickup. It must be at least 3 hours after your drop-off, not counting days we're closed.",
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
    // Pickups come from the pickup availability, at least 3 hours after 11:50 AM.
    expect(screen.getByRole('button', { name: 'Mon Oct 19 3:00 PM – 3:05 PM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mon Oct 19 4:00 PM – 4:05 PM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mon Oct 19 4:45 PM – 4:50 PM' })).toBeInTheDocument()

    click('Mon Oct 19 4:00 PM – 4:05 PM')
    click('Skip')
    expect(
      screen.getByText(
        /You're all set: Drop-off on Mon Oct 19 11:45 AM – 11:50 AM and pickup on Mon Oct 19 4:00 PM – 4:05 PM/,
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
