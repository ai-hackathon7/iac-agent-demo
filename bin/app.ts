#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';

const app = new cdk.App();

// ---------------------------------------------------------------------------
// Runtime context – supply via `cdk deploy --context env=dev --context
// project=myapp --context team=platform --context costCenter=CC-1234`
// ---------------------------------------------------------------------------
const env     = app.node.tryGetContext('env')        ?? 'dev';
const project = app.node.tryGetContext('project')    ?? 'myapp';
const team    = app.node.tryGetContext('team')        ?? 'platform';
const costCenter = app.node.tryGetContext('costCenter') ?? 'CC-0000';

new NetworkStack(app, `${env}-${project}-network`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },
  envName:    env,
  project,
  team,
  costCenter,
});