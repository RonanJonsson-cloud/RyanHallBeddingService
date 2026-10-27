import { defineAuth } from '@aws-amplify/backend'

// Business owners sign in with their email. Customers never sign in: they
// use the app as guests.
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
})
