#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AocAppDataBucketStack } from '../lib/aoc-app-data-bucket-stack';

const app = new cdk.App();

// ── Context / environment resolution ───────────────────────────────────────
// These values MUST be supplied before deployment — either via cdk.json,
// CDK context flags (--context key=value), or environment variables.
//
// Example synth command:
//   npx cdk synth \
//     --context env_name=dev \
//     --context team=platform-engineering \
//     --context costCenter=CC-1234
// ───────────────────────────────────────────────────────────────────────────

type EnvName = 'dev' | 'staging' | 'prod';

const env_name   = (app.node.tryGetContext('env_name')   as EnvName)  ?? throwCtx('env_name');
const team       = (app.node.tryGetContext('team')        as string)   ?? throwCtx('team');
const costCenter = (app.node.tryGetContext('costCenter')  as string)   ?? throwCtx('costCenter');

// Optional — fall back to safe defaults defined in the stack
const dataClassification = app.node.tryGetContext('dataClassification') as
  'public' | 'internal' | 'confidential' | undefined;
const backup = app.node.tryGetContext('backup') as
  'daily' | 'weekly' | 'none' | undefined;

new AocAppDataBucketStack(app, `AocAppDataBucket-${env_name}`, {
  env_name,
  team,
  costCenter,
  dataClassification,
  backup,
  env: {
    // Resolve to the deploying account/region so the bucket name token
    // (cdk.Aws.ACCOUNT_ID) resolves correctly at synth time.
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },
});

app.synth();

/** Throws a clear error when a required CDK context variable is missing. */
function throwCtx(key: string): never {
  throw new Error(
    `Missing required CDK context value: "${key}". ` +
    `Pass it with --context ${key}=<value> or add it to cdk.json.`
  );
}