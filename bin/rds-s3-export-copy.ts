#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { RdsS3ExportCopyStack } from "../lib/rds-s3-export-copy-stack";

const app = new cdk.App();
new RdsS3ExportCopyStack(app, "RdsS3ExportCopyStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
