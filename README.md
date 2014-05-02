A readable stream of CloudWatch alarms that are associated with a specified
CloudFormation stack.

- It's not a stream, yet
- Reduces threshold on all alarms down to 60s
- Ignores alarms that only have AutoScaling AlarmActions
