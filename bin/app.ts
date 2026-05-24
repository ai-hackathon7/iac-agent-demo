#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack';

const app = new cdk.App();

// ─── Required context values ───────────────────────────────────────────────
// Pass these via `cdk deploy --context env=dev --context project=myapp ...`
// or hard-code them below before deployment.
const env         = app.node.tryGetContext('env')         ?? '<REQUIRED: dev | staging | prod>';
const project     = app.node.tryGetContext('project')     ?? '<REQUIRED: project short name>';
const team        = app.node.tryGetContext('team')        ?? '<REQUIRED: owning team>';
const costCenter  = app.node.tryGetContext('costCenter')  ?? '<REQUIRED: CC-XXXX>';

new VpcStack(app, `${env}-${project}-vpc-stack`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },
  environment: env,
  project:     project,
  team:        team,
  costCenter:  costCenter,
});