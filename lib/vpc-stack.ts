import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

// ─── Stack Props ─────────────────────────────────────────────────────────────

export interface VpcStackProps extends cdk.StackProps {
  /** Environment name — must be one of: dev | staging | prod */
  envName: string;
  /** Project short name used in all resource names, e.g. "myapp" */
  project: string;
  /** Owning team, e.g. "platform" */
  team: string;
  /** Cost centre in format CC-XXXX, e.g. "CC-1234" */
  costCenter: string;

  // ── VPC tunables (all have org-standard defaults) ──────────────────────────
  /** VPC CIDR block. Default: 10.0.0.0/16 (org standard) */
  cidrBlock?: string;
  /** Maximum number of Availability Zones to use. Default: 3 */
  maxAzs?: number;
  /** Enable NAT Gateways for private-subnet egress. Default: true */
  enableNat?: boolean;
  /**
   * Use a single shared NAT Gateway instead of one-per-AZ.
   * Reduces cost in non-prod environments at the expense of AZ resilience.
   * Default: false (one NAT per AZ, as required by the org vpc module v2.1.0)
   */
  singleNat?: boolean;
}

// ─── Stack ───────────────────────────────────────────────────────────────────

export class VpcStack extends cdk.Stack {
  /** The VPC construct — consumable by downstream stacks */
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    const {
      envName,
      project,
      team,
      costCenter,
      cidrBlock = '10.0.0.0/16',   // org vpc module v2.1.0 default
      maxAzs    = 3,                 // org vpc module v2.1.0 default
      enableNat = true,              // org vpc module v2.1.0 default
      singleNat = false,             // org vpc module v2.1.0 default
    } = props;

    // ── Validate required tag values ─────────────────────────────────────────
    const allowedEnvs = ['dev', 'staging', 'prod'];
    if (!allowedEnvs.includes(envName)) {
      throw new Error(
        `[tagging-policy] 'envName' must be one of ${allowedEnvs.join(' | ')}. Got: "${envName}"`
      );
    }
    if (!/^CC-\d{4}$/.test(costCenter)) {
      throw new Error(
        `[tagging-policy] 'costCenter' must match pattern CC-XXXX (e.g. CC-1234). Got: "${costCenter}"`
      );
    }

    // ── Org-required tags applied to every resource in this stack ─────────────
    // Source: tagging-policy v1.0
    cdk.Tags.of(this).add('Environment', envName);
    cdk.Tags.of(this).add('Project',     project);
    cdk.Tags.of(this).add('Team',        team);
    cdk.Tags.of(this).add('CostCenter',  costCenter);
    cdk.Tags.of(this).add('ManagedBy',   'cdk');   // corrected from plan's "terraform"

    // ── Naming convention: {env}-{project}-vpc ────────────────────────────────
    // Source: get_naming_conventions (resource_type=vpc)
    const vpcName = `${envName}-${project}-vpc`;

    // ── Subnet configuration ──────────────────────────────────────────────────
    // Mirrors the org Terraform module's public/private subnet layout.
    // cidrMask: /20 per subnet — 4,096 IPs each, supporting the module's
    // cidrsubnet(cidr, 4, index) logic for a /16 parent block.
    const subnetConfig: ec2.SubnetConfiguration[] = [
      {
        // Naming convention: {env}-{project}-public-{az}
        // CDK appends the AZ suffix automatically.
        name:       `${envName}-${project}-public`,
        subnetType: ec2.SubnetType.PUBLIC,
        cidrMask:   20,
      },
      {
        // Naming convention: {env}-{project}-private-{az}
        name:       `${envName}-${project}-private`,
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        cidrMask:   20,
      },
    ];

    // ── Determine NAT Gateway count ───────────────────────────────────────────
    // singleNat=false → one NAT per AZ (high-availability, org default)
    // singleNat=true  → one shared NAT  (cost-saving option for non-prod)
    const natGateways = !enableNat ? 0 : singleNat ? 1 : maxAzs;

    // ── VPC (org module: vpc v2.1.0) ──────────────────────────────────────────
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName,
      ipAddresses:        ec2.IpAddresses.cidr(cidrBlock),
      maxAzs,
      natGateways,
      enableDnsHostnames: true,   // mirrors aws_vpc.enable_dns_hostnames = true
      enableDnsSupport:   true,   // mirrors aws_vpc.enable_dns_support   = true
      subnetConfiguration: subnetConfig,
    });

    // ── Stack outputs ─────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'VpcId', {
      value:       this.vpc.vpcId,
      description: 'VPC ID',
      exportName:  `${envName}-${project}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value:       cdk.Fn.join(',', this.vpc.publicSubnets.map(s => s.subnetId)),
      description: 'Comma-separated list of public subnet IDs',
      exportName:  `${envName}-${project}-public-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value:       cdk.Fn.join(',', this.vpc.privateSubnets.map(s => s.subnetId)),
      description: 'Comma-separated list of private subnet IDs',
      exportName:  `${envName}-${project}-private-subnet-ids`,
    });
  }
}