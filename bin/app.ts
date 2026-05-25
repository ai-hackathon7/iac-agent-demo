#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/stack';

const app = new cdk.App();

// ---------------------------------------------------------------------------
// Runtime context — supply these via `cdk deploy` context flags or cdk.json:
//   npx cdk deploy -c env=dev -c project=myapp -c team=platform -c costCenter=CC-1234
// ---------------------------------------------------------------------------
const env     = app.node.tryGetContext('env')        ?? '{env}';        // REQUIRED: dev | staging | prod
const project = app.node.tryGetContext('project')    ?? '{project}';    // REQUIRED: project short name
const team    = app.node.tryGetContext('team')        ?? '{team}';       // REQUIRED: owning team
const costCenter = app.node.tryGetContext('costCenter') ?? 'CC-XXXX';   // REQUIRED: format CC-0000

new InfraStack(app, `${env}-${project}-infra-stack`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },
  // Pass resolved context values to the stack
  stackEnv:    env,
  project:     project,
  team:        team,
  costCenter:  costCenter,
});