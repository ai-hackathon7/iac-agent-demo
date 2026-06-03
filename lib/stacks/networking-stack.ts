import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VpcConstruct } from '../constructs/vpc-construct';

// ─────────────────────────────────────────────────────────────────────────────
// NetworkingStack
//
// Deploys the org-standard VPC (module v2.1.0) with:
//   • 10.0.0.0/16 CIDR across 3 AZs
//   • Public subnets  → routed via Internet Gateway
//   • Private subnets → routed via NAT Gateway (1 per AZ for HA)
//   • VPC Flow Logs   → CloudWatch Logs
//
// ⚠️  BEFORE DEPLOYING — fill in every value marked TODO:
//      environment, project, Team, CostCenter
// ─────────────────────────────────────────────────────────────────────────────

export interface NetworkingStackProps extends cdk.StackProps {
  /** dev | staging | prod */
  environment: string;
  /** Project short name, e.g. "myapp" */
  project: string;
  /** Owning team name, e.g. "platform" */
  team: string;
  /**
   * Cost-center code — must match pattern CC-XXXX
   * e.g. "CC-1234"
   */
  costCenter: string;
  /** VPC CIDR block. Default: 10.0.0.0/16 */
  cidrBlock?: string;
  /** Maximum AZs to deploy into. Default: 3 */
  maxAzs?: number;
  /**
   * Use a single NAT Gateway to reduce cost.
   * Recommended: false (HA) for prod, true for dev/staging.
   * Default: false
   */
  singleNat?: boolean;
}

export class NetworkingStack extends cdk.Stack {
  public readonly vpcConstruct: VpcConstruct;

  constructor(scope: Construct, id: string, props: NetworkingStackProps) {
    super(scope, id, props);

    const {
      environment,
      project,
      team,
      costCenter,
      cidrBlock   = '10.0.0.0/16',
      maxAzs      = 3,
      singleNat   = false,
    } = props;

    // ── Stack-level tags (inherited by every child resource) ──────────────
    // Required by org tagging policy v1.0
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('Project',     project);
    cdk.Tags.of(this).add('Team',        team);
    cdk.Tags.of(this).add('CostCenter',  costCenter);
    cdk.Tags.of(this).add('ManagedBy',   'cdk');         // corrected from plan's "terraform"

    // ── Org VPC Module v2.1.0 ─────────────────────────────────────────────
    this.vpcConstruct = new VpcConstruct(this, 'VpcConstruct', {
      cidrBlock,
      maxAzs,
      enableNat: true,
      singleNat,
      environment,
      project,
    });

    // ── Stack outputs ─────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'VpcId', {
      description: 'VPC ID',
      value:       this.vpcConstruct.vpc.vpcId,
      exportName:  `${environment}-${project}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      description: 'Comma-separated public subnet IDs',
      value:       this.vpcConstruct.publicSubnets.map(s => s.subnetId).join(','),
      exportName:  `${environment}-${project}-public-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      description: 'Comma-separated private subnet IDs',
      value:       this.vpcConstruct.privateSubnets.map(s => s.subnetId).join(','),
      exportName:  `${environment}-${project}-private-subnet-ids`,
    });
  }
}