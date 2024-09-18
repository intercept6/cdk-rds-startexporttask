import { Aws, Duration } from "aws-cdk-lib";
import { Rule } from "aws-cdk-lib/aws-events";
import { SfnStateMachine } from "aws-cdk-lib/aws-events-targets";
import {
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { IKey } from "aws-cdk-lib/aws-kms";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { IDatabaseCluster } from "aws-cdk-lib/aws-rds";
import { IBucket } from "aws-cdk-lib/aws-s3";
import {
  Choice,
  Condition,
  DefinitionBody,
  Fail,
  IStateMachine,
  JsonPath,
  LogLevel,
  Pass,
  StateMachine,
  Succeed,
  TaskInput,
  Wait,
  WaitTime,
} from "aws-cdk-lib/aws-stepfunctions";
import {
  CallAwsService,
  StepFunctionsStartExecution,
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";

export interface RdsExportProps {
  db: IDatabaseCluster;
  export: {
    bucket: IBucket;
    key: IKey;
  };
  copyStateMachine: IStateMachine;
}

export class RdsExport extends Construct {
  constructor(scope: Construct, id: string, props: RdsExportProps) {
    super(scope, id);

    const exportRole = new Role(this, "ExportRole", {
      assumedBy: new ServicePrincipal("export.rds.amazonaws.com"),
      inlinePolicies: {
        bucket: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: [
                "s3:PutObject*",
                "s3:ListBucket",
                "s3:GetObject*",
                "s3:DeleteObject*",
                "s3:GetBucketLocation",
              ],
              resources: [
                props.export.bucket.bucketArn,
                props.export.bucket.arnForObjects("*"),
              ],
            }),
          ],
        }),
        kms: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: [
                "kms:Encrypt",
                "kms:Decrypt",
                "kms:ReEncrypt*",
                "kms:GenerateDataKey*",
                "kms:CreateGrant",
                "kms:DescribeKey",
                "kms:RetireGrant",
              ],
              resources: [props.export.key.keyArn],
            }),
          ],
        }),
      },
    });

    const startTask = new CallAwsService(this, "StartExport", {
      service: "rds",
      action: "startExportTask",
      parameters: {
        ExportTaskIdentifier: JsonPath.format("snapshot-{}", JsonPath.uuid()),
        SourceArn: JsonPath.stringAt("$.detail.SourceArn"),
        S3BucketName: props.export.bucket.bucketName,
        IamRoleArn: exportRole.roleArn,
        KmsKeyId: props.export.key.keyArn,
      },
      additionalIamStatements: [
        new PolicyStatement({
          actions: ["iam:PassRole"],
          resources: [exportRole.roleArn],
        }),
      ],
      iamResources: [
        props.db.clusterArn,
        `arn:${Aws.PARTITION}:rds:${Aws.REGION}:${Aws.ACCOUNT_ID}:cluster-snapshot:*`,
        // `arn:${Aws.PARTITION}:rds:${Aws.REGION}:${Aws.ACCOUNT_ID}:snapshot:*`,
      ],
    });

    const describeTask = new CallAwsService(this, "DescribeExportTask", {
      service: "rds",
      action: "describeExportTasks",
      parameters: {
        ExportTaskIdentifier: JsonPath.stringAt("$.ExportTaskIdentifier"),
      },
      iamResources: ["*"],
    });

    const processOutput = new Pass(this, "ProcessOutput", {
      parameters: {
        ExportTaskIdentifier: JsonPath.stringAt(
          "$.ExportTasks[0].ExportTaskIdentifier"
        ),
        Status: JsonPath.stringAt("$.ExportTasks[0].Status"),
        SnapshotTime: JsonPath.stringAt("$.ExportTasks[0].SnapshotTime"),
        S3Bucket: JsonPath.stringAt("$.ExportTasks[0].S3Bucket"),
        S3Prefix: JsonPath.stringAt("$.ExportTasks[0].S3Prefix"),
        SourceType: JsonPath.stringAt("$.ExportTasks[0].SourceType"),
      },
    });

    const wait5min = new Wait(this, "Wait5min", {
      time: WaitTime.duration(Duration.minutes(5)),
    });

    const jobFailed = new Fail(this, "Export Failed", {
      cause: "RDS Export Failed",
      error: "DescribeExportTasks returned FAILED",
    });

    const jobSucceeded = new Succeed(this, "Export Succeeded");

    const copyObjects = new StepFunctionsStartExecution(this, "CopyObjects", {
      stateMachine: props.copyStateMachine,
      input: TaskInput.fromObject({
        s3Prefix: JsonPath.stringAt("$.ExportTaskIdentifier"),
        snapshotTime: JsonPath.stringAt("$.SnapshotTime"),
      }),
    });

    const exportComplete = new Choice(this, "Export Complete?");

    const exportJob = startTask
      .next(describeTask)
      .next(processOutput)
      .next(
        exportComplete
          .when(
            Condition.stringEquals("$.Status", "COMPLETE"),
            copyObjects.next(jobSucceeded)
          )
          .when(Condition.stringEquals("$.Status", "FAILED"), jobFailed)
          .when(Condition.stringEquals("$.Status", "CANCELED"), jobFailed)
          .otherwise(wait5min.next(describeTask))
      );

    const describeDbClusterSnapshots = new CallAwsService(
      this,
      "DescribeDBClusterSnapshots",
      {
        service: "rds",
        action: "describeDBClusterSnapshots",
        parameters: {
          DbClusterSnapshotIdentifier: JsonPath.stringAt("$.detail.SourceArn"),
        },
        iamAction: "rds:DescribeDBClusterSnapshots",
        iamResources: [
          props.db.clusterArn,
          `arn:${Aws.PARTITION}:rds:${Aws.REGION}:${Aws.ACCOUNT_ID}:cluster-snapshot:*`,
          // `arn:${Aws.PARTITION}:rds:${Aws.REGION}:${Aws.ACCOUNT_ID}:snapshot:*`,
        ],
        resultPath: "$.describeDbClusterSnapshots",
      }
    );

    const choise = new Choice(this, "CheckDBClusterIdentifier");
    const skip = new Succeed(this, "NotExpectedDBCluster", {
      comment: "期待するDBクラスターのスナップショットではありませんでした",
    });
    choise.when(
      Condition.not(
        Condition.stringEquals(
          "$.describeDbClusterSnapshots.DbClusterSnapshots[0].DbClusterIdentifier",
          props.db.clusterIdentifier
        )
      ),
      skip
    );

    const definition = describeDbClusterSnapshots.next(
      choise.otherwise(exportJob)
    );

    const stateMachine = new StateMachine(this, "StateMachine", {
      definitionBody: DefinitionBody.fromChainable(definition),
      timeout: Duration.hours(1),
      tracingEnabled: true,
      logs: {
        destination: new LogGroup(this, "LogGroup"),
        level: LogLevel.ALL,
        includeExecutionData: true,
      },
    });
    stateMachine.addToRolePolicy(
      new PolicyStatement({
        actions: [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:DescribeKey",
          "kms:RetireGrant",
        ],
        resources: [props.export.key.keyArn],
      })
    );

    new Rule(this, "RdsSnapshot", {
      eventPattern: {
        source: ["aws.rds"],
        detailType: ["RDS DB Cluster Snapshot Event"],
        detail: {
          EventID: [
            "RDS-EVENT-0075" /*手動スナップショット作成完了 */,
            "RDS-EVENT-0169" /*自動スナップショット作成完了 */,
          ],
        },
      },
      targets: [new SfnStateMachine(stateMachine)],
    });
  }
}
