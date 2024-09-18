import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { DemoResources } from "./demo-resources";
import { RdsExport } from "./rds-export";
import { S3Copy } from "./s3-copy";

export class RdsS3ExportCopyStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const { db, exportBucket, exportKey, destinationBucket, destinationKey } =
      new DemoResources(this, "DemoResources");

    const { stateMachine } = new S3Copy(this, "S3Copy", {
      source: {
        bucket: exportBucket,
        key: exportKey,
      },
      destination: {
        bucket: destinationBucket,
        key: destinationKey,
      },
    });

    new RdsExport(this, "RdsExport", {
      db,
      export: {
        bucket: exportBucket,
        key: exportKey,
      },
      copyStateMachine: stateMachine,
    });
  }
}
