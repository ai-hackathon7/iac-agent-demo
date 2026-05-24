import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

// ─────────────────────────────────────────────────────────────────────────────
// Org VPC Module v2.1.0 — CDK translation
// Source module: vpc (networking category)
// Standard VPC with public/private subnets and NAT gateways
// ─────────────────────────────────────────────────────────────────────────────

export interface VpcConstructProps {
  /** VPC CIDR block. Default: 10.0.0.0/16 */
  cidrBlock?: string;
  /** Maximum number of availability zones. Default: 3 */
  maxAzs?: number;
  /** Enable NAT gateways for private subnet egress. Default: true */
  enableNat?: boolean;
  /** Use a single NAT gateway to reduce cost (non-prod). Default: false */
  singleNat?: boolean;
  /** REQUIRED — Environment name: dev | staging | prod */
  environment: 'dev' | 'staging' | 'prod';
  /** REQUIRED — Project short name (e.g. "myapp") */
  project: string;
}

export class VpcConstruct extends Construct {
  /** The provisioned VPC instance */
  public readonly vpc: ec2.Vpc;
  /** Public subnets (one per AZ) */
  public readonly publicSubnets: ec2.ISubnet[];
  /** Private subnets (one per AZ) */
  public readonly privateSubnets: ec2.ISubnet[];

  constructor(scope: Construct, id: string, props: VpcConstructProps) {
    super(scope, id);

    // ── Resolve inputs with module defaults ──────────────────────────────────
    const cidrBlock = props.cidrBlock ?? '10.0.0.0/16';
    const maxAzs    = props.maxAzs    ?? 3;
    const enableNat = props.enableNat ?? true;
    const singleNat = props.singleNat ?? false;

    // ── Org naming convention: {env}-{project}-vpc ───────────────────────────
    const vpcName = `${props.environment}-${props.project}-vpc`;

    // ── Resolve NAT gateway count ─────────────────────────────────────────────
    // singleNat=true  → 1 NAT GW (cost-saving, non-prod)
    // singleNat=false → 1 NAT GW per AZ (production-grade resiliency)
    const natGateways = !enableNat ? 0 : singleNat ? 1 : maxAzs;

    // ── VPC ───────────────────────────────────────────────────────────────────
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName,
      ipAddresses:     ec2.IpAddresses.cidr(cidrBlock),
      maxAzs,
      natGateways,
      enableDnsHostnames: true,   // mirrors module: enable_dns_hostnames = true
      enableDnsSupport:   true,   // mirrors module: enable_dns_support   = true
      subnetConfiguration: [
        {
          // Org subnet naming: {env}-{project}-public-{az}
          // CDK appends the AZ suffix automatically
          name:       `${props.environment}-${props.project}-public`,
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask:   20,   // /20 from a /16 base ≈ cidrsubnet(cidr, 4, index)
        },
        {
          // Org subnet naming: {env}-{project}-private-{az}
          name:       `${props.environment}-${props.project}-private`,
          subnetType: enableNat
            ? ec2.SubnetType.PRIVATE_WITH_EGRESS
            : ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask:   20,
        },
      ],
    });

    // ── Expose module outputs ─────────────────────────────────────────────────
    this.publicSubnets  = this.vpc.publicSubnets;
    this.privateSubnets = this.vpc.privateSubnets;

    // ── CDK stack-level outputs (mirror Terraform outputs) ────────────────────
    new cdk.CfnOutput(this, 'VpcId', {
      value:       this.vpc.vpcId,
      description: 'VPC ID',
      exportName:  `${vpcName}-id`,
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value:       cdk.Fn.join(',', this.publicSubnets.map(s => s.subnetId)),
      description: 'Comma-separated list of public subnet IDs',
      exportName:  `${vpcName}-public-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value:       cdk.Fn.join(',', this.privateSubnets.map(s => s.subnetId)),
      description: 'Comma-separated list of private subnet IDs',
      exportName:  `${vpcName}-private-subnet-ids`,
    });
  }
}