#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack';

const app = new cdk.App();

// ─────────────────────────────────────────────────────────────────────────────
// !! ACTION REQUIRED !!
// Replace every <REQUIRED: ...> placeholder below with a real value before
// running `cdk synth` or `cdk deploy`.
// ─────────────────────────────────────────────────────────────────────────────

new VpcStack(app, 'VpcStack', {
  // ── REQUIRED — choose: 'dev' | 'staging' | 'prod' ────────────────────────
  environment: '<REQUIRED: dev | staging | prod>' as 'dev' | 'staging' | 'prod',

  // ── REQUIRED — short project identifier, e.g. 'payments' ─────────────────
  project: '<REQUIRED: project short name>',

  // ── REQUIRED — owning team, e.g. 'platform-eng' ───────────────────────────
  team: '<REQUIRED: owning team>',

  // ── REQUIRED — must match CC-XXXX, e.g. 'CC-4321' ─────────────────────────
  costCenter: '<REQUIRED: CC-XXXX>',

  // ── AWS deployment target ─────────────────────────────────────────────────
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },

  description: 'Org-standard VPC with public/private subnets and NAT Gateways (vpc module v2.1.0)',
});