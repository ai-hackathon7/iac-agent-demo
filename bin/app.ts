#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/infra-stack';

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  FILL IN ALL REQUIRED VALUES BELOW BEFORE RUNNING `npx cdk synth`
//
//  environment  → 'dev' | 'staging' | 'prod'
//  project      → short name, e.g. 'payments'   (used in all resource names)
//  team         → owning team, e.g. 'platform-eng'
//  costCenter   → must match CC-XXXX, e.g. 'CC-4210'
// ─────────────────────────────────────────────────────────────────────────────

const app = new cdk.App();

// Read from CDK context (-c flags) or fall back to env vars for CI pipelines.
// Usage:
//   npx cdk synth -c environment=dev -c project=payments -c team=platform-eng -c costCenter=CC-4210
// Or via environment variables:
//   CDK_ENV=dev CDK_PROJECT=payments CDK_TEAM=platform-eng CDK_COST_CENTER=CC-4210 npx cdk synth

const environment = (app.node.tryGetContext('environment') ?? process.env.CDK_ENV)         as 'dev' | 'staging' | 'prod';
const project     =  app.node.tryGetContext('project')     ?? process.env.CDK_PROJECT;
const team        =  app.node.tryGetContext('team')        ?? process.env.CDK_TEAM;
const costCenter  =  app.node.tryGetContext('costCenter')  ?? process.env.CDK_COST_CENTER;

// ── Guard: fail at synth time if any required value is missing ─────────────
const missing: string[] = [];
if (!environment) missing.push('environment (dev|staging|prod)');
if (!project)     missing.push('project (short name)');
if (!team)        missing.push('team (owning team)');
if (!costCenter)  missing.push('costCenter (CC-XXXX)');

if (missing.length > 0) {
  throw new Error(
    `\n\n❌ Missing required context values:\n` +
    missing.map(m => `   • ${m}`).join('\n') +
    `\n\nProvide them via -c flags or environment variables. See bin/app.ts for details.\n`
  );
}

new InfraStack(app, `${environment}-${project}-vpc-stack`, {
  stackName:   `${environment}-${project}-vpc-stack`,
  description: `Org VPC module v2.1.0 — ${project} (${environment})`,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },

  // ── Required ──────────────────────────────────────────────────────────────
  environment,
  project,
  team,
  costCenter,

  // ── Defaults matching plan (all overridable via context or props) ─────────
  cidrBlock: '10.0.0.0/16',
  maxAzs:    3,
  enableNat: true,
  singleNat: false,          // ← flip to true in dev/staging to save NAT costs
});