import { useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { availableServices } from './scheduling.js'
import { customerLink } from './shareLink.js'

const DOWNLOAD_SIZE = 1024

function fileNameFor(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug || 'business'}-booking-qr.png`
}

// Draws the on-screen QR code (an SVG) onto a large canvas and saves it as
// a PNG, which is easy to print or drop into a flyer.
function downloadPng(svg, fileName) {
  const markup = new XMLSerializer().serializeToString(svg)
  const image = new Image()
  image.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = DOWNLOAD_SIZE
    canvas.height = DOWNLOAD_SIZE
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, DOWNLOAD_SIZE, DOWNLOAD_SIZE)
    context.drawImage(image, 0, 0, DOWNLOAD_SIZE, DOWNLOAD_SIZE)
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
}

function SharePanel({ business }) {
  const { name, hours } = business
  const [copied, setCopied] = useState(false)
  const qrRef = useRef(null)
  const inputRef = useRef(null)

  if (hours.length === 0) {
    return (
      <section className="card share">
        <h2>Share with customers</h2>
        <p className="hint">Add your hours above to get a customer link and QR code.</p>
      </section>
    )
  }

  if (availableServices(business).length === 0) {
    return (
      <section className="card share">
        <h2>Share with customers</h2>
        <p className="hint">
          Turn on appointments or pickups and drop-offs above to get a customer link and QR code.
        </p>
      </section>
    )
  }

  const link = customerLink(business)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: select the text so it can be copied by hand.
      inputRef.current?.select()
    }
  }

  return (
    <section className="card share">
      <h2>Share with customers</h2>
      <p className="hint">
        Customers who open this link or scan this code go straight to your booking chat.
      </p>

      <div className="qr" ref={qrRef}>
        <QRCodeSVG
          value={link}
          size={200}
          level="M"
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#000000"
          title={`QR code for ${name || 'your'} booking link`}
        />
      </div>

      <label className="field">
        Customer link
        <input ref={inputRef} type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
      </label>

      <div className="share-actions">
        <button type="button" className="button primary" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy link'}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => downloadPng(qrRef.current.querySelector('svg'), fileNameFor(name))}
        >
          Download QR code
        </button>
        <a className="button" href={link} target="_blank" rel="noreferrer">
          Preview customer page
        </a>
      </div>

      <p className="note">
        Your hours and settings are built into this link. If you change them, share
        the new link or QR code — older ones keep showing the old settings.
      </p>
    </section>
  )
}

export default SharePanel
