import { useState } from 'react'
import BusinessPage from './BusinessPage.jsx'
import CustomerPage from './CustomerPage.jsx'

function App() {
  const [page, setPage] = useState('business')
  // Kept in memory only: refreshing the page clears it.
  const [businessHours, setBusinessHours] = useState([])

  return (
    <div className="app">
      <header className="app-header">
        <h1>RHBScheduler</h1>
        <p className="tagline">Ryan Hall Bedding Service</p>
        <nav className="tabs" aria-label="Pages">
          <button
            type="button"
            className="tab"
            aria-pressed={page === 'business'}
            onClick={() => setPage('business')}
          >
            Business
          </button>
          <button
            type="button"
            className="tab"
            aria-pressed={page === 'customer'}
            onClick={() => setPage('customer')}
          >
            Customer
          </button>
        </nav>
      </header>

      <main className="content">
        {page === 'business' ? (
          <BusinessPage hours={businessHours} onChange={setBusinessHours} />
        ) : (
          <CustomerPage businessHours={businessHours} />
        )}
      </main>
    </div>
  )
}

export default App
