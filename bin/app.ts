#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AocAppDataBucketStack } from '../lib/aoc-app-data-bucket-stack';

const app = new cdk.App();

// ─────────────────────────────────────────────────────────────────────────────
// ⚠  REQUIRED — fill in these values before running `cdk deploy`
// ─────────────────────────────────────────────────────────────────────────────
const ENV        = (app.node.tryGetContext('env')        ?? 'dev')             as 'dev' | 'staging' | 'prod';
const ACCOUNT_ID = (app.node.tryGetContext('accountId')  ?? process.env.CDK_DEFAULT_ACCOUNT ?? 'ACCOUNT_ID_REQUIRED');
const TEAM       = (app.node.tryGetContext('team')       ?? 'TEAM_REQUIRED');
const COST_CENTER= (app.node.tryGetContext('costCenter') ?? 'CC-0000');        // ⚠ replace with real cost centre

// Example deploy command:
//   npx cdk deploy \
//     -c env=prod \
//     -c accountId=123456789012 \
//     -c team=platform-engineering \
//     -c costCenter=CC-4231

new AocAppDataBucketStack(app, `AocAppDataBucketStack-${ENV}`, {
  env: ENV,
  accountId: ACCOUNT_ID,
  team: TEAM,
  costCenter: COST_CENTER,

  // CDK environment — pins the stack to the target account/region
  env: {
    account: ACCOUNT_ID,
    region:  process.env.CDK_DEFAULT_REGION ?? 'us-east-1',  // ⚠ see ASSUMPTIONS
  },

  // Stack-level description
  description: `AOC application data bucket — ${ENV} (ManagedBy: cdk)`,

  // Stack-level termination protection — prevents accidental `cdk destroy`
  terminationProtection: ENV === 'prod',
});

app.synth();