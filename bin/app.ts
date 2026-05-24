#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack';

const app = new cdk.App();

// ---------------------------------------------------------------------------
// Context values — supply these via cdk.json, --context flags, or env vars.
// Example:
//   npx cdk synth --context env=dev --context project=myapp \
//                 --context team=platform --context costCenter=CC-1234
// ---------------------------------------------------------------------------
const env         = app.node.tryGetContext('env')        ?? 'dev';
const project     = app.node.tryGetContext('project')    ?? 'myapp';
const team        = app.node.tryGetContext('team')        ?? 'platform';
const costCenter  = app.node.tryGetContext('costCenter') ?? 'CC-0000';

new VpcStack(app, `${env}-${project}-vpc-stack`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },
  envName:    env,
  project:    project,
  team:       team,
  costCenter: costCenter,
});