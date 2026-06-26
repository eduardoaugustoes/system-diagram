import type { ComponentKind } from "./types"

export interface SubtypeEntry {
  kind: ComponentKind
  subtype: string
  awsService: string
  icon: string
}

const MAP: Record<string, SubtypeEntry> = {
  NodejsFunction: { kind: "service", subtype: "aws:lambda", awsService: "Lambda", icon: "lambda" },
  Function: { kind: "service", subtype: "aws:lambda", awsService: "Lambda", icon: "lambda" },
  Table: { kind: "datastore", subtype: "aws:dynamodb", awsService: "DynamoDB", icon: "dynamodb" },
  Queue: { kind: "queue", subtype: "aws:sqs", awsService: "SQS", icon: "sqs" },
  Topic: { kind: "queue", subtype: "aws:sns", awsService: "SNS", icon: "sns" },
  Secret: { kind: "datastore", subtype: "aws:secret", awsService: "Secrets Manager", icon: "secret" },
  HttpApi: { kind: "external", subtype: "aws:apigw", awsService: "API Gateway", icon: "apigw" },
  Rule: { kind: "job", subtype: "aws:eventbridge", awsService: "EventBridge", icon: "eventbridge" },
  Alarm: { kind: "job", subtype: "aws:cloudwatch", awsService: "CloudWatch", icon: "cloudwatch" },
  Dashboard: { kind: "job", subtype: "aws:cloudwatch", awsService: "CloudWatch", icon: "cloudwatch" },
  LogGroup: { kind: "job", subtype: "aws:logs", awsService: "CloudWatch Logs", icon: "logs" },
}

export function lookupSubtype(cdkClass: string): SubtypeEntry | undefined {
  return MAP[cdkClass]
}
