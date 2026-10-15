import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App.jsx'
import { encodeBusiness } from './shareLink.js'

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
    addBusinessHours('Tuesday', '10:00', '14:00')

    const link = screen.getByLabelText('Customer link').value
    expect(link).toMatch(/^http:\/\/localhost(:\d+)?\/\?b=[\w-]+$/)
    expect(screen.getByTitle("QR code for Ryan's Laundry booking link")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Preview customer page' })).toHaveAttribute(
      'href',
      link,
    )

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
    click('Pickup')
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
        'The earliest day that works is Monday. Here are 3 times across that day for your pickup:',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday 9:00 AM – 9:30 AM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday 1:30 PM – 2:00 PM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monday 4:30 PM – 5:00 PM' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Wednesday/ })).not.toBeInTheDocument()

    click('Monday 1:30 PM – 2:00 PM')
    expect(
      screen.getByText(/You're all set: Pickup on Monday 1:30 PM – 2:00 PM/),
    ).toBeInTheDocument()
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
