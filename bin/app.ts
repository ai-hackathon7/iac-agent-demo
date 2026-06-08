#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AocAppDataStack } from '../lib/aoc-app-data-stack';

const app = new cdk.App();

// ---------------------------------------------------------------------------
// ⚠️  REQUIRED: Replace ALL placeholder values below before deploying.
//    env_name   → 'dev' | 'staging' | 'prod'
//    owningTeam → your team name (e.g. 'platform', 'backend')
//    costCenter → cost centre code matching CC-XXXX (e.g. 'CC-1234')
//    account    → your 12-digit AWS account ID
//    region     → target AWS region (e.g. 'eu-west-1')
// ---------------------------------------------------------------------------
new AocAppDataStack(app, 'AocAppDataStack', {
  env_name: 'dev',            // TODO: replace with target environment
  owningTeam: 'REPLACE_ME',   // TODO: replace with owning team name
  costCenter: 'CC-0000',      // TODO: replace with valid cost centre (CC-XXXX)

  // Optional — defaults to 'internal'. Change to 'confidential' if needed.
  dataClassification: 'internal',

  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT, // or hardcode: '123456789012'
    region:  process.env.CDK_DEFAULT_REGION,  // or hardcode: 'eu-west-1'
  },
});

app.synth();