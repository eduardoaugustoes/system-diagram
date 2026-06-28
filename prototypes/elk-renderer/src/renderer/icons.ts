export interface IconDef {
  id: string
  label: string
}

const ICONS: Record<string, IconDef> = {
  "aws:lambda": { id: "lambda", label: "Lambda" },
  "aws:dynamodb": { id: "dynamodb", label: "DynamoDB" },
  "aws:sqs": { id: "sqs", label: "SQS" },
  "aws:sns": { id: "sns", label: "SNS" },
  "aws:secret": { id: "secret", label: "Secrets Manager" },
  "aws:apigw": { id: "apigw", label: "API Gateway" },
  "aws:eventbridge": { id: "eventbridge", label: "EventBridge" },
  "aws:cloudwatch": { id: "cloudwatch", label: "CloudWatch" },
  "aws:logs": { id: "logs", label: "Log Group" },
  "aws:route53": { id: "route53", label: "Route 53" },
  "aws:acm": { id: "acm", label: "ACM" },
}

export function iconForSubtype(subtype: string | undefined): IconDef | undefined {
  return subtype ? ICONS[subtype] : undefined
}
