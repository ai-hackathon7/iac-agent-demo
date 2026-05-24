import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VpcConstruct } from './constructs/vpc-construct';

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  REQUIRED — Fill in every value marked <REQUIRED> before deploying.
//     All five tags are enforced by the org tagging policy v1.0.
// ─────────────────────────────────────────────────────────────────────────────

// ── Tagging policy — required values (supply before deploy) ──────────────────
const ENVIRONMENT: 'dev' | 'staging' | 'prod' = '<REQUIRED: dev | staging | prod>' as any;
const PROJECT      = '<REQUIRED: project short name>';      // e.g. "myapp"
const TEAM         = '<REQUIRED: owning team>';             // e.g. "platform"
const COST_CENTER  = '<REQUIRED: CC-XXXX>';                 // e.g. "CC-1234"

export class VpcStack extends cdk.Stack {
  public readonly vpcConstruct: VpcConstruct;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Apply org-required tags to every resource in this stack ──────────────
    // Tag policy v1.0 — all five keys are REQUIRED
    cdk.Tags.of(this).add('Environment', ENVIRONMENT);
    cdk.Tags.of(this).add('Project',     PROJECT);
    cdk.Tags.of(this).add('Team',        TEAM);
    cdk.Tags.of(this).add('CostCenter',  COST_CENTER);
    cdk.Tags.of(this).add('ManagedBy',   'cdk');            // corrected from 'terraform'

    // ── Instantiate org VPC module v2.1.0 ────────────────────────────────────
    this.vpcConstruct = new VpcConstruct(this, 'OrgVpc', {
      environment: ENVIRONMENT,
      project:     PROJECT,

      // ── Module defaults (matches plan config) ─────────────────────────────
      cidrBlock: '10.0.0.0/16',
      maxAzs:    3,
      enableNat: true,
      singleNat: false,   // one NAT GW per AZ — set true to reduce cost in dev/staging
    });
  }
}