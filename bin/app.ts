#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack';

const app = new cdk.App();

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  ⚠  REPLACE every placeholder value before deploying  ⚠            ║
// ╠══════════════════════════════════════════════════════════════════════╣
// ║  environment  → 'dev' | 'staging' | 'prod'                          ║
// ║  project      → your project short name  (e.g. 'payments')          ║
// ║  team         → owning team              (e.g. 'platform-eng')      ║
// ║  costCenter   → format CC-XXXX           (e.g. 'CC-1234')           ║
// ╚══════════════════════════════════════════════════════════════════════╝

new VpcStack(app, 'VpcStack', {
  // ── Required: fill these in ──────────────────────────────────────────
  environment:        'dev',             // TODO: replace with target env
  project:            'myproject',       // TODO: replace with project name
  team:               'my-team',         // TODO: replace with owning team
  costCenter:         'CC-0000',         // TODO: replace with real cost center

  // ── Optional: uncomment to override ─────────────────────────────────
  // dataClassification: 'internal',
  // cidrBlock:          '10.0.0.0/16',  // module default
  // maxAzs:             3,              // module default
  // enableNat:          true,           // module default
  // singleNat:          false,          // false = one NAT/AZ (HA); true = cheaper

  // ── AWS deployment target ─────────────────────────────────────────────
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },
});

app.synth();