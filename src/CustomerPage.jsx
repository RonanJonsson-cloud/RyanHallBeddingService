import { useEffect, useRef, useState } from 'react'
import BreaksEditor from './BreaksEditor.jsx'
import {
  DAYS,
  DEFAULT_APPOINTMENT_MINUTES,
  SERVICES,
  formatDuration,
  formatRange,
  formatRangeWithBreaks,
  rangeError,
  serviceMinutes,
  suggestSlots,
} from './scheduling.js'

const GREETING = {
  from: 'bot',
  text: "Hi! I'll help you find a time. What do you need?",
}

function slotLabel(slot) {
  return `${slot.day} ${formatRange(slot)}`
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

function CustomerPage({ businessHours, appointmentMinutes = DEFAULT_APPOINTMENT_MINUTES }) {
  const [messages, setMessages] = useState([GREETING])
  const [step, setStep] = useState('service')
  const [service, setService] = useState('')
  const [days, setDays] = useState([])
  const [dayIndex, setDayIndex] = useState(0)
  const [customerHours, setCustomerHours] = useState([])
  const [slots, setSlots] = useState([])
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
      {
        from: 'bot',
        text: `${choice === 'Appointment' ? 'Appointments' : `${choice}s`} take ${formatDuration(
          serviceMinutes(choice, appointmentMinutes),
        )}. Which days are you available? Tap all that work, then press Next.`,
      },
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
    say({
      from: 'bot',
      text:
        matches.length === 1
          ? `The earliest day that works is ${matches[0].day}. I found 1 time for your ${service.toLowerCase()}:`
          : `The earliest day that works is ${matches[0].day}. Here are ${matches.length} times across that day for your ${service.toLowerCase()}:`,
    })
    setStep('pick')
  }

  function pickSlot(slot) {
    say(
      { from: 'user', text: slotLabel(slot) },
      {
        from: 'bot',
        text: `You're all set: ${service} on ${slotLabel(slot)}. (This is a demo, so nothing is saved yet.)`,
      },
    )
    setStep('done')
  }

  function restart() {
    setMessages([GREETING])
    setStep('service')
    setService('')
    setDays([])
    setDayIndex(0)
    setCustomerHours([])
    setSlots([])
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
            {SERVICES.map((choice) => (
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

        {step !== 'service' && (
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
