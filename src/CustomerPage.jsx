import { useEffect, useRef, useState } from 'react'
import BreaksEditor from './BreaksEditor.jsx'
import {
  DAYS,
  DEFAULT_APPOINTMENT_MINUTES,
  DEFAULT_TURNAROUND_MINUTES,
  HANDOFF_MINUTES,
  PAIRED_SERVICE,
  availableServices,
  formatDuration,
  formatRange,
  formatRangeWithBreaks,
  rangeError,
  serviceMinutes,
  suggestDropOffs,
  suggestPickups,
  suggestSlots,
} from './scheduling.js'

const GREETING = {
  from: 'bot',
  text: "Hi! I'll help you find a time. What do you need?",
}

const DAYS_QUESTION = 'Which days are you available? Tap all that work, then press Next.'

function slotLabel(slot) {
  return `${slot.day} ${formatRange(slot)}`
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
    ? `The earliest day that works is ${matches[0].day}. I found 1 time for your ${what}:`
    : `The earliest day that works is ${matches[0].day}. Here are ${matches.length} times across that day for your ${what}:`
}

const SERVICE_NAMES = {
  Appointment: 'an appointment',
  [PAIRED_SERVICE]: 'a drop-off and pickup',
}

// With only one service on offer, skip straight to asking for days.
function startingChat(services, settings) {
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
          text: `Hi! I'll help you book ${name}. ${serviceIntro(service, settings)} ${DAYS_QUESTION}`,
        },
      ],
      step: 'days',
      service,
    }
  }
  return { messages: [GREETING], step: 'service', service: '' }
}

function TimeRangeForm({ day, onSubmit }) {
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
    <form className="card" onSubmit={handleSubmit} aria-label={`Times for ${day}`}>
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

  const [initial] = useState(() => startingChat(services, settings))
  const [messages, setMessages] = useState(initial.messages)
  const [step, setStep] = useState(initial.step)
  const [service, setService] = useState(initial.service)
  const [days, setDays] = useState([])
  const [dayIndex, setDayIndex] = useState(0)
  const [customerHours, setCustomerHours] = useState([])
  const [slots, setSlots] = useState([])
  // For a paired booking, the drop-off chosen before picking a pickup.
  const [dropOff, setDropOff] = useState(null)
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
      { from: 'bot', text: `${serviceIntro(choice, settings)} ${DAYS_QUESTION}` },
    )
    setStep('days')
  }

  function toggleDay(day) {
    setDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    )
  }

  function confirmDays() {
    const ordered = DAYS.filter((d) => days.includes(d))
    setDays(ordered)
    setDayIndex(0)
    say(
      { from: 'user', text: ordered.join(', ') },
      { from: 'bot', text: `What times are you free on ${ordered[0]}?` },
    )
    setStep('times')
  }

  function submitTimes(start, end, breaks) {
    const range = { day: days[dayIndex], start, end, breaks }
    const updated = [...customerHours, range]
    setCustomerHours(updated)
    say({ from: 'user', text: formatRangeWithBreaks(range) })

    if (dayIndex + 1 < days.length) {
      setDayIndex(dayIndex + 1)
      say({ from: 'bot', text: `And on ${days[dayIndex + 1]}?` })
      return
    }

    if (businessHours.length === 0) {
      say({
        from: 'bot',
        text: "The business hasn't posted any hours yet, so I can't find a match. Please check back soon.",
      })
      setStep('done')
      return
    }

    if (service === PAIRED_SERVICE) {
      const dropOffs = suggestDropOffs(businessHours, updated, { turnaroundMinutes })
      if (dropOffs.length === 0) {
        say({
          from: 'bot',
          text: `Sorry, I couldn't fit a drop-off and a pickup at least ${formatDuration(
            turnaroundMinutes,
          )} apart into the business's hours. Try adding more days or times.`,
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
    })
    setSlots(matches)
    if (matches.length === 0) {
      say({
        from: 'bot',
        text: "Sorry, none of those times line up with the business's hours. Try different days or times.",
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

    const booked =
      service === PAIRED_SERVICE
        ? `Drop-off on ${slotLabel(dropOff)} and pickup on ${slotLabel(slot)}`
        : `${service} on ${slotLabel(slot)}`
    say({
      from: 'bot',
      text: `You're all set: ${booked}. (This is a demo, so nothing is saved yet.)`,
    })
    setStep('done')
  }

  function restart() {
    const fresh = startingChat(services, settings)
    setMessages(fresh.messages)
    setStep(fresh.step)
    setService(fresh.service)
    setDays([])
    setDayIndex(0)
    setCustomerHours([])
    setSlots([])
    setDropOff(null)
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

        {step === 'days' && (
          <>
            <div className="choices" role="group" aria-label="Days">
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  className="chip"
                  aria-pressed={days.includes(day)}
                  onClick={() => toggleDay(day)}
                >
                  {day}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="button primary"
              disabled={days.length === 0}
              onClick={confirmDays}
            >
              Next
            </button>
          </>
        )}

        {step === 'times' && (
          <TimeRangeForm key={dayIndex} day={days[dayIndex]} onSubmit={submitTimes} />
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
