import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VpcConstruct } from './constructs/vpc-construct';

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  REQUIRED INPUTS — replace every placeholder before deploying
//     Environment : 'dev' | 'staging' | 'prod'
//     Project     : your project short name  e.g. 'payments'
//     Team        : owning team name         e.g. 'platform'
//     CostCenter  : must match CC-XXXX       e.g. 'CC-1234'
// ─────────────────────────────────────────────────────────────────────────────

export interface InfraStackProps extends cdk.StackProps {
  readonly environment: 'dev' | 'staging' | 'prod';
  readonly project:     string;
  readonly team:        string;
  readonly costCenter:  string;   // must match pattern: CC-[0-9]{4}
  /** Override default CIDR 10.0.0.0/16 if it conflicts with existing ranges */
  readonly cidrBlock?:  string;
  /** Set true in non-prod to use a single NAT gateway and reduce cost */
  readonly singleNat?:  boolean;
}

export class InfraStack extends cdk.Stack {
  public readonly vpcConstruct: VpcConstruct;

  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    // ── Validate CostCenter format at synth-time ─────────────────────────────
    if (!/^CC-\d{4}$/.test(props.costCenter)) {
      throw new Error(
        `CostCenter "${props.costCenter}" does not match required pattern CC-XXXX (e.g. CC-1234)`
      );
    }

    // ── Org-required tags applied to every resource in the stack ─────────────
    // Tagging policy v1.0 — required: Environment, Project, Team, CostCenter, ManagedBy
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project',     props.project);
    cdk.Tags.of(this).add('Team',        props.team);
    cdk.Tags.of(this).add('CostCenter',  props.costCenter);
    cdk.Tags.of(this).add('ManagedBy',   'cdk');

    // ── Org VPC Module v2.1.0 ─────────────────────────────────────────────────
    this.vpcConstruct = new VpcConstruct(this, 'Vpc', {
      environment: props.environment,
      project:     props.project,
      cidrBlock:   props.cidrBlock ?? '10.0.0.0/16',
      maxAzs:      3,
      enableNat:   true,
      singleNat:   props.singleNat ?? false,
    });
  }
}