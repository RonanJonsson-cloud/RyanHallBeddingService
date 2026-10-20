import { useState } from 'react'
import BreaksEditor, { defaultBreak } from './BreaksEditor.jsx'
import SharePanel from './SharePanel.jsx'
import {
  APPOINTMENT_LENGTHS,
  DAYS,
  HANDOFF_MINUTES,
  MAX_TURNAROUND_DAYS,
  formatDuration,
  formatRange,
  rangeError,
  sortRanges,
  turnaroundError,
} from './scheduling.js'

let nextId = 1

// The business page calls busy blocks "unavailability".
const UNAVAILABILITY = 'Unavailability'
const UNAVAILABILITY_WORDING = {
  add: '+ Add unavailability',
  from: 'Unavailable from',
  item: UNAVAILABILITY,
}

function AddBreakForm({ range, onSave, onCancel }) {
  const [breaks, setBreaks] = useState(() => [defaultBreak(range.start, range.end)])
  const [error, setError] = useState('')

  function handleSave() {
    const message = rangeError(range.start, range.end, breaks, UNAVAILABILITY)
    if (message) {
      setError(message)
      return
    }
    onSave(breaks)
  }

  return (
    <div className="inline-editor">
      <BreaksEditor
        breaks={breaks}
        onChange={setBreaks}
        rangeStart={range.start}
        rangeEnd={range.end}
        wording={UNAVAILABILITY_WORDING}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="inline-actions">
        <button
          type="button"
          className="button small primary"
          disabled={breaks.length === 0}
          onClick={handleSave}
        >
          Save
        </button>
        <button type="button" className="button small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// A whole number from a number box, kept within [min, max]. Blank counts as 0.
function wholeNumber(value, min, max) {
  const number = Math.floor(Number(value)) || 0
  return Math.min(Math.max(number, min), max)
}

// The gap between drop-off and pickup, entered as days plus hours.
function TurnaroundInput({ minutes, onChange }) {
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const error = turnaroundError(minutes)

  return (
    <fieldset className="option-group turnaround">
      <legend>Minimum time between drop-off and pickup</legend>
      <div className="field-row">
        <label className="field">
          Days
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_TURNAROUND_DAYS}
            value={days}
            onChange={(e) =>
              onChange(wholeNumber(e.target.value, 0, MAX_TURNAROUND_DAYS) * 1440 + hours * 60)
            }
          />
        </label>
        <label className="field">
          Hours
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={23}
            value={hours}
            onChange={(e) => onChange(days * 1440 + wholeNumber(e.target.value, 0, 23) * 60)}
          />
        </label>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : (
        <p className="note">Only open days and hours count.</p>
      )}
    </fieldset>
  )
}

function SettingsCard({ settings, onSettingsChange }) {
  function set(field, value) {
    onSettingsChange({ ...settings, [field]: value })
  }

  return (
    <section className="card">
      <label className="field">
        Business name
        <input
          type="text"
          value={settings.name}
          maxLength={80}
          onChange={(e) => set('name', e.target.value)}
        />
      </label>
      <fieldset className="option-group">
        <legend>Appointments</legend>
        <div className="option-box">
          <label className="check">
            <input
              type="checkbox"
              checked={settings.offerAppointments}
              onChange={(e) => set('offerAppointments', e.target.checked)}
            />
            Offer appointments
          </label>
          {settings.offerAppointments && (
            <label className="field">
              Appointment length
              <select
                value={settings.appointmentMinutes}
                onChange={(e) => set('appointmentMinutes', Number(e.target.value))}
              >
                {APPOINTMENT_LENGTHS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatDuration(minutes)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </fieldset>

      <fieldset className="option-group">
        <legend>Pickups and drop-offs</legend>
        <div className="option-box">
          <label className="check">
            <input
              type="checkbox"
              checked={settings.offerHandoffs}
              onChange={(e) => set('offerHandoffs', e.target.checked)}
            />
            Offer pickups and drop-offs
          </label>
          {settings.offerHandoffs && (
            <p className="note">{formatDuration(HANDOFF_MINUTES)} each.</p>
          )}

          {settings.offerHandoffs && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.handoffsTogether}
                  onChange={(e) => set('handoffsTogether', e.target.checked)}
                />
                Schedule drop-off and pickup together
              </label>
              {settings.handoffsTogether && (
                <p className="note">Drop-off first, then pickup.</p>
              )}
            </>
          )}

          {settings.offerHandoffs && settings.handoffsTogether && (
            <TurnaroundInput
              minutes={settings.turnaroundMinutes}
              onChange={(minutes) => set('turnaroundMinutes', minutes)}
            />
          )}
        </div>
      </fieldset>

      {!settings.offerAppointments && !settings.offerHandoffs && (
        <p className="error" role="alert">
          Turn on at least one service.
        </p>
      )}
    </section>
  )
}

function BusinessPage({ settings, onSettingsChange, hours, onChange }) {
  const [day, setDay] = useState('Monday')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('17:00')
  const [breaks, setBreaks] = useState([])
  const [error, setError] = useState('')
  const [addingBreakTo, setAddingBreakTo] = useState(null)

  function handleAdd(event) {
    event.preventDefault()
    const message = rangeError(start, end, breaks, UNAVAILABILITY)
    if (message) {
      setError(message)
      return
    }
    setError('')
    // Day, times and unavailability stay filled in, so the same schedule
    // can be added to another day with two taps.
    onChange([...hours, { id: nextId++, day, start, end, breaks }])
  }

  function handleRemove(id) {
    onChange(hours.filter((range) => range.id !== id))
  }

  function updateBreaks(id, newBreaks) {
    onChange(hours.map((range) => (range.id === id ? { ...range, breaks: newBreaks } : range)))
  }

  return (
    <>
      <SettingsCard settings={settings} onSettingsChange={onSettingsChange} />

      <section>
        <h2>Your available hours</h2>
        <p className="hint">
          Add your available days and time ranges, these hours repeat every week. Customers may
          book up to 4 weeks in advance.
        </p>

        <form className="card" onSubmit={handleAdd}>
          <label className="field">
            Day
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              {DAYS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              Start time
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="field">
              End time
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <BreaksEditor
            breaks={breaks}
            onChange={setBreaks}
            rangeStart={start}
            rangeEnd={end}
            wording={UNAVAILABILITY_WORDING}
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button primary">
            Add hours
          </button>
        </form>

        {hours.length === 0 ? (
          <p className="empty">No hours added yet.</p>
        ) : (
          <ul className="hours-list" aria-label="Available hours">
            {sortRanges(hours).map((range) => {
              const label = `${range.day} ${formatRange(range)}`
              return (
                <li key={range.id} className="hours-item">
                  <div className="hours-row">
                    <span>
                      <strong>{range.day}</strong> {formatRange(range)}
                    </span>
                    <button
                      type="button"
                      className="button small"
                      onClick={() => handleRemove(range.id)}
                      aria-label={`Remove ${label}`}
                    >
                      Remove
                    </button>
                  </div>

                  {range.breaks.length > 0 && (
                    <ul className="busy-list">
                      {range.breaks.map((b) => (
                        <li key={b.id} className="busy-item">
                          <span>Unavailable {formatRange(b)}</span>
                          <button
                            type="button"
                            className="button link small"
                            aria-label={`Remove unavailability ${formatRange(b)} from ${label}`}
                            onClick={() =>
                              updateBreaks(
                                range.id,
                                range.breaks.filter((other) => other.id !== b.id),
                              )
                            }
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {addingBreakTo === range.id ? (
                    <AddBreakForm
                      range={range}
                      onSave={(newBreaks) => {
                        updateBreaks(range.id, [...range.breaks, ...newBreaks])
                        setAddingBreakTo(null)
                      }}
                      onCancel={() => setAddingBreakTo(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="button link small"
                      aria-label={`Add unavailability to ${label}`}
                      onClick={() => setAddingBreakTo(range.id)}
                    >
                      + Add unavailability
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <SharePanel business={{ ...settings, hours }} />
    </>
  )
}

export default BusinessPage
