import { useEffect, useRef, useState } from 'react'
import BreaksEditor from './BreaksEditor.jsx'
import DatePicker from './DatePicker.jsx'
import {
  DEFAULT_APPOINTMENT_MINUTES,
  DEFAULT_TURNAROUND_MINUTES,
  HANDOFF_MINUTES,
  PAIRED_SERVICE,
  availableServices,
  formatDate,
  formatDuration,
  formatRange,
  formatRangeWithBreaks,
  nowOnTimeline,
  rangeError,
  serviceMinutes,
  suggestDropOffs,
  suggestPickups,
  suggestSlots,
  toDateString,
} from './scheduling.js'

const GREETING = {
  from: 'bot',
  text: "Hi! I'll help you find a time. What do you need?",
}

const DATES_QUESTION =
  'Which dates work for you? Tap all that work, then press Next. Greyed-out dates are when the business is closed.'
const COMMENTS_QUESTION = 'Anything else we should know?'
const MAX_COMMENT_LENGTH = 500

function slotLabel(slot) {
  return `${formatDate(slot.date)} ${formatRange(slot)}`
}

// "Appointments take 45 minutes." and friends.
function serviceIntro(service, { appointmentMinutes, turnaroundMinutes }) {
  if (service === PAIRED_SERVICE) {
    return `You'll book a drop-off first, then a pickup at least ${formatDuration(
      turnaroundMinutes,
    )} later. Each takes ${formatDuration(HANDOFF_MINUTES)}.`
  }
  const plural = service === 'Appointment' ? 'Appointments' : `${service}s`
  return `${plural} take ${formatDuration(serviceMinutes(service, appointmentMinutes))}.`
}

function matchesText(matches, what) {
  return matches.length === 1
    ? `The earliest day that works is ${formatDate(matches[0].date)}. I found 1 time for your ${what}:`
    : `The earliest day that works is ${formatDate(matches[0].date)}. Here are ${matches.length} times across that day for your ${what}:`
}

const SERVICE_NAMES = {
  Appointment: 'an appointment',
  [PAIRED_SERVICE]: 'a drop-off and pickup',
}

// With only one service on offer, skip straight to asking for dates.
function startingChat(services, settings, hasHours) {
  if (!hasHours) {
    return {
      messages: [
        {
          from: 'bot',
          text: "This business hasn't posted any hours yet. Please check back soon.",
        },
      ],
      step: 'done',
      service: '',
    }
  }
  if (services.length === 0) {
    return {
      messages: [{ from: 'bot', text: "Sorry, this business isn't taking bookings right now." }],
      step: 'done',
      service: '',
    }
  }
  if (services.length === 1) {
    const service = services[0]
    const name = SERVICE_NAMES[service] ?? `a ${service.toLowerCase()}`
    return {
      messages: [
        {
          from: 'bot',
          text: `Hi! I'll help you book ${name}. ${serviceIntro(service, settings)} ${DATES_QUESTION}`,
        },
      ],
      step: 'dates',
      service,
    }
  }
  return { messages: [GREETING], step: 'service', service: '' }
}

function TimeRangeForm({ label, onSubmit }) {
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('12:00')
  const [breaks, setBreaks] = useState([])
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const message = rangeError(start, end, breaks)
    if (message) {
      setError(message)
      return
    }
    onSubmit(start, end, breaks)
  }

  return (
    <form className="card" onSubmit={handleSubmit} aria-label={`Times for ${label}`}>
      <div className="field-row">
        <label className="field">
          From
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          To
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <BreaksEditor breaks={breaks} onChange={setBreaks} rangeStart={start} rangeEnd={end} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button primary">
        Send
      </button>
    </form>
  )
}

function CommentForm({ onSubmit }) {
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = comment.trim()
    if (!trimmed) {
      setError('Please type a comment, or tap Start over to begin again.')
      return
    }
    onSubmit(trimmed)
  }

  return (
    <form className="card" onSubmit={handleSubmit} aria-label="Comments">
      <label className="field">
        Your comments
        <textarea
          rows={4}
          value={comment}
          maxLength={MAX_COMMENT_LENGTH}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button primary">
        Send
      </button>
    </form>
  )
}

function CustomerPage({ business }) {
  const {
    hours: businessHours,
    offerAppointments = true,
    appointmentMinutes = DEFAULT_APPOINTMENT_MINUTES,
    offerHandoffs = true,
    handoffsTogether = false,
    turnaroundMinutes = DEFAULT_TURNAROUND_MINUTES,
  } = business
  const settings = { appointmentMinutes, turnaroundMinutes }
  const services = availableServices({ offerAppointments, offerHandoffs, handoffsTogether })

  const [initial] = useState(() => startingChat(services, settings, businessHours.length > 0))
  const [messages, setMessages] = useState(initial.messages)
  const [step, setStep] = useState(initial.step)
  const [service, setService] = useState(initial.service)
  const [dates, setDates] = useState([])
  const [dateIndex, setDateIndex] = useState(0)
  const [customerHours, setCustomerHours] = useState([])
  const [slots, setSlots] = useState([])
  // For a paired booking, the drop-off chosen before picking a pickup.
  const [dropOff, setDropOff] = useState(null)
  // The booking summary, held while the customer adds any comments.
  const [booked, setBooked] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [messages, step])

  function say(...newMessages) {
    setMessages((current) => [...current, ...newMessages])
  }

  function chooseService(choice) {
    setService(choice)
    say(
      { from: 'user', text: choice },
      { from: 'bot', text: `${serviceIntro(choice, settings)} ${DATES_QUESTION}` },
    )
    setStep('dates')
  }

  function toggleDate(date) {
    setDates((current) =>
      current.includes(date) ? current.filter((d) => d !== date) : [...current, date],
    )
  }

  function confirmDates() {
    const ordered = [...dates].sort()
    setDates(ordered)
    setDateIndex(0)
    say(
      { from: 'user', text: ordered.map(formatDate).join(', ') },
      { from: 'bot', text: `What times are you free on ${formatDate(ordered[0])}?` },
    )
    setStep('times')
  }

  function submitTimes(start, end, breaks) {
    const range = { date: dates[dateIndex], start, end, breaks }
    const updated = [...customerHours, range]
    setCustomerHours(updated)
    say({ from: 'user', text: formatRangeWithBreaks(range) })

    if (dateIndex + 1 < dates.length) {
      setDateIndex(dateIndex + 1)
      say({ from: 'bot', text: `And on ${formatDate(dates[dateIndex + 1])}?` })
      return
    }

    // Times earlier today have already passed.
    const notBefore = nowOnTimeline()

    if (service === PAIRED_SERVICE) {
      const dropOffs = suggestDropOffs(businessHours, updated, { turnaroundMinutes, notBefore })
      if (dropOffs.length === 0) {
        say({
          from: 'bot',
          text: `Sorry, I couldn't fit a drop-off and a pickup at least ${formatDuration(
            turnaroundMinutes,
          )} apart into the business's hours. Try adding more dates or times.`,
        })
        setStep('done')
        return
      }
      setSlots(dropOffs)
      say({ from: 'bot', text: `First, your drop-off. ${matchesText(dropOffs, 'drop-off')}` })
      setStep('pick')
      return
    }

    const matches = suggestSlots(businessHours, updated, {
      minutes: serviceMinutes(service, appointmentMinutes),
      notBefore,
    })
    setSlots(matches)
    if (matches.length === 0) {
      say({
        from: 'bot',
        text: "Sorry, none of those times line up with the business's hours. Try different dates or times.",
      })
      setStep('done')
      return
    }
    say({ from: 'bot', text: matchesText(matches, service.toLowerCase()) })
    setStep('pick')
  }

  function pickSlot(slot) {
    say({ from: 'user', text: slotLabel(slot) })

    // Paired booking, first pick: that was the drop-off; now offer pickups.
    // suggestDropOffs only offers drop-offs that leave room for a pickup.
    if (service === PAIRED_SERVICE && !dropOff) {
      const pickups = suggestPickups(businessHours, customerHours, slot, { turnaroundMinutes })
      setDropOff(slot)
      setSlots(pickups)
      say({
        from: 'bot',
        text: `Now your pickup, at least ${formatDuration(
          turnaroundMinutes,
        )} after your drop-off. ${matchesText(pickups, 'pickup')}`,
      })
      return
    }

    setBooked(
      service === PAIRED_SERVICE
        ? `Drop-off on ${slotLabel(dropOff)} and pickup on ${slotLabel(slot)}`
        : `${service} on ${slotLabel(slot)}`,
    )
    say({ from: 'bot', text: COMMENTS_QUESTION })
    setStep('comments')
  }

  function answerComments(wantsToComment) {
    say({ from: 'user', text: wantsToComment ? 'Yes' : 'Skip' })
    if (wantsToComment) {
      say({ from: 'bot', text: 'What would you like the business to know?' })
      setStep('comment')
      return
    }
    confirm()
  }

  function submitComment(comment) {
    say({ from: 'user', text: comment })
    confirm(' Thanks for your note.')
  }

  function confirm(extra = '') {
    say({
      from: 'bot',
      text: `You're all set: ${booked}.${extra} (This is a demo, so nothing is saved yet.)`,
    })
    setStep('done')
  }

  function restart() {
    const fresh = startingChat(services, settings, businessHours.length > 0)
    setMessages(fresh.messages)
    setStep(fresh.step)
    setService(fresh.service)
    setDates([])
    setDateIndex(0)
    setCustomerHours([])
    setSlots([])
    setDropOff(null)
    setBooked('')
  }

  return (
    <section>
      <h2>Book a time</h2>

      <ol className="chat" aria-label="Chat" aria-live="polite">
        {messages.map((message, index) => (
          <li key={index} className={`bubble ${message.from}`}>
            {message.text}
          </li>
        ))}
      </ol>

      <div className="chat-controls">
        {step === 'service' && (
          <div className="choices">
            {services.map((choice) => (
              <button
                key={choice}
                type="button"
                className="button"
                onClick={() => chooseService(choice)}
              >
                {choice}
              </button>
            ))}
          </div>
        )}

        {step === 'dates' && (
          <>
            <DatePicker
              today={toDateString(new Date())}
              openDays={new Set(businessHours.map((range) => range.day))}
              selected={dates}
              onToggle={toggleDate}
            />
            <button
              type="button"
              className="button primary"
              disabled={dates.length === 0}
              onClick={confirmDates}
            >
              Next
            </button>
          </>
        )}

        {step === 'times' && (
          <TimeRangeForm
            key={dateIndex}
            label={formatDate(dates[dateIndex])}
            onSubmit={submitTimes}
          />
        )}

        {step === 'pick' && (
          <div className="choices stacked">
            {slots.map((slot) => (
              <button
                key={slotLabel(slot)}
                type="button"
                className="button"
                onClick={() => pickSlot(slot)}
              >
                {slotLabel(slot)}
              </button>
            ))}
          </div>
        )}

        {step === 'comments' && (
          <div className="choices">
            <button type="button" className="button" onClick={() => answerComments(true)}>
              Yes
            </button>
            <button type="button" className="button" onClick={() => answerComments(false)}>
              Skip
            </button>
          </div>
        )}

        {step === 'comment' && <CommentForm onSubmit={submitComment} />}

        {messages.length > 1 && (
          <button type="button" className="button link" onClick={restart}>
            Start over
          </button>
        )}
      </div>
      <div ref={bottomRef} />
    </section>
  )
}

export default CustomerPage
