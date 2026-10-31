import { defineBackend } from '@aws-amplify/backend'
import { Stack } from 'aws-cdk-lib'
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { auth } from './auth/resource'
import { data } from './data/resource'
import { assistant } from './functions/assistant/resource'
import { booking } from './functions/booking/resource'

const backend = defineBackend({ auth, data, booking, assistant })

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

// The assistant function asks Claude on Amazon Bedrock to read customers'
// descriptions of when they're free. Calling Claude is the only AI access
// it gets, and it keeps a daily count of its calls so the cost stays small.
const assistantLambda = backend.assistant.resources.lambda
assistantLambda.addToRolePolicy(
  new PolicyStatement({ actions: ['bedrock-mantle:CreateInference'], resources: ['*'] }),
)
const usage = new Table(Stack.of(assistantLambda), 'AssistantUsage', {
  partitionKey: { name: 'key', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'expires',
})
usage.grantReadWriteData(assistantLambda)
backend.assistant.addEnvironment('USAGE_TABLE', usage.tableName)
