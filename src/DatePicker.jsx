import {
  BOOKING_WINDOW_DAYS,
  addDays,
  formatLongDate,
  weekdayOf,
} from './scheduling.js'

const HEADINGS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// A Monday-first calendar from today through the booking window. Dates the
// business is closed (or that have passed) can't be picked.
function DatePicker({ today, openDays, selected, onToggle }) {
  const lastDate = addDays(today, BOOKING_WINDOW_DAYS - 1)
  const firstShown = addDays(today, -HEADINGS.indexOf(weekdayOf(today).slice(0, 3)))

  const dates = []
  for (let date = firstShown; date <= lastDate; date = addDays(date, 1)) dates.push(date)
  while (dates.length % 7 !== 0) dates.push(addDays(dates[dates.length - 1], 1))

  return (
    <div className="calendar" role="group" aria-label="Dates">
      {HEADINGS.map((heading) => (
        <span key={heading} className="calendar-heading" aria-hidden="true">
          {heading}
        </span>
      ))}
      {dates.map((date, index) => {
        const [, month, day] = date.split('-').map(Number)
        const inWindow = date >= today && date <= lastDate
        const open = inWindow && openDays.has(weekdayOf(date))
        // Show the month on the first cell and whenever a new month starts.
        const showMonth = index === 0 || day === 1
        return (
          <button
            key={date}
            type="button"
            className="calendar-day"
            disabled={!open}
            aria-pressed={selected.includes(date)}
            aria-label={`${formatLongDate(date)}${open ? '' : ' (unavailable)'}`}
            onClick={() => onToggle(date)}
          >
            {showMonth && <span className="calendar-month">{MONTHS[month - 1]}</span>}
            {day}
          </button>
        )
      })}
    </div>
  )
}

export default DatePicker
