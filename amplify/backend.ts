import { defineBackend } from '@aws-amplify/backend'
import { auth } from './auth/resource'
import { data } from './data/resource'
import { booking } from './functions/booking/resource'

const backend = defineBackend({ auth, data, booking })

// The booking function reads and writes the tables directly, so it can
// check for double bookings and save everything in one all-or-nothing step.
const tables = backend.data.resources.tables
const tableNames = {
  BUSINESS_TABLE: 'Business',
  BOOKING_TABLE: 'Booking',
  BOOKING_DAY_TABLE: 'BookingDay',
}
for (const [variable, model] of Object.entries(tableNames)) {
  tables[model].grantReadWriteData(backend.booking.resources.lambda)
  backend.booking.addEnvironment(variable, tables[model].tableName)
}
