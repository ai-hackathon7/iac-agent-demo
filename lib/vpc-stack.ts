import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

// ─── Stack props ────────────────────────────────────────────────────────────
export interface VpcStackProps extends cdk.StackProps {
  /** Environment name — must be one of: dev | staging | prod  (required) */
  environment: string;
  /** Project short name, e.g. "myapp"                         (required) */
  project: string;
  /** Owning team name                                         (required) */
  team: string;
  /** Cost-center code, pattern CC-XXXX                        (required) */
  costCenter: string;

  // ── VPC tunables (all have org-standard defaults) ──────────────────────
  /** VPC CIDR block.           Default: 10.0.0.0/16 */
  cidrBlock?: string;
  /** Max availability zones.  Default: 3 */
  maxAzs?: number;
  /** Enable NAT gateways.     Default: true */
  enableNat?: boolean;
  /** Single shared NAT GW (cost-saving). Default: false (one per AZ) */
  singleNat?: boolean;
}

// ─── Stack ──────────────────────────────────────────────────────────────────
export class VpcStack extends cdk.Stack {
  /** The created VPC — expose for cross-stack references */
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    // ── Resolve config with org-standard defaults ────────────────────────
    const cidrBlock = props.cidrBlock ?? '10.0.0.0/16';
    const maxAzs    = props.maxAzs    ?? 3;
    const enableNat = props.enableNat ?? true;
    const singleNat = props.singleNat ?? false;

    // ── Org naming convention: {env}-{project}-vpc ───────────────────────
    const vpcName = `${props.environment}-${props.project}-vpc`;

    // ── Required tags — applied to every resource in this stack ──────────
    // Policy v1.0 · ManagedBy updated to 'cdk' (was 'terraform' in the plan)
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project',     props.project);
    cdk.Tags.of(this).add('Team',        props.team);
    cdk.Tags.of(this).add('CostCenter',  props.costCenter);
    cdk.Tags.of(this).add('ManagedBy',   'cdk');

    // ── Subnet CIDR layout (mirrors org Terraform module v2.1.0) ─────────
    //   Public  subnets → /20 blocks starting at index 0
    //   Private subnets → /20 blocks starting at index maxAzs
    //   (cidrsubnet("10.0.0.0/16", 4, n) gives /20 blocks, matching the
    //    module's `cidrsubnet(var.cidr_block, 4, count.index)` logic)
    const subnetConfig: ec2.SubnetConfiguration[] = [
      {
        cidrMask:   20,
        name:       `${props.environment}-${props.project}-public`,
        subnetType: ec2.SubnetType.PUBLIC,
        mapPublicIpOnLaunch: false,
      },
      {
        cidrMask:   20,
        name:       `${props.environment}-${props.project}-private`,
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    ];

    // ── NAT Gateway count ─────────────────────────────────────────────────
    //   singleNat: false → one NAT GW per AZ (HA, matches org default)
    //   singleNat: true  → one shared NAT GW  (cost-saving for non-prod)
    const natGateways = !enableNat ? 0
                      : singleNat  ? 1
                      : maxAzs;           // one per AZ

    // ── VPC construct (L2) ────────────────────────────────────────────────
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName,
      ipAddresses:        ec2.IpAddresses.cidr(cidrBlock),
      maxAzs,
      natGateways,
      subnetConfiguration: subnetConfig,
      enableDnsHostnames:  true,   // matches aws_vpc.enable_dns_hostnames
      enableDnsSupport:    true,   // matches aws_vpc.enable_dns_support
    });

    // ── Stack outputs (mirrors Terraform output block) ────────────────────
    new cdk.CfnOutput(this, 'VpcId', {
      value:       this.vpc.vpcId,
      description: 'VPC ID',
      exportName:  `${vpcName}-id`,
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value:       cdk.Fn.join(',', this.vpc.publicSubnets.map(s => s.subnetId)),
      description: 'Comma-separated list of public subnet IDs',
      exportName:  `${vpcName}-public-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value:       cdk.Fn.join(',', this.vpc.privateSubnets.map(s => s.subnetId)),
      description: 'Comma-separated list of private subnet IDs',
      exportName:  `${vpcName}-private-subnet-ids`,
    });
  }
}