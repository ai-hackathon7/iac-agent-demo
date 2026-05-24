import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

// ─────────────────────────────────────────────────────────────────────────────
// Org VPC Module v2.1.0  |  category: networking  |  format: cdk
// Mirrors: {env}-{project}-vpc naming convention
// ─────────────────────────────────────────────────────────────────────────────

export interface OrgVpcProps {
  /** Environment name — must be one of: dev | staging | prod */
  environment: 'dev' | 'staging' | 'prod';

  /** Project short name, e.g. "payments", "data-platform" */
  project: string;

  // ── Networking ──────────────────────────────────────────────────────────────
  /** VPC CIDR block. Default: 10.0.0.0/16 */
  cidrBlock?: string;

  /** Maximum number of Availability Zones to deploy across. Default: 3 */
  maxAzs?: number;

  /** Enable NAT Gateways for private subnet outbound access. Default: true */
  enableNat?: boolean;

  /**
   * Use a single shared NAT Gateway instead of one per AZ.
   * Set to true in non-prod environments to reduce cost. Default: false
   */
  singleNat?: boolean;

  // ── Required Tags (org policy v1.0) ─────────────────────────────────────────
  /** Owning team */
  team: string;

  /** Cost center — must match pattern CC-XXXX */
  costCenter: string;

  // ── Optional Tags ────────────────────────────────────────────────────────────
  dataClassification?: 'public' | 'internal' | 'confidential';
  backup?: 'daily' | 'weekly' | 'none';
}

export class OrgVpc extends Construct {
  /** The underlying CDK VPC instance */
  public readonly vpc: ec2.Vpc;

  /** All public subnets (one per AZ) */
  public readonly publicSubnets: ec2.ISubnet[];

  /** All private subnets (one per AZ) */
  public readonly privateSubnets: ec2.ISubnet[];

  constructor(scope: Construct, id: string, props: OrgVpcProps) {
    super(scope, id);

    const {
      environment,
      project,
      cidrBlock   = '10.0.0.0/16',
      maxAzs      = 3,
      enableNat   = true,
      singleNat   = false,
      team,
      costCenter,
      dataClassification,
      backup,
    } = props;

    // ── Naming convention: {env}-{project}-vpc ─────────────────────────────────
    const vpcName = `${environment}-${project}-vpc`;

    // ── NAT Gateway configuration ──────────────────────────────────────────────
    const natGateways = !enableNat
      ? 0
      : singleNat
        ? 1
        : maxAzs; // one per AZ (HA default)

    // ── VPC ───────────────────────────────────────────────────────────────────
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName,
      ipAddresses:  ec2.IpAddresses.cidr(cidrBlock),
      maxAzs,
      natGateways,
      enableDnsHostnames: true,
      enableDnsSupport:   true,
      subnetConfiguration: [
        {
          // Naming mirrors: {env}-{project}-public-{az}
          name:       `${environment}-${project}-public`,
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask:   20, // /20 per subnet ≈ 4096 IPs; fits 3 AZs within /16
        },
        {
          // Naming mirrors: {env}-{project}-private-{az}
          name:       `${environment}-${project}-private`,
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask:   20,
        },
      ],
    });

    // ── Required org tags (policy v1.0) ───────────────────────────────────────
    cdk.Tags.of(this.vpc).add('Environment', environment);
    cdk.Tags.of(this.vpc).add('Project',     project);
    cdk.Tags.of(this.vpc).add('Team',        team);
    cdk.Tags.of(this.vpc).add('CostCenter',  costCenter);
    cdk.Tags.of(this.vpc).add('ManagedBy',   'cdk');

    // ── Optional org tags ─────────────────────────────────────────────────────
    if (dataClassification) {
      cdk.Tags.of(this.vpc).add('DataClassification', dataClassification);
    }
    if (backup) {
      cdk.Tags.of(this.vpc).add('Backup', backup);
    }

    // ── Expose subnets (mirrors module outputs) ───────────────────────────────
    this.publicSubnets  = this.vpc.publicSubnets;
    this.privateSubnets = this.vpc.privateSubnets;
  }
}