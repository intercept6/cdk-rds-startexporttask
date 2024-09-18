import { CfnOutput } from "aws-cdk-lib";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { Key } from "aws-cdk-lib/aws-kms";
import {
  AuroraPostgresEngineVersion,
  ClusterInstance,
  DatabaseCluster,
  DatabaseClusterEngine,
} from "aws-cdk-lib/aws-rds";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export class DemoResources extends Construct {
  public readonly vpc: Vpc;
  public readonly db: DatabaseCluster;
  public readonly exportKey: Key;
  public readonly exportBucket: Bucket;
  public readonly destinationKey: Key;
  public readonly destinationBucket: Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const vpc = new Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
    });
    this.vpc = vpc;

    const db = new DatabaseCluster(this, "Cluster", {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_16_3,
      }),
      vpc,
      writer: ClusterInstance.serverlessV2("Writer"),
      enableDataApi: true,
      serverlessV2MaxCapacity: 16,
      defaultDatabaseName: "postgres",
    });
    if (db.secret?.secretFullArn != null) {
      new CfnOutput(this, "DBSecretFullArn", {
        value: db.secret.secretFullArn,
      });
    }
    this.db = db;

    const exportKey = new Key(this, "ExportKey");
    this.exportKey = exportKey;
    const exportBucket = new Bucket(this, "ExportBucket", {
      encryptionKey: exportKey,
    });
    this.exportBucket = exportBucket;

    const destinationKey = new Key(this, "DestinationKey");
    this.destinationKey = destinationKey;
    const destinationBucket = new Bucket(this, "DestinationBucket", {
      encryptionKey: destinationKey,
    });
    this.destinationBucket = destinationBucket;
  }
}
