import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeBusiness } from './shareLink.js'

// The cloud version of the app, with a pretend backend in place of AWS.

const backend = vi.hoisted(() => ({
  businesses: [],
  bookings: [],
  taken: [],
  calls: [],
}))

vi.mock('aws-amplify', () => ({ Amplify: { configure: vi.fn() } }))

vi.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      Business: {
        list: async () => ({ data: backend.businesses }),
        get: async ({ id }) => ({ data: backend.businesses.find((b) => b.id === id) ?? null }),
        create: async ({ config }) => {
          const record = { id: 'new-biz', config }
          backend.businesses.push(record)
          backend.calls.push(['create', config])
          return { data: record }
        },
        update: async ({ id, config }) => {
          backend.calls.push(['update', id, config])
          return { data: { id, config } }
        },
      },
      Booking: { list: async () => ({ data: backend.bookings, nextToken: null }) },
    },
    queries: {
      busyTimes: async () => ({ data: backend.taken }),
      readAvailability: async (args, options) => {
        backend.calls.push(['readAvailability', args, options])
        return { data: backend.availability }
      },
    },
    mutations: {
      book: async (args, options) => {
        backend.calls.push(['book', args, options])
        return { data: { ok: true, message: '' } }
      },
      cancelBooking: async (args) => {
        backend.calls.push(['cancel', args])
        backend.bookings = []
        return { data: { ok: true, message: '' } }
      },
    },
  }),
}))

vi.mock('@aws-amplify/ui-react', () => ({
  // Signed in straight away; also shows the caption and records the fields.
  Authenticator: ({ children, components, formFields }) => {
    backend.formFields = formFields
    return (
      <>
        {components.Header()}
        {children({ signOut: vi.fn(), user: { signInDetails: { loginId: 'owner@example.com' } } })}
      </>
    )
  },
}))

const { default: CloudApp } = await import('./CloudApp.jsx')

function click(name) {
  fireEvent.click(screen.getByRole('button', { name }))
}

const hours = [{ day: 'Monday', start: '09:00', end: '10:00', breaks: [] }]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 19, 8, 0))
  backend.businesses = []
  backend.bookings = []
  backend.taken = []
  backend.calls = []
})

afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState({}, '', '/')
})

describe('Cloud app: business owner', () => {
  it('labels the sign-in page as the business sign-in', async () => {
    render(<CloudApp outputs={{}} />)
    expect(screen.getByRole('heading', { name: 'Business sign-in' })).toBeInTheDocument()
    expect(backend.formFields.signUp.password.label).toBe('Create password')
    expect(backend.formFields.signUp.confirm_password.label).toBe('Confirm password')
    expect(backend.formFields.signUp.password.placeholder).toBe('')
    expect(backend.formFields.signIn.password.placeholder).toBe('')
    expect(backend.formFields.signIn.username.placeholder).toBe('')
    expect(backend.formFields.signUp.email.placeholder).toBe('')
    await screen.findByText(/Signed in as/)
  })

  it('saves new settings and then shows a permanent link', async () => {
    render(<CloudApp outputs={{}} />)
    expect(await screen.findByText(/Signed in as owner@example.com/)).toBeInTheDocument()
    expect(screen.getByText('Save to get your customer link.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Customer link')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Day'), { target: { value: 'Monday' } })
    click('Add hours')
    click('Save')

    expect(await screen.findByText('All changes saved.')).toBeInTheDocument()
    expect(screen.getByLabelText('Customer link').value).toBe('http://localhost:3000/?id=new-biz')
    expect(backend.calls[0][0]).toBe('create')
  })

  it('loads saved settings and lists bookings', async () => {
    backend.businesses = [{ id: 'biz', config: encodeBusiness({ name: 'Saved Name', hours }) }]
    backend.bookings = [
      {
        id: 'b1',
        service: 'Appointment',
        slots: JSON.stringify([{ date: '2026-10-19', start: '09:00', end: '09:30' }]),
        name: 'Sam',
        contact: 'sam@example.com',
        comments: 'Side door',
      },
    ]
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<CloudApp outputs={{}} />)

    expect(await screen.findByDisplayValue('Saved Name')).toBeInTheDocument()
    expect(screen.getByText('All changes saved.')).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Bookings' })
    expect(within(list).getByText(/Mon Oct 19 9:00 AM – 9:30 AM/)).toBeInTheDocument()
    expect(within(list).getByRole('link', { name: 'sam@example.com' })).toHaveAttribute(
      'href',
      'mailto:sam@example.com',
    )
    expect(within(list).getByText('“Side door”')).toBeInTheDocument()

    click('Cancel booking')
    expect(await screen.findByText('No bookings yet.')).toBeInTheDocument()
    expect(backend.calls).toContainEqual(['cancel', { id: 'b1' }])
  })
})

describe('Cloud app: customer', () => {
  it('books through the permanent link as a guest', async () => {
    backend.businesses = [{ id: 'biz', config: encodeBusiness({ name: 'Saved Name', hours }) }]
    backend.taken = [{ date: '2026-10-19', start: '09:00', end: '09:30' }]
    window.history.replaceState({}, '', '/?id=biz')
    render(<CloudApp outputs={{}} />)

    expect(await screen.findByRole('heading', { name: 'Saved Name' })).toBeInTheDocument()
    click('Appointment')
    click('Monday, October 19')
    click('Next')
    click('Send')
    click('Mon Oct 19 9:30 AM – 10:00 AM')
    click('Skip')
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sam' } })
    fireEvent.change(screen.getByLabelText('Email or phone'), { target: { value: 'sam@example.com' } })
    click('Book')

    expect(await screen.findByText(/You're booked/)).toBeInTheDocument()
    const [, args, options] = backend.calls.find(([name]) => name === 'book')
    expect(args).toMatchObject({ businessId: 'biz', service: 'Appointment', name: 'Sam' })
    expect(JSON.parse(args.slots)).toEqual([{ date: '2026-10-19', start: '09:30', end: '10:00' }])
    expect(options).toEqual({ authMode: 'identityPool' })
  })

  it("asks the assistant about the customer's own words, keeping only usable times", async () => {
    backend.businesses = [{ id: 'biz', config: encodeBusiness({ name: 'Saved Name', hours }) }]
    backend.availability = {
      ok: true,
      message: '',
      ranges: JSON.stringify([
        { date: '2026-10-19', start: '09:00', end: '12:00', breaks: [] },
        { date: '2027-01-04', start: '09:00', end: '12:00', breaks: [] },
      ]),
    }
    window.history.replaceState({}, '', '/?id=biz')
    render(<CloudApp outputs={{}} />)

    await screen.findByRole('button', { name: 'Appointment' })
    click('Appointment')
    fireEvent.change(screen.getByLabelText("Or tell me when you're free"), { target: { value: 'Monday morning' } })
    click('Find times')

    expect(await screen.findByText("Got it. You're free Mon Oct 19 9:00 AM – 12:00 PM.")).toBeInTheDocument()
    const [, args, options] = backend.calls.find(([name]) => name === 'readAvailability')
    expect(args).toEqual({ text: 'Monday morning', today: '2026-10-19', firstDate: '2026-10-19', days: 28 })
    expect(options).toEqual({ authMode: 'identityPool' })
  })

  it("passes on the assistant's message when it can't help", async () => {
    backend.businesses = [{ id: 'biz', config: encodeBusiness({ name: 'Saved Name', hours }) }]
    backend.availability = { ok: false, message: 'Busy today.', ranges: '[]' }
    window.history.replaceState({}, '', '/?id=biz')
    render(<CloudApp outputs={{}} />)

    await screen.findByRole('button', { name: 'Appointment' })
    click('Appointment')
    fireEvent.change(screen.getByLabelText("Or tell me when you're free"), { target: { value: 'mornings' } })
    click('Find times')
    expect(await screen.findByText('Busy today.')).toBeInTheDocument()
  })

  it('explains when the link matches no business', async () => {
    window.history.replaceState({}, '', '/?id=missing')
    render(<CloudApp outputs={{}} />)
    expect(await screen.findByText(/This booking link isn't valid/)).toBeInTheDocument()
  })
})
