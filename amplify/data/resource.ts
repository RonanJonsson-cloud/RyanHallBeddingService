import { a, defineData, type ClientSchema } from '@aws-amplify/backend'
import { booking } from '../functions/booking/resource'

// Who can do what:
//  - A business owner signs in to save their settings and see their bookings.
//  - Customers are guests: they can read a business's settings, see which
//    times are taken (but not who took them), and book through the booking
//    function, which is the only way to add or remove a booking.
const customers = (allow: any) => [
  allow.guest(),
  // A signed-in owner previewing their own customer page.
  allow.authenticated('identityPool'),
]

const schema = a.schema({
  Business: a
    .model({
      // The same compact settings the share link carries (src/shareLink.js).
      config: a.string().required(),
      // Owners can't hand their records to someone else.
      owner: a
        .string()
        .authorization((allow) => [
          allow.owner().to(['read', 'delete']),
          ...customers(allow).map((rule) => rule.to(['read'])),
        ]),
    })
    .authorization((allow) => [
      allow.owner(),
      ...customers(allow).map((rule) => rule.to(['read'])),
    ]),

  Booking: a
    .model({
      businessId: a.id().required(),
      service: a.string().required(),
      // JSON list of { date, start, end }: one time, or drop-off then pickup.
      slots: a.string().required(),
      name: a.string().required(),
      contact: a.string().required(),
      comments: a.string(),
      owner: a.string().authorization((allow) => [allow.owner().to(['read'])]),
    })
    .authorization((allow) => [allow.owner().to(['read'])]),

  // Every booked time on one date for one business, kept in one record so
  // the booking function can check and save it in a single step.
  BookingDay: a
    .model({
      businessId: a.id().required(),
      date: a.string().required(),
      // JSON list of { start, end, bookingId }.
      slots: a.string().required(),
      // Goes up on every change, so two bookings at once can't both win.
      version: a.integer().required(),
      owner: a.string().authorization((allow) => [allow.owner().to(['read'])]),
    })
    .identifier(['businessId', 'date'])
    .authorization((allow) => [allow.owner().to(['read'])]),

  BusyTime: a.customType({
    date: a.string().required(),
    start: a.string().required(),
    end: a.string().required(),
  }),

  BookingResult: a.customType({
    ok: a.boolean().required(),
    message: a.string().required(),
  }),

  busyTimes: a
    .query()
    .arguments({ businessId: a.id().required() })
    .returns(a.ref('BusyTime').array())
    .authorization((allow) => customers(allow))
    .handler(a.handler.function(booking)),

  book: a
    .mutation()
    .arguments({
      businessId: a.id().required(),
      service: a.string().required(),
      // JSON list of { date, start, end }.
      slots: a.string().required(),
      name: a.string().required(),
      contact: a.string().required(),
      comments: a.string(),
    })
    .returns(a.ref('BookingResult'))
    .authorization((allow) => customers(allow))
    .handler(a.handler.function(booking)),

  cancelBooking: a
    .mutation()
    .arguments({ id: a.id().required() })
    .returns(a.ref('BookingResult'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(booking)),
})

export type Schema = ClientSchema<typeof schema>

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
})
