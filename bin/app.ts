#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/stacks/infra-stack';

// ---------------------------------------------------------------------------
// Required runtime values — supply via cdk.json "context" block or CLI flags:
//   npx cdk synth \
//     --context env=dev \
//     --context project=myapp \
//     --context team=platform \
//     --context costCenter=CC-1234
//
// Alternatively, set them in cdk.json under "context":
//   {
//     "context": {
//       "env": "dev",
//       "project": "myapp",
//       "team": "platform",
//       "costCenter": "CC-1234"
//     }
//   }
// ---------------------------------------------------------------------------

const app = new cdk.App();

// ---- Resolve context values with clear error messages ----------------------
function requireContext(app: cdk.App, key: string): string {
  const value = app.node.tryGetContext(key) as string | undefined;
  if (!value) {
    throw new Error(
      `Missing required CDK context value: "${key}". ` +
      `Provide it via --context ${key}=<value> or in cdk.json.`,
    );
  }
  return value;
}

const env          = requireContext(app, 'env');         // dev | staging | prod
const project      = requireContext(app, 'project');     // e.g. myapp
const team         = requireContext(app, 'team');        // e.g. platform
const costCenter   = requireContext(app, 'costCenter');  // e.g. CC-1234

// Validate env against tagging policy allowed values
const allowedEnvs = ['dev', 'staging', 'prod'];
if (!allowedEnvs.includes(env)) {
  throw new Error(
    `Context "env" must be one of [${allowedEnvs.join(', ')}], got: "${env}".`,
  );
}

// Validate costCenter pattern: CC-[0-9]{4}
if (!/^CC-\d{4}$/.test(costCenter)) {
  throw new Error(
    `Context "costCenter" must match pattern CC-[0-9]{4} (e.g. CC-1234), got: "${costCenter}".`,
  );
}

new InfraStack(app, `${env}-${project}-infra`, {
  env: env,
  project,
  team,
  costCenter,
  // AWS environment — set via CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION or
  // override explicitly: { account: '123456789012', region: 'us-east-1' }
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION,
  },
  description: `${env} ${project} — VPC and Bastion Security Group`,
});

app.synth();