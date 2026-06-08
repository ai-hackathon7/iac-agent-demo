#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AocAppDataBucketStack } from '../lib/aoc-app-data-bucket-stack';

// ─────────────────────────────────────────────────────────────────────────────
// Required environment variables
//
//   ENV              - dev | staging | prod
//   TEAM             - owning team name, e.g. "platform-engineering"
//   COST_CENTER      - cost center code matching CC-XXXX, e.g. "CC-1234"
//
// Optional environment variables (defaults shown):
//
//   DATA_CLASSIFICATION          - public | internal | confidential  (default: internal)
//   BACKUP                       - daily | weekly | none             (default: daily)
//   NONCURRENT_EXPIRATION_DAYS   - integer                           (default: 90)
//   TRANSITION_TO_IA_DAYS        - integer                           (default: 30)
//   TRANSITION_TO_GLACIER_DAYS   - integer                           (default: 90)
//
// Example deploy command:
//   ENV=prod \
//   TEAM=platform-engineering \
//   COST_CENTER=CC-4321 \
//   npx cdk deploy --all
// ─────────────────────────────────────────────────────────────────────────────

const app = new cdk.App();

// ── Resolve & validate required env vars ────────────────────────────────────
const envName = process.env.ENV as 'dev' | 'staging' | 'prod' | undefined;
if (!envName || !['dev', 'staging', 'prod'].includes(envName)) {
  throw new Error(
    'ENV environment variable must be set to one of: dev | staging | prod'
  );
}

const team = process.env.TEAM;
if (!team) {
  throw new Error(
    'TEAM environment variable must be set (e.g. "platform-engineering")'
  );
}

const costCenter = process.env.COST_CENTER;
if (!costCenter) {
  throw new Error(
    'COST_CENTER environment variable must be set and match pattern CC-XXXX (e.g. "CC-1234")'
  );
}

// ── Resolve optional env vars ────────────────────────────────────────────────
const dataClassification = (
  process.env.DATA_CLASSIFICATION as 'public' | 'internal' | 'confidential' | undefined
) ?? 'internal';

const backup = (
  process.env.BACKUP as 'daily' | 'weekly' | 'none' | undefined
) ?? 'daily';

const noncurrentVersionExpirationDays = process.env.NONCURRENT_EXPIRATION_DAYS
  ? parseInt(process.env.NONCURRENT_EXPIRATION_DAYS, 10)
  : undefined;

const transitionToIADays = process.env.TRANSITION_TO_IA_DAYS
  ? parseInt(process.env.TRANSITION_TO_IA_DAYS, 10)
  : undefined;

const transitionToGlacierDays = process.env.TRANSITION_TO_GLACIER_DAYS
  ? parseInt(process.env.TRANSITION_TO_GLACIER_DAYS, 10)
  : undefined;

// ── Instantiate stack ────────────────────────────────────────────────────────
new AocAppDataBucketStack(app, `AocAppDataBucketStack-${envName}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },

  // Required props
  env:        envName,
  team:       team,
  costCenter: costCenter,

  // Optional props
  dataClassification,
  backup,
  noncurrentVersionExpirationDays,
  transitionToIADays,
  transitionToGlacierDays,

  description: `AOC application data S3 bucket — ${envName}`,
});