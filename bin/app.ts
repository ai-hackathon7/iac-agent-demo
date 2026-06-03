#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack';

const app = new cdk.App();

new VpcStack(app, 'VpcStack', {
  // ── Required: replace these placeholder values before deploying ──────────
  environment: 'dev',           // REQUIRED — allowed: 'dev' | 'staging' | 'prod'
  project:     'myproject',     // REQUIRED — short project name (e.g. 'payments')
  team:        'REPLACE_ME',    // REQUIRED — owning team name (e.g. 'platform')
  costCenter:  'CC-0000',       // REQUIRED — format: CC-XXXX (e.g. 'CC-1234')
  // ── Optional tags ────────────────────────────────────────────────────────
  // dataClassification: 'internal',   // 'public' | 'internal' | 'confidential'
  // backup:             'none',        // 'daily' | 'weekly' | 'none'
  // ── VPC config (override org defaults if needed) ──────────────────────
  // singleNat: true,   // set true in dev/staging to reduce NAT Gateway cost
  // ─────────────────────────────────────────────────────────────────────────
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },
});