import { Duration } from "aws-cdk-lib";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { IKey } from "aws-cdk-lib/aws-kms";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { IBucket } from "aws-cdk-lib/aws-s3";
import {
  Choice,
  Condition,
  DefinitionBody,
  JsonPath,
  LogLevel,
  Map,
  Pass,
  StateMachine,
  Succeed,
} from "aws-cdk-lib/aws-stepfunctions";
import {
  CallAwsService,
  CallAwsServiceProps,
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";

export interface S3CopyProps {
  maxConcurrency?: number;
  source: {
    bucket: IBucket;
    key: IKey;
  };
  destination: {
    bucket: IBucket;
    key: IKey;
  };
}

export class S3Copy extends Construct {
  public readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, props: S3CopyProps) {
    super(scope, id);

    const jobSucceeded = new Succeed(this, "Succeeded");

    const filterParquet = new Pass(this, "FilterParquetAndSuccess", {
      inputPath: JsonPath.stringAt(
        "$.ListObjects.Contents[?(@.Key =~ /.*_SUCCESS/i || @.Key =~ /.*parquet/i)]"
      ),
      resultPath: "$.ListObjects.FilterdContents",
    });

    const listObjectsProps: CallAwsServiceProps = {
      service: "s3",
      action: "listObjectsV2",
      parameters: {
        Bucket: props.source.bucket.bucketName,
        Prefix: JsonPath.stringAt("$.s3Prefix"),
      },
      iamResources: [`arn:aws:s3:::${props.source.bucket.bucketName}`],
      iamAction: "s3:ListBucket",
      additionalIamStatements: [
        new PolicyStatement({
          actions: ["s3:GetObject"],
          resources: [`arn:aws:s3:::${props.source.bucket.bucketName}/*`],
        }),
      ],
      resultPath: "$.ListObjects",
    };

    const listObjects = new CallAwsService(
      this,
      "ListObjects",
      listObjectsProps
    );

    const listObjectsWithToken = new CallAwsService(
      this,
      "ListObjectsWithToken",
      {
        ...listObjectsProps,
        parameters: {
          ...listObjectsProps.parameters,
          ContinuationToken: JsonPath.stringAt(
            "$.ListObjects.NextContinuationToken"
          ),
        },
      }
    );

    const split = JsonPath.stringSplit(JsonPath.stringAt("$.source.key"), "/");
    const db = JsonPath.arrayGetItem(split, 1);
    const table = JsonPath.arrayGetItem(split, 2);
    const hive = JsonPath.format(
      "partition_datetime={}",
      JsonPath.stringAt("$.snapshotTime")
    );
    const num = JsonPath.arrayGetItem(split, 3);
    const obj = JsonPath.arrayGetItem(split, 4);

    const formatDestinationKey = new Pass(this, "FormatDestinationKey", {
      parameters: {
        key: JsonPath.format("{}/{}/{}/{}/{}", db, table, hive, num, obj),
      },
      resultPath: "$.destination",
    });

    const copyS3Object = new CallAwsService(this, "CopyS3Object", {
      service: "s3",
      action: "copyObject",
      parameters: {
        Bucket: props.destination.bucket.bucketName,
        CopySource: JsonPath.format(
          `${props.source.bucket.bucketName}/{}`,
          JsonPath.stringAt("$.source.key")
        ),
        Key: JsonPath.stringAt("$.destination.key"),
      },
      iamResources: [`arn:aws:s3:::${props.source.bucket.bucketName}`],
      iamAction: "s3:ListBucket",
      additionalIamStatements: [
        // Read permission for source bucket
        new PolicyStatement({
          actions: ["s3:GetObject"],
          resources: [`arn:aws:s3:::${props.source.bucket.bucketName}/*`],
        }),
        new PolicyStatement({
          actions: ["kms:Decrypt"],
          resources: [props.source.key.keyArn],
        }),
        // Write permission for destination bucket
        new PolicyStatement({
          actions: ["s3:PutObject"],
          resources: [`arn:aws:s3:::${props.destination.bucket.bucketName}/*`],
        }),
        new PolicyStatement({
          actions: ["kms:GenerateDataKey"],
          resources: [props.destination.key.keyArn],
        }),
      ],
    });

    const checkIfAllListed = new Choice(this, "CheckIfAllListed");

    const maxConcurrency = props.maxConcurrency || 50;
    const map = new Map(this, "Map", {
      maxConcurrency,
      itemsPath: "$.ListObjects.FilterdContents",
      itemSelector: {
        snapshotTime: JsonPath.stringAt("$.snapshotTime"),
        source: {
          key: JsonPath.stringAt("$$.Map.Item.Value.Key"),
        },
      },
      resultPath: JsonPath.DISCARD,
    }).itemProcessor(formatDestinationKey.next(copyS3Object));

    const s3Copy = listObjects
      .next(filterParquet)
      .next(map)
      .next(
        checkIfAllListed
          .when(
            Condition.booleanEquals("$.ListObjects.IsTruncated", false),
            jobSucceeded
          )
          .otherwise(listObjectsWithToken.next(filterParquet))
      );

    const stateMachine = new StateMachine(this, "StateMachine", {
      definitionBody: DefinitionBody.fromChainable(s3Copy),
      timeout: Duration.hours(1),
      tracingEnabled: true,
      logs: {
        destination: new LogGroup(this, "LogGroup"),
        level: LogLevel.ALL,
        includeExecutionData: true,
      },
    });
    this.stateMachine = stateMachine;
  }
}
