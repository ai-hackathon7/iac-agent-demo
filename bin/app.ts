#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack';

const app = new cdk.App();

new VpcStack(app, 'VpcStack', {
  // ── Optional: pin to a specific AWS account and region ───────────────────
  // env: {
  //   account: process.env.CDK_DEFAULT_ACCOUNT,
  //   region:  process.env.CDK_DEFAULT_REGION,
  // },
  description: 'Org-standard VPC — public/private subnets across 3 AZs with NAT gateways',
});

app.synth();