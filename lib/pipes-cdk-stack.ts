import { Filter, FilterPattern, Pipe } from '@aws-cdk/aws-pipes-alpha';
import { ApiDestinationEnrichment } from '@aws-cdk/aws-pipes-enrichments-alpha';
import { KinesisSource, KinesisStartingPosition, SqsSource } from '@aws-cdk/aws-pipes-sources-alpha';
import { KinesisTarget, SfnStateMachine } from '@aws-cdk/aws-pipes-targets-alpha';
import * as cdk from 'aws-cdk-lib';
import { ApiDestination, Authorization, Connection, HttpMethod } from 'aws-cdk-lib/aws-events';
import { Stream } from 'aws-cdk-lib/aws-kinesis';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { DefinitionBody, Pass, StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class PipesCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    /**
     * Example 1 
     * Kinesis to Kinesis with filter
     */
    const sourceStream = new Stream(this, 'SourceClickStream', {
      streamName: 'SourceClickStream',
    });

    const targetStream = new Stream(this, 'TargetStream', {
      streamName: 'TargetStream',
    });

    const pipe = new Pipe(this, 'Pipe', {
      source: new KinesisSource(sourceStream, {
        startingPosition: KinesisStartingPosition.TRIM_HORIZON,

      }),
      filter: new Filter(
        [
          FilterPattern.fromObject({
            body: {
              // only forward events with customerType B2B or B2C
              customerType: ['B2B', 'B2C']
            },
          })
        ]
      ),
      target: new KinesisTarget(targetStream, {
        partitionKey: "1"
      }),
    })

    /**
     * Example 2
     * SQS to Step function with api destination enrichment
     */

    const ticketQueue = new Queue(this, 'TicketQueue', {});
    const passTask = new Pass(this, 'PassTask', {});
    const stepFunction = new StateMachine(this, 'StepFunction', {
      definitionBody: DefinitionBody.fromChainable(passTask),

    });

    const apiSecret = new Secret(this, "ApiKey")
    const connection = new Connection(this, 'Connection', {
      authorization: Authorization.apiKey('x-api-key', apiSecret.secretValue),
      description: 'Connection with API Key x-api-key',
    });

    const destination = new ApiDestination(this, 'Destination', {
      connection,
      endpoint: 'https://jsonplaceholder.typicode.com/todos/*',
      description: 'Calling example.com with API key x-api-key',
      httpMethod: HttpMethod.GET,
    });
    const enrichment = new ApiDestinationEnrichment(destination, {
      pathParameterValues: ["$.body.id"]
    });

    const sqsToStepfunctionPipe = new Pipe(this, 'SqsToStepFunctionPipe', {
      source: new SqsSource(ticketQueue, {
      }),
      target: new SfnStateMachine(stepFunction, {

      }),
      enrichment: enrichment,
    })

  }
}
