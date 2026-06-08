#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkingStack } from '../lib/networking-stack';

// ─────────────────────────────────────────────────────────────────────────────
//  ⚠️  REQUIRED: Replace ALL placeholder values below before deploying.
//
//  environment  — must be one of: dev | staging | prod
//  project      — short project identifier, e.g. "payments" or "platform"
//  team         — owning team name, e.g. "platform-eng"
//  costCenter   — org cost center in format CC-XXXX, e.g. "CC-4201"
//  account      — 12-digit AWS account ID
//  region       — target AWS region, e.g. "us-east-1"
// ─────────────────────────────────────────────────────────────────────────────
const environment = process.env.ENVIRONMENT as 'dev' | 'staging' | 'prod'
  ?? (() => { throw new Error('ENVIRONMENT env var is required (dev | staging | prod)'); })();

const project    = process.env.PROJECT     ?? (() => { throw new Error('PROJECT env var is required'); })();
const team       = process.env.TEAM        ?? (() => { throw new Error('TEAM env var is required'); })();
const costCenter = process.env.COST_CENTER ?? (() => { throw new Error('COST_CENTER env var is required (format: CC-XXXX)'); })();

// Validate CostCenter format
if (!/^CC-[0-9]{4}$/.test(costCenter)) {
  throw new Error(`COST_CENTER must match pattern CC-XXXX (e.g. CC-4201), got: "${costCenter}"`);
}

// Validate environment value
if (!['dev', 'staging', 'prod'].includes(environment)) {
  throw new Error(`ENVIRONMENT must be one of dev | staging | prod, got: "${environment}"`);
}

const app = new cdk.App();

new NetworkingStack(app, `${environment}-${project}-networking`, {
  environment,
  project,
  team,
  costCenter,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },
  description: `Org-standard VPC networking stack — ${environment}/${project}`,
  terminationProtection: environment === 'prod', // protect prod from accidental destroy
});

app.synth();