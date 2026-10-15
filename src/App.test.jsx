import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App.jsx'

function click(name) {
  fireEvent.click(screen.getByRole('button', { name }))
}

function addBusinessHours(day, start, end) {
  fireEvent.change(screen.getByLabelText('Day'), { target: { value: day } })
  fireEvent.change(screen.getByLabelText('Start time'), { target: { value: start } })
  fireEvent.change(screen.getByLabelText('End time'), { target: { value: end } })
  click('Add hours')
}

describe('App', () => {
  it('shows the app name and both pages', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'RHBScheduler' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Business' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Customer' })).toBeInTheDocument()
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

describe('Customer page', () => {
  it('walks through the chat and suggests times across the earliest matching day', () => {
    render(<App />)
    addBusinessHours('Monday', '09:00', '17:00')
    addBusinessHours('Wednesday', '09:00', '17:00')

    click('Customer')
    click('Pickup')
    click('Wednesday')
    click('Monday')
    click('Next')

    // Monday: free 9 AM – 5 PM, but busy 12 – 1 for lunch.
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '17:00' } })
    click('+ Add a busy time (lunch, class…)')
    fireEvent.change(screen.getByLabelText('Break 1 start'), { target: { value: '12:00' } })
    fireEvent.change(screen.getByLabelText('Break 1 end'), { target: { value: '13:00' } })
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
    render(<App />)
    addBusinessHours('Monday', '09:00', '12:00')

    click('Customer')
    click('Drop-off')
    click('Friday')
    click('Next')
    click('Send')

    expect(screen.getByText(/none of those times line up/)).toBeInTheDocument()
  })

  it('says so when the business has no hours yet', () => {
    render(<App />)
    click('Customer')
    click('Appointment')
    click('Monday')
    click('Next')
    click('Send')

    expect(screen.getByText(/hasn't posted any hours yet/)).toBeInTheDocument()
  })
})
