import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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

afterEach(() => {
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
    expect(
      screen.queryByLabelText('Minimum time between drop-off and pickup'),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Schedule drop-off and pickup together'))
    expect(screen.getByLabelText('Minimum time between drop-off and pickup')).toHaveValue('180')

    fireEvent.click(offer)
    expect(screen.getByText("Customers can't book pickups or drop-offs.")).toBeInTheDocument()
    expect(
      screen.queryByLabelText('Schedule drop-off and pickup together'),
    ).not.toBeInTheDocument()
  })

  it('puts the settings into the customer link', () => {
    render(<App />)
    fireEvent.click(screen.getByLabelText('Schedule drop-off and pickup together'))
    fireEvent.change(screen.getByLabelText('Minimum time between drop-off and pickup'), {
      target: { value: '1440' },
    })
    addBusinessHours('Monday', '09:00', '17:00')

    const link = screen.getByLabelText('Customer link').value
    expect(decodeBusiness(new URL(link).searchParams.get('b'))).toMatchObject({
      offerHandoffs: true,
      handoffsTogether: true,
      turnaroundMinutes: 1440,
    })
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
    click('Tuesday')
    click('Next')
    click('Send')
    expect(screen.getByText(/The earliest day that works is Tuesday/)).toBeInTheDocument()
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
    expect(screen.getByText(/^Appointments take 30 minutes\./)).toBeInTheDocument()
    click('Wednesday')
    click('Monday')
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
        'The earliest day that works is Monday. Here are 3 times across that day for your appointment:',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday 9:00 AM – 9:30 AM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday 1:30 PM – 2:00 PM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday 4:30 PM – 5:00 PM' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Wednesday/ })).not.toBeInTheDocument()

    click('Monday 1:30 PM – 2:00 PM')
    expect(
      screen.getByText(/You're all set: Appointment on Monday 1:30 PM – 2:00 PM/),
    ).toBeInTheDocument()
  })

  it('suggests 5-minute slots for a pickup', () => {
    renderCustomerLink(business)
    click('Pickup')
    expect(screen.getByText(/^Pickups take 5 minutes\./)).toBeInTheDocument()
    click('Monday')
    click('Next')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '17:00' } })
    click('+ Add a busy time (lunch, class…)')
    click('Send')

    expect(screen.getByRole('button', { name: 'Monday 9:00 AM – 9:05 AM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday 1:30 PM – 1:35 PM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday 4:45 PM – 4:50 PM' })).toBeInTheDocument()
  })

  it("uses the business's appointment length", () => {
    renderCustomerLink({
      name: 'Ryan Hall Bedding Service',
      appointmentMinutes: 60,
      hours: [{ day: 'Tuesday', start: '09:00', end: '12:00', breaks: [] }],
    })
    click('Appointment')
    expect(screen.getByText(/^Appointments take 1 hour\./)).toBeInTheDocument()
    click('Tuesday')
    click('Next')
    click('Send')

    expect(screen.getByRole('button', { name: 'Tuesday 9:00 AM – 10:00 AM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tuesday 10:00 AM – 11:00 AM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tuesday 11:00 AM – 12:00 PM' })).toBeInTheDocument()
  })

  it('says so when nothing matches', () => {
    renderCustomerLink(business)
    click('Drop-off')
    click('Friday')
    click('Next')
    click('Send')

    expect(screen.getByText(/none of those times line up/)).toBeInTheDocument()
  })

  it('says so when the link has no hours', () => {
    renderCustomerLink({ name: 'Ryan Hall Bedding Service', hours: [] })
    click('Appointment')
    click('Monday')
    click('Next')
    click('Send')

    expect(screen.getByText(/hasn't posted any hours yet/)).toBeInTheDocument()
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
      screen.getByText(/^Hi! I'll help you book an appointment\. Appointments take 1 hour\./),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pickup' })).not.toBeInTheDocument()

    click('Monday')
    click('Next')
    click('Send')
    expect(screen.getByRole('button', { name: 'Monday 9:00 AM – 10:00 AM' })).toBeInTheDocument()

    click('Start over')
    expect(screen.getByRole('button', { name: 'Monday' })).toBeInTheDocument()
  })
})

describe('Customer page: drop-off and pickup together', () => {
  const business = {
    name: 'Ryan Hall Bedding Service',
    offerHandoffs: true,
    handoffsTogether: true,
    turnaroundMinutes: 180,
    hours: [{ day: 'Monday', start: '09:00', end: '17:00', breaks: [] }],
  }

  it('makes the customer book a drop-off and then a later pickup', () => {
    renderCustomerLink(business)
    expect(screen.queryByRole('button', { name: 'Pickup' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Drop-off' })).not.toBeInTheDocument()

    click('Drop-off & pickup')
    expect(
      screen.getByText(/^You'll book a drop-off first, then a pickup at least 3 hours later\./),
    ).toBeInTheDocument()
    click('Monday')
    click('Next')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '17:00' } })
    click('Send')

    expect(screen.getByText(/^First, your drop-off\. The earliest day that works is Monday/))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday 9:00 AM – 9:05 AM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday 11:15 AM – 11:20 AM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday 1:30 PM – 1:35 PM' })).toBeInTheDocument()

    click('Monday 11:15 AM – 11:20 AM')
    expect(screen.getByText(/^Now your pickup, at least 3 hours after your drop-off\./))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday 2:30 PM – 2:35 PM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday 3:45 PM – 3:50 PM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday 4:45 PM – 4:50 PM' })).toBeInTheDocument()

    click('Monday 3:45 PM – 3:50 PM')
    expect(
      screen.getByText(
        /You're all set: Drop-off on Monday 11:15 AM – 11:20 AM and pickup on Monday 3:45 PM – 3:50 PM/,
      ),
    ).toBeInTheDocument()
  })

  it('says so when there is no room for both', () => {
    renderCustomerLink(business)
    click('Drop-off & pickup')
    click('Monday')
    click('Next')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '11:00' } })
    click('Send')

    expect(
      screen.getByText(/couldn't fit a drop-off and a pickup at least 3 hours apart/),
    ).toBeInTheDocument()
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
      screen.getByText(/^Hi! I'll help you book a drop-off and pickup\. You'll book a drop-off first/),
    ).toBeInTheDocument()

    click('Monday')
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
