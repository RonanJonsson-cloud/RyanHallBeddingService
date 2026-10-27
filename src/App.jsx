import { useState } from 'react'
import BusinessPage from './BusinessPage.jsx'
import CustomerPage from './CustomerPage.jsx'
import { DEFAULT_APPOINTMENT_MINUTES, DEFAULT_TURNAROUND_MINUTES } from './scheduling.js'
import { LINK_PARAM, decodeBusiness } from './shareLink.js'

// Opened from a customer link or QR code: show only that business's booking chat.
function CustomerView({ code }) {
  const business = decodeBusiness(code)

  if (!business) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Kairo</h1>
        </header>
        <main className="content">
          <p className="card" role="alert">
            This booking link isn't valid. Please ask the business for a new link or QR code.
          </p>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>{business.name || 'Book a time'}</h1>
        <p className="tagline">Book a time · Kairo</p>
      </header>
      <main className="content">
        <CustomerPage business={business} />
      </main>
    </div>
  )
}

// The front page: the business owner sets up their hours and shares a link.
function BusinessView() {
  // Kept in memory only: refreshing the page clears it.
  const [settings, setSettings] = useState({
    name: 'Kairo',
    offerAppointments: true,
    appointmentMinutes: DEFAULT_APPOINTMENT_MINUTES,
    offerHandoffs: true,
    handoffsTogether: false,
    turnaroundMinutes: DEFAULT_TURNAROUND_MINUTES,
  })
  const [businessHours, setBusinessHours] = useState([])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Kairo</h1>
      </header>
      <main className="content">
        <BusinessPage
          settings={settings}
          onSettingsChange={setSettings}
          hours={businessHours}
          onChange={setBusinessHours}
        />
      </main>
    </div>
  )
}

function App() {
  const code = new URLSearchParams(window.location.search).get(LINK_PARAM)
  return code === null ? <BusinessView /> : <CustomerView code={code} />
}

export default App
