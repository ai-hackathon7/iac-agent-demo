#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack';

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  REQUIRED: Replace every placeholder below before running `cdk deploy`.
//
//  environment  → one of: "dev" | "staging" | "prod"
//  project      → short project slug, e.g. "payments"
//  team         → owning team name,   e.g. "platform"
//  costCenter   → must match CC-XXXX, e.g. "CC-1234"
//  account      → 12-digit AWS account ID
//  region       → target region,      e.g. "us-east-1"
// ─────────────────────────────────────────────────────────────────────────────
const app = new cdk.App();

const environment = (app.node.tryGetContext('environment') ?? process.env.ENVIRONMENT) as
  | 'dev'
  | 'staging'
  | 'prod'
  | undefined;

const project    = app.node.tryGetContext('project')    ?? process.env.PROJECT;
const team       = app.node.tryGetContext('team')       ?? process.env.TEAM;
const costCenter = app.node.tryGetContext('costCenter') ?? process.env.COST_CENTER;
const account    = app.node.tryGetContext('account')    ?? process.env.CDK_DEFAULT_ACCOUNT;
const region     = app.node.tryGetContext('region')     ?? process.env.CDK_DEFAULT_REGION;

// ── Guard: fail fast if required values are missing ──────────────────────────
const missing: string[] = [];
if (!environment) missing.push('environment (dev|staging|prod)');
if (!project)     missing.push('project');
if (!team)        missing.push('team');
if (!costCenter)  missing.push('costCenter (CC-XXXX)');
if (!account)     missing.push('account (AWS account ID)');
if (!region)      missing.push('region');

if (missing.length > 0) {
  throw new Error(
    `\n\n❌ Missing required configuration values:\n` +
    missing.map(v => `   • ${v}`).join('\n') +
    `\n\nSupply them via CDK context or environment variables, e.g.:\n` +
    `  npx cdk deploy \\
    -c environment=dev \\
    -c project=payments \\
    -c team=platform \\
    -c costCenter=CC-1234 \\
    -c account=123456789012 \\
    -c region=us-east-1\n`
  );
}

new VpcStack(app, `${environment}-${project}-vpc-stack`, {
  // ── Org module inputs ──────────────────────────────────────────────────
  environment: environment!,
  project:     project!,
  team:        team!,
  costCenter:  costCenter!,

  // ── Set singleNat=true in non-prod to save ~$100/month per extra NAT GW ─
  singleNat: environment !== 'prod',

  // ── Deployment target ─────────────────────────────────────────────────
  env: {
    account: account!,
    region:  region!,
  },

  // ── Stack-level description ────────────────────────────────────────────
  description: `Org VPC module v2.1.0 — ${environment}-${project} networking baseline`,

  // ── Termination protection in prod ────────────────────────────────────
  terminationProtection: environment === 'prod',
});

app.synth();