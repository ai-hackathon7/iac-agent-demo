#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AocAppDataBucketStack } from '../lib/aoc-app-data-bucket-stack';

const app = new cdk.App();

// ---------------------------------------------------------------------------
// ⚠️  REQUIRED — replace every placeholder before deploying
// ---------------------------------------------------------------------------
new AocAppDataBucketStack(app, 'AocAppDataBucketStack', {

  // --- Deployment target (must match the AWS account/region you deploy into) ---
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT, // or hardcode: '123456789012'
    region:  process.env.CDK_DEFAULT_REGION,  // or hardcode: 'us-east-1'
  },

  // --- Required: choose your target environment ---
  env_name: 'dev',           // ⚠️  REPLACE with 'dev' | 'staging' | 'prod'

  // --- Required tags (no defaults — must be supplied) ---
  owningTeam: 'REPLACE_ME',  // ⚠️  e.g. 'platform-eng'
  costCenter: 'CC-XXXX',     // ⚠️  e.g. 'CC-1234'  (pattern: CC-[0-9]{4})

  // --- Optional tags (safe defaults applied; adjust if needed) ---
  dataClassification: 'internal', // review if data is 'confidential'
  backup:             'daily',    // adjust to 'weekly' or 'none' if needed
});

app.synth();