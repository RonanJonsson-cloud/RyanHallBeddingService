import { Suspense, lazy, useState } from 'react'
import BusinessPage, { DEFAULT_SETTINGS } from './BusinessPage.jsx'
import CustomerPage from './CustomerPage.jsx'
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
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
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

// Amplify writes this file when it deploys the cloud backend (saved
// settings and real bookings). Without it, the app runs on its own, with
// everything carried in the share link.
const cloudOutputs = Object.values(
  import.meta.glob('../amplify_outputs.json', { eager: true, import: 'default' }),
)[0]
const CloudApp = lazy(() => import('./CloudApp.jsx'))

function App() {
  const code = new URLSearchParams(window.location.search).get(LINK_PARAM)
  if (code !== null) return <CustomerView code={code} />
  if (cloudOutputs) {
    return (
      <Suspense fallback={null}>
        <CloudApp outputs={cloudOutputs} />
      </Suspense>
    )
  }
  return <BusinessView />
}

export default App
