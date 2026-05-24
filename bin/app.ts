#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/stack';

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  Fill in ALL values marked <REQUIRED> before running `npx cdk deploy`
// ─────────────────────────────────────────────────────────────────────────────

const app = new cdk.App();

// Read overrides from CDK context (--context key=value) or fall back to defaults.
// Usage: npx cdk deploy --context env=dev --context project=payments ...
const env         = (app.node.tryGetContext('env')         ?? '<REQUIRED: dev | staging | prod>') as 'dev' | 'staging' | 'prod';
const project     =  app.node.tryGetContext('project')     ?? '<REQUIRED: project short name>';
const team        =  app.node.tryGetContext('team')        ?? '<REQUIRED: owning team>';
const costCenter  =  app.node.tryGetContext('costCenter')  ?? '<REQUIRED: CC-XXXX>';
const cidrBlock   =  app.node.tryGetContext('cidrBlock');          // optional override
const singleNat   = (app.node.tryGetContext('singleNat') === 'true'); // optional, default false

new InfraStack(app, `${env}-${project}-vpc-stack`, {
  environment: env,
  project,
  team,
  costCenter,
  cidrBlock,   // undefined → uses module default 10.0.0.0/16
  singleNat,   // false     → one NAT per AZ (HA); set true to cut cost in non-prod
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },
});

app.synth();