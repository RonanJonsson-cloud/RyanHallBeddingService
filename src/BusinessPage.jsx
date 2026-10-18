import { useState } from 'react'
import BreaksEditor, { defaultBreak } from './BreaksEditor.jsx'
import SharePanel from './SharePanel.jsx'
import {
  APPOINTMENT_LENGTHS,
  DAYS,
  HANDOFF_MINUTES,
  TURNAROUND_OPTIONS,
  formatDuration,
  formatRange,
  rangeError,
  sortRanges,
} from './scheduling.js'

let nextId = 1

function AddBreakForm({ range, onSave, onCancel }) {
  const [breaks, setBreaks] = useState(() => [defaultBreak(range.start, range.end)])
  const [error, setError] = useState('')

  function handleSave() {
    const message = rangeError(range.start, range.end, breaks)
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
          {!settings.offerAppointments && (
            <p className="note">Customers can't book appointments.</p>
          )}

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
          <p className="note">
            {settings.offerHandoffs
              ? `Each one takes ${formatDuration(HANDOFF_MINUTES)}.`
              : "Customers can't book pickups or drop-offs."}
          </p>

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
              <p className="note">
                {settings.handoffsTogether
                  ? 'Customers must book both: a drop-off first, then a pickup.'
                  : 'Customers book a pickup or a drop-off on its own.'}
              </p>
            </>
          )}

          {settings.offerHandoffs && settings.handoffsTogether && (
            <label className="field">
              Minimum time between drop-off and pickup
              <select
                value={settings.turnaroundMinutes}
                onChange={(e) => set('turnaroundMinutes', Number(e.target.value))}
              >
                {TURNAROUND_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatDuration(minutes)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </fieldset>

      {!settings.offerAppointments && !settings.offerHandoffs && (
        <p className="error" role="alert">
          Turn on appointments or pickups and drop-offs so customers have something to book.
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
    const message = rangeError(start, end, breaks)
    if (message) {
      setError(message)
      return
    }
    setError('')
    // Day, times and busy blocks stay filled in, so the same schedule
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
          Add each day and time range when you can take bookings. Use a busy time to block out
          lunch or anything else in the middle of the day.
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
          <BreaksEditor breaks={breaks} onChange={setBreaks} rangeStart={start} rangeEnd={end} />
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
                          <span>Busy {formatRange(b)}</span>
                          <button
                            type="button"
                            className="button link small"
                            aria-label={`Remove busy time ${formatRange(b)} from ${label}`}
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
                      aria-label={`Add busy time to ${label}`}
                      onClick={() => setAddingBreakTo(range.id)}
                    >
                      + Add busy time
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
