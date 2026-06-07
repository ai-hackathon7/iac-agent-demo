#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BastionInfraStack } from '../lib/stack';

const app = new cdk.App();

// ---------------------------------------------------------------------------
// ⚠️  REPLACE all placeholder values before running `cdk deploy`
// ---------------------------------------------------------------------------
const env     = 'dev';           // allowed: dev | staging | prod
const project = 'myproject';     // short project identifier, no spaces
const team    = 'my-team';       // owning team name
const costCenter = 'CC-0000';    // must match pattern CC-[0-9]{4}
// ---------------------------------------------------------------------------

new BastionInfraStack(app, 'BastionInfraStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },
  appEnv:      env,
  project:     project,
  team:        team,
  costCenter:  costCenter,
});