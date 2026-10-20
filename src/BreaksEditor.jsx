import { toMinutes, toTime } from './scheduling.js'

let nextBreakId = 1

// A sensible starting break: lunch (12–1) when it fits inside the range,
// otherwise one hour from the middle, trimmed so it never runs past the end.
export function defaultBreak(start, end) {
  const startMin = toMinutes(start || '09:00')
  const endMin = Math.max(toMinutes(end || '17:00'), startMin)
  if (startMin <= 12 * 60 && endMin >= 13 * 60) {
    return { id: nextBreakId++, start: '12:00', end: '13:00' }
  }
  const middle = Math.floor((startMin + endMin) / 2 / 30) * 30
  return {
    id: nextBreakId++,
    start: toTime(middle),
    end: toTime(Math.min(middle + 60, endMin)),
  }
}

// What the editor calls its blocks. Customers see "busy time"; the business
// page passes its own wording.
const CUSTOMER_WORDING = {
  add: '+ Add a busy time (lunch, class…)',
  from: 'Busy from',
  item: 'Break',
}

// Edits a list of busy blocks (lunch, a class, etc.) inside a time range.
function BreaksEditor({ breaks, onChange, rangeStart, rangeEnd, wording = CUSTOMER_WORDING }) {
  function update(id, field, value) {
    onChange(breaks.map((b) => (b.id === id ? { ...b, [field]: value } : b)))
  }

  return (
    <div className="breaks">
      {breaks.map((b, index) => (
        <div key={b.id} className="break-row">
          <label className="field">
            {wording.from}
            <input
              type="time"
              aria-label={`${wording.item} ${index + 1} start`}
              value={b.start}
              onChange={(e) => update(b.id, 'start', e.target.value)}
            />
          </label>
          <label className="field">
            Until
            <input
              type="time"
              aria-label={`${wording.item} ${index + 1} end`}
              value={b.end}
              onChange={(e) => update(b.id, 'end', e.target.value)}
            />
          </label>
          <button
            type="button"
            className="button small remove-break"
            aria-label={`Remove ${wording.item.toLowerCase()} ${index + 1}`}
            onClick={() => onChange(breaks.filter((other) => other.id !== b.id))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button link add-break"
        onClick={() => onChange([...breaks, defaultBreak(rangeStart, rangeEnd)])}
      >
        {wording.add}
      </button>
    </div>
  )
}

export default BreaksEditor
