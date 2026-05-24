#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack';

const app = new cdk.App();

// ─────────────────────────────────────────────────────────────────────────────
// ⚠ FILL IN THE FOUR REQUIRED VALUES BELOW BEFORE RUNNING `cdk deploy`
// ─────────────────────────────────────────────────────────────────────────────
const environment = (app.node.tryGetContext('environment') ?? 'dev') as
  'dev' | 'staging' | 'prod';                // --context environment=prod
const project     =  app.node.tryGetContext('project')     ?? 'myproject';  // --context project=payments
const team        =  app.node.tryGetContext('team')        ?? 'platform-infra'; // --context team=platform-infra
const costCenter  =  app.node.tryGetContext('costCenter')  ?? 'CC-0000';    // --context costCenter=CC-4321

new VpcStack(app, `${environment}-${project}-vpc-stack`, {
  environment,
  project,
  team,
  costCenter,
  env: {
    // Pin account + region, or leave as CDK_DEFAULT_* for environment-agnostic deploy
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },
  description: `Org VPC module v2.1.0 — ${environment}/${project}`,
});