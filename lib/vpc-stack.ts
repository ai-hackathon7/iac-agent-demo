import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

// ─────────────────────────────────────────────────────────────────────────────
// Org VPC Module v2.1.0
// Provisions: VPC, public + private subnets (per AZ), IGW, NAT gateways,
//             and all associated route tables — mirroring the org vpc module.
// ─────────────────────────────────────────────────────────────────────────────

export interface OrgVpcProps {
  /** VPC CIDR block. Default: 10.0.0.0/16 */
  readonly cidrBlock?: string;
  /** Number of availability zones. Default: 3 */
  readonly maxAzs?: number;
  /** Enable NAT gateways for private subnet egress. Default: true */
  readonly enableNat?: boolean;
  /**
   * Use a single shared NAT gateway instead of one-per-AZ.
   * Recommended true for dev/staging, false for prod. Default: false
   */
  readonly singleNat?: boolean;
  /** Environment name: dev | staging | prod */
  readonly environment: 'dev' | 'staging' | 'prod';
  /** Project short name, e.g. "payments" */
  readonly project: string;
}

/**
 * OrgVpc — CDK implementation of the org-standard VPC module (v2.1.0).
 *
 * Naming pattern : {env}-{project}-vpc
 * Subnet pattern : {env}-{project}-{public|private}-{az-suffix}
 */
export class OrgVpc extends Construct {
  /** The provisioned VPC */
  public readonly vpc: ec2.Vpc;
  /** Public subnets (one per AZ) */
  public readonly publicSubnets: ec2.ISubnet[];
  /** Private subnets (one per AZ) */
  public readonly privateSubnets: ec2.ISubnet[];

  constructor(scope: Construct, id: string, props: OrgVpcProps) {
    super(scope, id);

    const {
      cidrBlock = '10.0.0.0/16',
      maxAzs = 3,
      enableNat = true,
      singleNat = false,
      environment,
      project,
    } = props;

    // ── Derive NAT gateway count per org module logic ─────────────────────
    // singleNat: true  → 1 NAT gateway shared across all AZs  (cost saving)
    // singleNat: false → 1 NAT gateway per AZ                 (prod resilient)
    const natGateways = !enableNat ? 0 : singleNat ? 1 : maxAzs;

    // ── VPC name follows org pattern: {env}-{project}-vpc ─────────────────
    const vpcName = `${environment}-${project}-vpc`;

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName,
      ipAddresses: ec2.IpAddresses.cidr(cidrBlock),
      maxAzs,
      natGateways,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      // Subnet names follow org pattern: {env}-{project}-{tier}
      // CDK appends the AZ suffix automatically, e.g. "dev-payments-Public/us-east-1a"
      subnetConfiguration: [
        {
          cidrMask: 20, // /20 per subnet — 4094 usable IPs, matches org module cidrsubnet(..., 4, ...)
          name: `${environment}-${project}-Public`,
          subnetType: ec2.SubnetType.PUBLIC,
          mapPublicIpOnLaunch: false, // org standard: no auto-assign public IPs
        },
        {
          cidrMask: 20,
          name: `${environment}-${project}-Private`,
          subnetType: enableNat
            ? ec2.SubnetType.PRIVATE_WITH_EGRESS
            : ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // ── Expose subnet lists (mirrors module outputs) ───────────────────────
    this.publicSubnets  = this.vpc.publicSubnets;
    this.privateSubnets = this.vpc.privateSubnets;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stack
// ─────────────────────────────────────────────────────────────────────────────

export interface VpcStackProps extends cdk.StackProps {
  /** ⚠ REQUIRED — dev | staging | prod */
  readonly environment: 'dev' | 'staging' | 'prod';
  /** ⚠ REQUIRED — project short name, e.g. "payments" */
  readonly project: string;
  /** ⚠ REQUIRED — owning team, e.g. "platform-infra" */
  readonly team: string;
  /** ⚠ REQUIRED — cost centre in format CC-XXXX, e.g. "CC-4321" */
  readonly costCenter: string;
}

export class VpcStack extends cdk.Stack {
  public readonly orgVpc: OrgVpc;

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    const { environment, project, team, costCenter } = props;

    // ── Required tags (org tagging policy v1.0) ───────────────────────────
    // Applied at stack level so every resource inherits them automatically.
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('Project',     project);
    cdk.Tags.of(this).add('Team',        team);
    cdk.Tags.of(this).add('CostCenter',  costCenter);   // pattern: CC-XXXX
    cdk.Tags.of(this).add('ManagedBy',   'cdk');        // corrected from plan default 'terraform'

    // ── Org VPC Module v2.1.0 ─────────────────────────────────────────────
    this.orgVpc = new OrgVpc(this, 'OrgVpc', {
      cidrBlock:   '10.0.0.0/16',
      maxAzs:      3,
      enableNat:   true,
      singleNat:   false,           // one NAT per AZ → prod-grade resilience
      environment,
      project,
    });

    // ── Stack outputs (mirrors module outputs: vpc_id, subnet ID lists) ───
    new cdk.CfnOutput(this, 'VpcId', {
      value:       this.orgVpc.vpc.vpcId,
      description: 'VPC ID',
      exportName:  `${environment}-${project}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value:       cdk.Fn.join(',', this.orgVpc.publicSubnets.map(s => s.subnetId)),
      description: 'Comma-separated list of public subnet IDs',
      exportName:  `${environment}-${project}-public-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value:       cdk.Fn.join(',', this.orgVpc.privateSubnets.map(s => s.subnetId)),
      description: 'Comma-separated list of private subnet IDs',
      exportName:  `${environment}-${project}-private-subnet-ids`,
    });
  }
}