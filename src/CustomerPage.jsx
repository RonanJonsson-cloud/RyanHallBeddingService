import { useEffect, useRef, useState } from 'react'
import BreaksEditor from './BreaksEditor.jsx'
import DatePicker from './DatePicker.jsx'
import {
  BOOKING_WINDOW_DAYS,
  DEFAULT_APPOINTMENT_MINUTES,
  DEFAULT_TURNAROUND_MINUTES,
  PAIRED_SERVICE,
  addDays,
  availableServices,
  dateAfterOpenTime,
  daysBetween,
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

const COMMENTS_QUESTION = 'Anything else we should know?'
const MAX_COMMENT_LENGTH = 500

function slotLabel(slot) {
  return `${formatDate(slot.date)} ${formatRange(slot)}`
}

function matchesText(matches, what) {
  return matches.length === 1
    ? `The earliest day that works is ${formatDate(matches[0].date)}. I found 1 time for your ${what}:`
    : `The earliest day that works is ${formatDate(matches[0].date)}. Here are ${matches.length} times across that day for your ${what}:`
}

const SERVICE_NAMES = {
  Appointment: 'an appointment',
  Pickup: 'a pickup',
  'Drop-off': 'a drop-off',
  [PAIRED_SERVICE]: 'a drop-off and pickup',
}

// "To book a pickup, please select available dates."
function datesPrompt(service) {
  if (service === PAIRED_SERVICE) {
    return 'To book a drop-off and pickup, first select available dates for your drop-off.'
  }
  return `To book ${SERVICE_NAMES[service]}, please select available dates.`
}

// With only one service on offer, skip straight to asking for dates.
function startingChat(services, hasHours) {
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
    return {
      messages: [{ from: 'bot', text: `Hi! ${datesPrompt(service)}` }],
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
  const services = availableServices({ offerAppointments, offerHandoffs, handoffsTogether })
  // Whether any weekday has no hours (those days don't count toward the gap).
  const closedDays = new Set(businessHours.map((range) => range.day)).size < 7

  const [initial] = useState(() => startingChat(services, businessHours.length > 0))
  const [messages, setMessages] = useState(initial.messages)
  const [step, setStep] = useState(initial.step)
  const [service, setService] = useState(initial.service)
  const [dates, setDates] = useState([])
  const [dateIndex, setDateIndex] = useState(0)
  const [customerHours, setCustomerHours] = useState([])
  const [slots, setSlots] = useState([])
  // For a paired booking: the customer's drop-off availability (set once
  // they move on to giving pickup availability), then the drop-off chosen
  // before picking a pickup.
  const [dropOffHours, setDropOffHours] = useState(null)
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
      { from: 'bot', text: datesPrompt(choice) },
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

    // Paired booking: drop-off availability is done; now ask for the pickup's.
    if (service === PAIRED_SERVICE && !dropOffHours) {
      setDropOffHours(updated)
      setCustomerHours([])
      setDates([])
      setDateIndex(0)
      say({
        from: 'bot',
        text: `Now select available dates for your pickup. It must be at least ${formatDuration(
          turnaroundMinutes,
        )} after your drop-off${closedDays ? ", not counting days we're closed" : ''}.`,
      })
      setStep('dates')
      return
    }

    // Times earlier today have already passed.
    const notBefore = nowOnTimeline()

    if (service === PAIRED_SERVICE) {
      const dropOffs = suggestDropOffs(businessHours, dropOffHours, {
        pickupHours: updated,
        turnaroundMinutes,
        notBefore,
      })
      if (dropOffs.length === 0) {
        say({
          from: 'bot',
          text: `Sorry, I couldn't fit a drop-off and a pickup at least ${formatDuration(
            turnaroundMinutes,
          )} apart into those times and the business's hours. Try different dates or times.`,
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
    const fresh = startingChat(services, businessHours.length > 0)
    setMessages(fresh.messages)
    setStep(fresh.step)
    setService(fresh.service)
    setDates([])
    setDateIndex(0)
    setCustomerHours([])
    setSlots([])
    setDropOffHours(null)
    setDropOff(null)
    setBooked('')
  }

  // While picking pickup dates, grey out dates too soon after the earliest
  // drop-off, and show extra days so a long gap still fits. Both count only
  // days the business is open, like the gap itself.
  const today = toDateString(new Date())
  let calendarStart = today
  let calendarDays = BOOKING_WINDOW_DAYS
  if (service === PAIRED_SERVICE && dropOffHours !== null) {
    const first = dropOffHours[0]
    const earliestPickup = dateAfterOpenTime(first.date, first.start, turnaroundMinutes, businessHours)
    const lastPickup = dateAfterOpenTime(
      addDays(today, BOOKING_WINDOW_DAYS - 1),
      '23:59',
      turnaroundMinutes,
      businessHours,
    )
    if (earliestPickup > today) calendarStart = earliestPickup
    if (lastPickup) calendarDays = daysBetween(today, lastPickup) + 1
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
              today={today}
              openDays={new Set(businessHours.map((range) => range.day))}
              selected={dates}
              onToggle={toggleDate}
              firstDate={calendarStart}
              windowDays={calendarDays}
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
