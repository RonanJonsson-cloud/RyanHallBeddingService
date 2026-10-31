import { useEffect, useRef, useState } from 'react'
import BreaksEditor from './BreaksEditor.jsx'
import DatePicker from './DatePicker.jsx'
import { MAX_DESCRIPTION_LENGTH, descriptionError } from './assistantRules.js'
import { MAX_COMMENT_LENGTH, detailsError, withoutTaken } from './bookingRules.js'
import {
  BOOKING_WINDOW_DAYS,
  DEFAULT_APPOINTMENT_MINUTES,
  DEFAULT_TURNAROUND_MINUTES,
  PAIRED_SERVICE,
  addDays,
  availableServices,
  daysBetween,
  earliestPickupDate,
  formatDate,
  formatDuration,
  formatRange,
  formatRangeWithBreaks,
  formatTime,
  nowOnTimeline,
  rangeError,
  serviceMinutes,
  sortRanges,
  suggestDropOffs,
  suggestPickups,
  suggestSlots,
  toDateString,
  weekdayOf,
} from './scheduling.js'

const GREETING = {
  from: 'bot',
  text: "Hi! I'll help you find a time. What do you need?",
}

const COMMENTS_QUESTION = 'Anything else we should know?'
const DETAILS_QUESTION =
  'Last step: your name, and an email or phone number so the business can reach you.'

function slotLabel(slot) {
  return `${formatDate(slot.date)} ${formatRange(slot)}`
}

// "Mon Nov 2 9:00 AM – 12:00 PM, Tue Nov 3 ... and 6 more"
function rangesText(ranges) {
  const shown = ranges.slice(0, 4).map(slotLabel).join(', ')
  const more = ranges.length - 4
  return more > 0 ? `${shown} and ${more} more` : shown
}

const CANT_DESCRIBE =
  "Sorry, I couldn't read that just now. Please pick your dates on the calendar instead."
const NOTHING_FOUND =
  "Sorry, I couldn't tell when you're free from that. Try something like 'weekday mornings', or pick dates on the calendar."

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

// The business's hours on one weekday: the earliest opening and latest
// closing (customers must stay within these), plus a description like
// "9:00 AM – 5:00 PM (busy 12:00 PM – 1:00 PM)".
function hoursOn(weekday, businessHours) {
  const ranges = sortRanges(businessHours.filter((range) => range.day === weekday))
  return {
    open: ranges.reduce((a, r) => (r.start < a ? r.start : a), ranges[0].start),
    close: ranges.reduce((a, r) => (r.end > a ? r.end : a), ranges[0].end),
    text: ranges.map(formatRangeWithBreaks).join(', '),
  }
}

// The first date's times, trimmed to fit another date's business hours.
// null if they don't overlap those hours at all.
function fitWithin(range, hours) {
  const start = range.start > hours.open ? range.start : hours.open
  const end = range.end < hours.close ? range.end : hours.close
  if (end <= start) return null
  const breaks = range.breaks
    .map((b) => ({
      ...b,
      start: b.start > start ? b.start : start,
      end: b.end < end ? b.end : end,
    }))
    .filter((b) => b.end > b.start)
  return { start, end, breaks }
}

// `initial` fills in the form (e.g. with the first date's times); otherwise
// it starts with the business's hours for that date.
function TimeRangeForm({ label, hours, initial, onSubmit }) {
  const [start, setStart] = useState(initial?.start ?? hours.open)
  const [end, setEnd] = useState(initial?.end ?? hours.close)
  const [breaks, setBreaks] = useState(initial?.breaks ?? [])
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const message =
      rangeError(start, end, breaks) ||
      (start < hours.open || end > hours.close
        ? `Please choose times between ${formatTime(hours.open)} and ${formatTime(hours.close)}, when we're open.`
        : '')
    if (message) {
      setError(message)
      return
    }
    onSubmit(start, end, breaks)
  }

  return (
    <form
      className="card"
      onSubmit={handleSubmit}
      // Our own message explains the open hours better than the browser's.
      noValidate
      aria-label={`Times for ${label}`}
    >
      <p className="note">Open {hours.text}</p>
      <div className="field-row">
        <label className="field">
          From
          <input
            type="time"
            min={hours.open}
            max={hours.close}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="field">
          To
          <input
            type="time"
            min={hours.open}
            max={hours.close}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
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

// The customer's own words instead of the calendar, read by the AI assistant.
function DescribeForm({ onSubmit }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const message = descriptionError(text)
    if (message) {
      setError(message)
      return
    }
    onSubmit(text.trim())
  }

  return (
    <form className="card" onSubmit={handleSubmit} noValidate aria-label="Describe when you're free">
      <label className="field">
        Or tell me when you're free
        <input
          type="text"
          value={text}
          maxLength={MAX_DESCRIPTION_LENGTH}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <p className="hint">For example: weekday mornings, but not Wednesday</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button primary">
        Find times
      </button>
    </form>
  )
}

function DetailsForm({ onSubmit }) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const details = { name: name.trim(), contact: contact.trim() }
    const message = detailsError(details)
    if (message) {
      setError(message)
      return
    }
    onSubmit(details)
  }

  return (
    <form className="card" onSubmit={handleSubmit} noValidate aria-label="Your details">
      <label className="field">
        Your name
        <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        Email or phone
        <input
          type="text"
          autoComplete="email"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button primary">
        Book
      </button>
    </form>
  )
}

// `taken` lists times already booked ({ date, start, end }), which are never
// suggested. With `onBook`, the chat saves the booking: it asks for the
// customer's details, then calls onBook({ service, slots, name, contact,
// comments }), which resolves to { ok, message }. Without it, the chat ends
// as a demo. With `onDescribe`, customers can also say when they're free in
// their own words: onDescribe(text, { firstDate, days }) resolves to
// { ok, message, ranges }, the times they're free on those dates.
function CustomerPage({ business, taken = [], onBook = null, onDescribe = null }) {
  const {
    hours: businessHours,
    offerAppointments = true,
    appointmentMinutes = DEFAULT_APPOINTMENT_MINUTES,
    offerHandoffs = true,
    handoffsTogether = false,
    turnaroundMinutes = DEFAULT_TURNAROUND_MINUTES,
  } = business
  const services = availableServices({ offerAppointments, offerHandoffs, handoffsTogether })

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
  // The booking summary and chosen slots, held while the customer adds any
  // comments and details.
  const [booked, setBooked] = useState('')
  const [chosen, setChosen] = useState([])
  const [comment, setComment] = useState('')
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
    finishTimes(updated)
  }

  async function describeTimes(text) {
    say({ from: 'user', text })
    setStep('reading')
    let result
    try {
      result = await onDescribe(text, { firstDate: calendarStart, days: calendarDays })
    } catch {
      result = { ok: false, message: CANT_DESCRIBE }
    }
    if (!result.ok || result.ranges.length === 0) {
      say({ from: 'bot', text: result.ok ? NOTHING_FOUND : result.message })
      setStep('dates')
      return
    }
    setCustomerHours(result.ranges)
    say({ from: 'bot', text: `Got it. You're free ${rangesText(result.ranges)}.` })
    finishTimes(result.ranges)
  }

  // All of the customer's times are in (`updated`): suggest slots, or for a
  // paired booking's drop-off, go on to ask about the pickup.
  function finishTimes(updated) {
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
        )} after your drop-off, counting only the days and hours we're open.`,
      })
      setStep('dates')
      return
    }

    // Times earlier today have already passed.
    const notBefore = nowOnTimeline()

    if (service === PAIRED_SERVICE) {
      const dropOffs = suggestDropOffs(businessHours, withoutTaken(dropOffHours, taken), {
        pickupHours: withoutTaken(updated, taken),
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

    const matches = suggestSlots(businessHours, withoutTaken(updated, taken), {
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
      const pickups = suggestPickups(businessHours, withoutTaken(customerHours, taken), slot, {
        turnaroundMinutes,
      })
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
    setChosen(service === PAIRED_SERVICE ? [dropOff, slot] : [slot])
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
    if (onBook) askDetails('')
    else confirm()
  }

  function submitComment(text) {
    say({ from: 'user', text })
    if (onBook) askDetails(text)
    else confirm(' Thanks for your note.')
  }

  function askDetails(text) {
    setComment(text)
    say({ from: 'bot', text: DETAILS_QUESTION })
    setStep('details')
  }

  async function submitDetails({ name, contact }) {
    say({ from: 'user', text: `${name} · ${contact}` })
    setStep('saving')
    let result
    try {
      result = await onBook({ service, slots: chosen, name, contact, comments: comment || null })
    } catch {
      result = { ok: false, message: "Sorry, something went wrong and your time wasn't booked." }
    }
    say({
      from: 'bot',
      text: result.ok
        ? `You're booked: ${booked}.${comment ? ' Thanks for your note.' : ''} The business will reach you at ${contact} if anything changes.`
        : `${result.message} Tap Start over to choose another time.`,
    })
    setStep('done')
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
    setChosen([])
    setComment('')
  }

  // While picking pickup dates, grey out dates too soon after the earliest
  // drop-off, and show extra days so a long gap still fits. Both count only
  // the business's open days and hours, like the gap itself.
  const today = toDateString(new Date())
  let calendarStart = today
  let calendarDays = BOOKING_WINDOW_DAYS
  if (service === PAIRED_SERVICE && dropOffHours !== null) {
    const first = dropOffHours[0]
    const earliestPickup = earliestPickupDate(first.date, first.start, turnaroundMinutes, businessHours)
    const lastPickup = earliestPickupDate(
      addDays(today, BOOKING_WINDOW_DAYS - 1),
      '23:59',
      turnaroundMinutes,
      businessHours,
    )
    if (earliestPickup > today) calendarStart = earliestPickup
    if (lastPickup) calendarDays = daysBetween(today, lastPickup) + 1
  }

  // The business's hours on the date whose times are being asked for.
  const timesHours =
    step === 'times' ? hoursOn(weekdayOf(dates[dateIndex]), businessHours) : null

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
            {onDescribe && <DescribeForm key={messages.length} onSubmit={describeTimes} />}
          </>
        )}

        {step === 'reading' && <p className="note">Reading your times…</p>}

        {step === 'times' && (
          <TimeRangeForm
            key={dateIndex}
            label={formatDate(dates[dateIndex])}
            hours={timesHours}
            // Dates after the first start with the first date's times.
            initial={dateIndex > 0 ? fitWithin(customerHours[0], timesHours) : null}
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

        {step === 'details' && <DetailsForm onSubmit={submitDetails} />}

        {step === 'saving' && <p className="note">Booking…</p>}

        {messages.length > 1 && step !== 'saving' && step !== 'reading' && (
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
