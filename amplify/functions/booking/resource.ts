import { defineFunction } from '@aws-amplify/backend'

// Books and cancels times, checking for double bookings (see handler.ts).
export const booking = defineFunction({
  name: 'booking',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 10,
  // Lives with the data so it can use the tables without a circular
  // dependency between the two.
  resourceGroupName: 'data',
})
