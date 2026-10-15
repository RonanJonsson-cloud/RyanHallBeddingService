import { useState } from 'react'
import BusinessPage from './BusinessPage.jsx'
import CustomerPage from './CustomerPage.jsx'
import { LINK_PARAM, decodeBusiness } from './shareLink.js'

// Opened from a customer link or QR code: show only that business's booking chat.
function CustomerView({ code }) {
  const business = decodeBusiness(code)

  if (!business) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>RHBScheduler</h1>
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
        <p className="tagline">Book a time · RHBScheduler</p>
      </header>
      <main className="content">
        <CustomerPage businessHours={business.hours} />
      </main>
    </div>
  )
}

// The front page: the business owner sets up their hours and shares a link.
function BusinessView() {
  // Kept in memory only: refreshing the page clears it.
  const [name, setName] = useState('Ryan Hall Bedding Service')
  const [businessHours, setBusinessHours] = useState([])

  return (
    <div className="app">
      <header className="app-header">
        <h1>RHBScheduler</h1>
        <p className="tagline">Set your hours, then share your booking link</p>
      </header>
      <main className="content">
        <BusinessPage
          name={name}
          onNameChange={setName}
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
