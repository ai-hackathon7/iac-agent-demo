#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkingStack } from '../lib/stacks/networking-stack';

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  REQUIRED — Replace every TODO value before running `cdk deploy`
// ─────────────────────────────────────────────────────────────────────────────
const app = new cdk.App();

new NetworkingStack(app, 'NetworkingStack', {
  // ── REQUIRED: fill in these values ───────────────────────────────────────
  environment: app.node.tryGetContext('environment') ?? 'TODO: dev | staging | prod',
  project:     app.node.tryGetContext('project')     ?? 'TODO: your-project-shortname',
  team:        app.node.tryGetContext('team')         ?? 'TODO: your-team-name',
  costCenter:  app.node.tryGetContext('costCenter')  ?? 'TODO: CC-XXXX',

  // ── Optional overrides (safe defaults shown) ─────────────────────────────
  cidrBlock: '10.0.0.0/16',  // ← change if this conflicts with existing address space
  maxAzs:    3,
  singleNat: false,           // ← set to true in dev/staging to reduce NAT Gateway cost

  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },
});

app.synth();