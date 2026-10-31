import { defineFunction } from '@aws-amplify/backend'

// Reads a customer's description of when they're free (see handler.ts).
export const assistant = defineFunction({
  name: 'assistant',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 30,
  // Lives with the data, like the booking function.
  resourceGroupName: 'data',
})
