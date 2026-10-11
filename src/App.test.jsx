import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App.jsx'

describe('App', () => {
  it('shows the app name', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'Ryan Hall Bedding Service' }),
    ).toBeInTheDocument()
  })

  it('shows the description', () => {
    render(<App />)
    expect(screen.getByText(/schedule and pay for bed washing/i)).toBeInTheDocument()
  })

  it('shows Coming Soon', () => {
    render(<App />)
    expect(screen.getByText('Coming Soon')).toBeInTheDocument()
  })
})
