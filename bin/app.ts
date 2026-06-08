#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AocAppDataStack } from '../lib/aoc-app-data-stack';

const app = new cdk.App();

// ─────────────────────────────────────────────────────────────────────────────
// Context values — supply via cdk.json, --context flags, or environment vars.
// Required: env, team, costCenter
// Example:
//   npx cdk deploy --context env=prod --context team=platform --context costCenter=CC-1234
// ─────────────────────────────────────────────────────────────────────────────

const env     = app.node.tryGetContext('env')        as string;
const team    = app.node.tryGetContext('team')       as string;
const costCenter = app.node.tryGetContext('costCenter') as string;

// Validate required context values before synth
const allowedEnvs = ['dev', 'staging', 'prod'];
if (!env || !allowedEnvs.includes(env)) {
  throw new Error(
    `[REQUIRED] 'env' context must be one of: ${allowedEnvs.join(', ')}.\n` +
    `  Pass via: npx cdk deploy --context env=<value>`
  );
}
if (!team) {
  throw new Error(
    `[REQUIRED] 'team' context is missing — must be the owning team name.\n` +
    `  Pass via: npx cdk deploy --context team=<value>`
  );
}
if (!costCenter || !/^CC-[0-9]{4}$/.test(costCenter)) {
  throw new Error(
    `[REQUIRED] 'costCenter' context is missing or invalid — must match pattern CC-XXXX.\n` +
    `  Pass via: npx cdk deploy --context costCenter=CC-1234`
  );
}

new AocAppDataStack(app, `AocAppDataStack-${env}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },
  appEnv:    env,
  team:      team,
  costCenter: costCenter,
});

app.synth();