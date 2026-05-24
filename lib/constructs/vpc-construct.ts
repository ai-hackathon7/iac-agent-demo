import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

// ─────────────────────────────────────────────
// Org Module: vpc v2.1.0
// Category:   networking
// Description: Standard VPC with public/private subnets and NAT gateways
// ─────────────────────────────────────────────

export interface VpcConstructProps {
  /** VPC CIDR block. Default: 10.0.0.0/16 */
  readonly cidrBlock?: string;
  /** Maximum number of availability zones. Default: 3 */
  readonly maxAzs?: number;
  /** Enable NAT gateways for private subnet egress. Default: true */
  readonly enableNat?: boolean;
  /** Use a single shared NAT gateway to reduce cost. Default: false (one NAT per AZ) */
  readonly singleNat?: boolean;
  /** REQUIRED — Environment name: dev | staging | prod */
  readonly environment: 'dev' | 'staging' | 'prod';
  /** REQUIRED — Project short name */
  readonly project: string;
}

export class VpcConstruct extends Construct {
  /** Provisioned VPC instance — ec2.Vpc */
  public readonly vpc: ec2.Vpc;
  /** List of public ISubnet */
  public readonly publicSubnets: ec2.ISubnet[];
  /** List of private ISubnet */
  public readonly privateSubnets: ec2.ISubnet[];

  constructor(scope: Construct, id: string, props: VpcConstructProps) {
    super(scope, id);

    const cidrBlock   = props.cidrBlock  ?? '10.0.0.0/16';
    const maxAzs      = props.maxAzs     ?? 3;
    const enableNat   = props.enableNat  ?? true;
    const singleNat   = props.singleNat  ?? false;

    // ── Naming convention: {env}-{project}-vpc ──────────────────────────────
    const vpcName = `${props.environment}-${props.project}-vpc`;

    // ── Subnet naming convention: {env}-{project}-{tier}-{az} ───────────────
    const natGateways = !enableNat ? 0 : singleNat ? 1 : maxAzs;

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName,
      ipAddresses:  ec2.IpAddresses.cidr(cidrBlock),
      maxAzs,
      natGateways,
      enableDnsHostnames: true,
      enableDnsSupport:   true,
      subnetConfiguration: [
        {
          // {env}-{project}-public-{az}
          name:       `${props.environment}-${props.project}-public`,
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask:   20,  // /20 per subnet — 4-bit offset mirrors module logic on a /16
        },
        {
          // {env}-{project}-private-{az}
          name:       `${props.environment}-${props.project}-private`,
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask:   20,
        },
      ],
    });

    // ── Expose module outputs ────────────────────────────────────────────────
    this.publicSubnets  = this.vpc.publicSubnets;
    this.privateSubnets = this.vpc.privateSubnets;

    // ── CDK Outputs (mirrors module output contract) ─────────────────────────
    new cdk.CfnOutput(this, 'VpcId', {
      value:       this.vpc.vpcId,
      description: 'VPC ID',
      exportName:  `${props.environment}-${props.project}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value:       cdk.Fn.join(',', this.publicSubnets.map(s => s.subnetId)),
      description: 'Public subnet IDs (comma-separated)',
      exportName:  `${props.environment}-${props.project}-public-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value:       cdk.Fn.join(',', this.privateSubnets.map(s => s.subnetId)),
      description: 'Private subnet IDs (comma-separated)',
      exportName:  `${props.environment}-${props.project}-private-subnet-ids`,
    });
  }
}