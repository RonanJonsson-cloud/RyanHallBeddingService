import { useCallback, useEffect, useState } from 'react'
import { Amplify } from 'aws-amplify'
import { generateClient } from 'aws-amplify/data'
import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import BusinessPage, { DEFAULT_SETTINGS, withIds } from './BusinessPage.jsx'
import CustomerPage from './CustomerPage.jsx'
import SharePanel from './SharePanel.jsx'
import { PAIRED_SERVICE, formatDate, formatRange, timelineMinutes, turnaroundError } from './scheduling.js'
import { decodeBusiness, encodeBusiness } from './shareLink.js'

// The app with its cloud backend: business owners sign in and save their
// settings under a permanent link (?id=...), and customers' bookings are
// saved, so no two customers can book the same time.

const BUSINESS_PARAM = 'id'
// Customers don't sign in.
const GUEST = { authMode: 'identityPool' }
const BOOKING_FAILED = "Sorry, something went wrong and your time wasn't booked."

let client = null
function connect(outputs) {
  if (!client) {
    Amplify.configure(outputs)
    client = generateClient()
  }
  return client
}

function Layout({ title, tagline, children }) {
  return (
    <div className="app">
      <header className="app-header">
        <h1>{title}</h1>
        {tagline && <p className="tagline">{tagline}</p>}
      </header>
      <main className="content">{children}</main>
    </div>
  )
}

function readSlots(json) {
  try {
    const slots = typeof json === 'string' ? JSON.parse(json) : json
    return Array.isArray(slots) ? slots : []
  } catch {
    return []
  }
}

function startOf(booking) {
  const first = booking.slots[0]
  return first ? timelineMinutes(first.date, first.start) : 0
}

function contactLink(contact) {
  return contact.includes('@') ? `mailto:${contact}` : `tel:${contact.replace(/[^\d+]/g, '')}`
}

function slotName(booking, index) {
  if (booking.service !== PAIRED_SERVICE) return booking.service
  return index === 0 ? 'Drop-off' : 'Pickup'
}

// Everything customers have booked, soonest first, with a way to cancel.
function BookingsList({ db }) {
  const [bookings, setBookings] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const found = []
    let nextToken = null
    do {
      const page = await db.models.Booking.list({ nextToken })
      if (page.errors?.length) {
        setError("Couldn't load bookings. Please try again.")
        return
      }
      found.push(...page.data)
      nextToken = page.nextToken
    } while (nextToken)
    setError('')
    setBookings(
      found.map((booking) => ({ ...booking, slots: readSlots(booking.slots) })).sort(
        (a, b) => startOf(a) - startOf(b),
      ),
    )
  }, [db])

  useEffect(() => {
    load()
  }, [load])

  async function cancel(booking) {
    if (!window.confirm(`Cancel ${booking.name}'s booking? This frees up the time.`)) return
    const { data, errors } = await db.mutations.cancelBooking({ id: booking.id })
    if (errors?.length || !data?.ok) {
      setError(data?.message || "Couldn't cancel. Please try again.")
      return
    }
    load()
  }

  return (
    <section className="card">
      <h2>Bookings</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {bookings === null ? (
        !error && <p className="hint">Loading…</p>
      ) : bookings.length === 0 ? (
        <p className="hint">No bookings yet.</p>
      ) : (
        <ul className="hours-list" aria-label="Bookings">
          {bookings.map((booking) => (
            <li key={booking.id} className="hours-item">
              {booking.slots.map((slot, index) => (
                <div key={index}>
                  <strong>{slotName(booking, index)}</strong> {formatDate(slot.date)}{' '}
                  {formatRange(slot)}
                </div>
              ))}
              <div>
                {booking.name} · <a href={contactLink(booking.contact)}>{booking.contact}</a>
              </div>
              {booking.comments && <p className="note">“{booking.comments}”</p>}
              <button type="button" className="button small" onClick={() => cancel(booking)}>
                Cancel booking
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="button link small" onClick={load}>
        Refresh
      </button>
    </section>
  )
}

// The signed-in owner's page: the usual settings, saved to the cloud.
function OwnerPage({ db, user, signOut }) {
  // undefined while loading, null until the first save.
  const [record, setRecord] = useState(undefined)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [hours, setHours] = useState([])
  const [savedConfig, setSavedConfig] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    db.models.Business.list().then(({ data, errors }) => {
      if (!active) return
      if (errors?.length) {
        setError("Couldn't load your settings. Please refresh the page.")
        return
      }
      const found = data[0] ?? null
      const saved = found && decodeBusiness(found.config)
      if (saved) {
        const { hours: savedHours, ...savedSettings } = saved
        setSettings(savedSettings)
        setHours(withIds(savedHours))
        setSavedConfig(found.config)
      }
      setRecord(found)
    })
    return () => {
      active = false
    }
  }, [db])

  if (record === undefined) {
    return error ? (
      <p className="error" role="alert">
        {error}
      </p>
    ) : (
      <p className="hint">Loading your settings…</p>
    )
  }

  const config = encodeBusiness({ ...settings, hours })
  const unsaved = config !== savedConfig
  const invalid =
    settings.offerHandoffs && settings.handoffsTogether && turnaroundError(settings.turnaroundMinutes)
  const link = record && `${window.location.origin}${window.location.pathname}?${BUSINESS_PARAM}=${record.id}`

  async function save() {
    setSaving(true)
    setError('')
    const { data, errors } = record
      ? await db.models.Business.update({ id: record.id, config })
      : await db.models.Business.create({ config })
    setSaving(false)
    if (errors?.length || !data) {
      setError("Couldn't save. Please try again.")
      return
    }
    setRecord(data)
    setSavedConfig(config)
  }

  const share = (
    <>
      <section className="card">
        <h2>Save your settings</h2>
        <p className="hint">
          {!unsaved
            ? 'All changes saved.'
            : record
              ? 'You have unsaved changes. Customers see your last saved settings.'
              : 'Save to get your customer link.'}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="button primary"
          disabled={!unsaved || saving || Boolean(invalid)}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </section>
      {record && (
        <SharePanel
          business={{ ...settings, hours }}
          link={link}
          note="Your link and QR code stay the same when you save changes."
        />
      )}
      <BookingsList db={db} />
    </>
  )

  return (
    <>
      <p className="note">
        Signed in as {user?.signInDetails?.loginId ?? 'you'}.{' '}
        <button type="button" className="button link small" onClick={signOut}>
          Sign out
        </button>
      </p>
      <BusinessPage
        settings={settings}
        onSettingsChange={setSettings}
        hours={hours}
        onChange={setHours}
        share={share}
      />
    </>
  )
}

// Opened from a business's permanent link or QR code.
function CustomerView({ db, id }) {
  // undefined while loading, null if the link doesn't match a business.
  const [business, setBusiness] = useState(undefined)
  const [taken, setTaken] = useState(null)

  const loadTaken = useCallback(async () => {
    try {
      const { data, errors } = await db.queries.busyTimes({ businessId: id }, GUEST)
      setTaken(errors?.length || !data ? [] : data.filter(Boolean))
    } catch {
      setTaken([])
    }
  }, [db, id])

  useEffect(() => {
    db.models.Business.get({ id }, GUEST)
      .then(({ data }) => setBusiness((data && decodeBusiness(data.config)) || null))
      .catch(() => setBusiness(null))
    loadTaken()
  }, [db, id, loadTaken])

  async function book(request) {
    const { data, errors } = await db.mutations.book(
      { businessId: id, ...request, slots: JSON.stringify(request.slots) },
      GUEST,
    )
    // Either way, the taken times may have changed.
    loadTaken()
    if (errors?.length || !data) return { ok: false, message: BOOKING_FAILED }
    return data
  }

  if (business === undefined || taken === null) {
    return (
      <Layout title="Book a time">
        <p className="hint">Loading…</p>
      </Layout>
    )
  }

  if (!business) {
    return (
      <Layout title="Kairo">
        <p className="card" role="alert">
          This booking link isn't valid. Please ask the business for a new link or QR code.
        </p>
      </Layout>
    )
  }

  return (
    <Layout title={business.name || 'Book a time'} tagline="Book a time · Kairo">
      <CustomerPage business={business} taken={taken} onBook={book} />
    </Layout>
  )
}

// Shown above the sign-in and create-account forms.
const SIGN_IN_COMPONENTS = {
  Header() {
    return (
      <div className="auth-caption">
        <h2>Business sign-in</h2>
      </div>
    )
  },
}

// Email and password boxes have labels but no placeholder text inside.
// (Signing in with an email uses the "username" field.)
const SIGN_IN_FIELDS = {
  signIn: {
    username: { placeholder: '' },
    password: { placeholder: '' },
  },
  forgotPassword: {
    username: { placeholder: '' },
  },
  signUp: {
    email: { placeholder: '' },
    password: { label: 'Create password', placeholder: '' },
    confirm_password: { label: 'Confirm password', placeholder: '' },
  },
}

function CloudApp({ outputs }) {
  const db = connect(outputs)
  const id = new URLSearchParams(window.location.search).get(BUSINESS_PARAM)
  if (id) return <CustomerView db={db} id={id} />
  return (
    <Layout title="Kairo">
      <Authenticator components={SIGN_IN_COMPONENTS} formFields={SIGN_IN_FIELDS}>
        {({ signOut, user }) => <OwnerPage db={db} user={user} signOut={signOut} />}
      </Authenticator>
    </Layout>
  )
}

export default CloudApp
