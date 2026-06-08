#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AocAppDataBucketStack } from '../lib/aoc-app-data-bucket-stack';

const app = new cdk.App();

// These values MUST be supplied via CDK context or environment variables at deploy time.
// Usage: npx cdk deploy --context env=dev --context team=my-team --context costCenter=CC-1234
const env = app.node.tryGetContext('env');
const team = app.node.tryGetContext('team');
const costCenter = app.node.tryGetContext('costCenter');

if (!env || !['dev', 'staging', 'prod'].includes(env)) {
  throw new Error(
    `[REQUIRED] CDK context 'env' must be one of: dev, staging, prod. ` +
    `Pass it with: --context env=<value>`
  );
}

if (!team) {
  throw new Error(
    `[REQUIRED] CDK context 'team' is required. ` +
    `Pass it with: --context team=<owning-team-name>`
  );
}

if (!costCenter || !/^CC-[0-9]{4}$/.test(costCenter)) {
  throw new Error(
    `[REQUIRED] CDK context 'costCenter' must match pattern CC-XXXX (e.g. CC-1234). ` +
    `Pass it with: --context costCenter=CC-1234`
  );
}

new AocAppDataBucketStack(app, `AocAppDataBucketStack-${env}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },
  envName:    env,
  team:       team,
  costCenter: costCenter,
  description: `AOC application data bucket for environment: ${env}`,
});

app.synth();