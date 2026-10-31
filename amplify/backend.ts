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
// descriptions of when they're free. It may call only that one model
// (through Bedrock's global routing, which can run it in any region), and
// keeps a daily count of its calls so the cost stays small.
const assistantLambda = backend.assistant.resources.lambda
const assistantStack = Stack.of(assistantLambda)
const CLAUDE_MODEL = 'anthropic.claude-haiku-4-5-20251001-v1:0'
assistantLambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['bedrock:InvokeModel'],
    resources: [
      `arn:aws:bedrock:${assistantStack.region}:${assistantStack.account}:inference-profile/global.${CLAUDE_MODEL}`,
      `arn:aws:bedrock:*::foundation-model/${CLAUDE_MODEL}`,
      `arn:aws:bedrock:::foundation-model/${CLAUDE_MODEL}`,
    ],
  }),
)
const usage = new Table(assistantStack, 'AssistantUsage', {
  partitionKey: { name: 'key', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'expires',
})
usage.grantReadWriteData(assistantLambda)
backend.assistant.addEnvironment('USAGE_TABLE', usage.tableName)
