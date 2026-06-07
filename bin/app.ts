#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { RdpAccessStack } from '../lib/rdp-access-stack';

const app = new cdk.App();

// ─────────────────────────────────────────────────────────────────────────────
// REQUIRED: Set these values before deploying.
// You may also pass them via CDK context flags:
//   npx cdk deploy --context env_name=dev --context project=myapp ...
// ─────────────────────────────────────────────────────────────────────────────
const env_name = (app.node.tryGetContext('env_name') ?? 'dev') as 'dev' | 'staging' | 'prod';
const project   = app.node.tryGetContext('project')   ?? 'CHANGE_ME';
const team      = app.node.tryGetContext('team')       ?? 'CHANGE_ME';
const costCenter = app.node.tryGetContext('costCenter') ?? 'CC-0000';

// ── Target AWS environment ────────────────────────────────────────────────────
const awsEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region:  process.env.CDK_DEFAULT_REGION,
};

// ─────────────────────────────────────────────────────────────────────────────
// VPC LOOKUP
// Option A — Import an existing VPC by ID (recommended for brownfield):
//   const vpc = ec2.Vpc.fromLookup(app, 'ExistingVpc', { vpcId: 'vpc-0abc123' });
//
// Option B — Import by tag (if your VPC has a known Name tag):
//   const vpc = ec2.Vpc.fromLookup(app, 'ExistingVpc', {
//     tags: { Name: 'dev-myapp-vpc' },
//   });
//
// Option C — Provision a new VPC in a separate stack and pass it in.
//
// Using a placeholder lookup below; REPLACE with actual VPC ID or construct.
// ─────────────────────────────────────────────────────────────────────────────

// Temporary CDK app-level scope needed for Vpc.fromLookup.
// Replace 'vpc-CHANGEME' with your real VPC ID.
const vpcLookupApp = new cdk.App(); // reuse `app` in real usage — shown separately for clarity
const vpc = ec2.Vpc.fromLookup(app, 'TargetVpc', {
  vpcId: app.node.tryGetContext('vpcId') ?? 'vpc-CHANGEME',
});

new RdpAccessStack(app, `${env_name}-${project}-RdpAccessStack`, {
  env_name,
  project,
  team,
  costCenter,
  vpc,
  // rdpSourceCidr: '10.0.0.0/16', // optional override; defaults to vpc.vpcCidrBlock
  env: awsEnv,
  description: 'RDP access security group — restricts TCP 3389 to VPC CIDR only',
});

app.synth();