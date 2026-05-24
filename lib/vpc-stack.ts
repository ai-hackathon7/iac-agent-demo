import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

// ─────────────────────────────────────────────────────────────────────────────
// REQUIRED: Fill in every value marked <REQUIRED> before running `cdk deploy`.
// Leaving a placeholder value will cause a deployment-time validation error.
// ─────────────────────────────────────────────────────────────────────────────

export interface VpcStackProps extends cdk.StackProps {
  /** Environment name. Allowed: dev | staging | prod */
  environment: 'dev' | 'staging' | 'prod';
  /** Short project name used in resource names and tags, e.g. "payments" */
  project: string;
  /** Owning team, e.g. "platform-eng" */
  team: string;
  /** Cost centre in the format CC-XXXX, e.g. "CC-4321" */
  costCenter: string;
}

export class VpcStack extends cdk.Stack {
  /** The provisioned VPC — expose for cross-stack references */
  public readonly vpc: ec2.Vpc;
  /** Resolved public subnets (one per AZ) */
  public readonly publicSubnets: ec2.ISubnet[];
  /** Resolved private subnets (one per AZ) */
  public readonly privateSubnets: ec2.ISubnet[];

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    // ── Input validation ───────────────────────────────────────────────────
    const allowedEnvs = ['dev', 'staging', 'prod'];
    if (!allowedEnvs.includes(props.environment)) {
      throw new Error(
        `Invalid environment "${props.environment}". Must be one of: ${allowedEnvs.join(', ')}`
      );
    }
    if (!props.project || props.project.trim() === '') {
      throw new Error('props.project is required and must not be empty.');
    }
    if (!props.team || props.team.trim() === '') {
      throw new Error('props.team is required and must not be empty.');
    }
    if (!/^CC-[0-9]{4}$/.test(props.costCenter)) {
      throw new Error(
        `props.costCenter must match pattern CC-XXXX (e.g. "CC-1234"). Got: "${props.costCenter}"`
      );
    }

    // ── Naming convention: {env}-{project}-vpc ─────────────────────────────
    const vpcName = `${props.environment}-${props.project}-vpc`;

    // ── Org-required tags applied to every resource in this stack ──────────
    // Tags are applied at the stack level so all child resources inherit them.
    cdk.Tags.of(this).add('Environment', props.environment);   // required
    cdk.Tags.of(this).add('Project',     props.project);       // required
    cdk.Tags.of(this).add('Team',        props.team);          // required
    cdk.Tags.of(this).add('CostCenter',  props.costCenter);    // required — CC-XXXX
    cdk.Tags.of(this).add('ManagedBy',   'cdk');               // required

    // ── VPC (org vpc module v2.1.0 — CDK equivalent) ───────────────────────
    // Module inputs:
    //   cidrBlock  : "10.0.0.0/16"  (org default; no custom CIDR supplied)
    //   maxAzs     : 3              (org default; HA across 3 AZs)
    //   enableNat  : true           (private subnet egress enabled)
    //   singleNat  : false          (one NAT GW per AZ for HA)
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 3,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      natGateways: 3, // singleNat=false → one NAT GW per AZ; set to 1 to reduce cost
      subnetConfiguration: [
        // Naming follows {env}-{project}-public-{az} convention
        {
          cidrMask:   20,
          name:       `${props.environment}-${props.project}-public`,
          subnetType: ec2.SubnetType.PUBLIC,
        },
        // Naming follows {env}-{project}-private-{az} convention
        {
          cidrMask:   20,
          name:       `${props.environment}-${props.project}-private`,
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // ── Expose subnet references for downstream stacks ─────────────────────
    this.publicSubnets  = this.vpc.publicSubnets;
    this.privateSubnets = this.vpc.privateSubnets;

    // ── Stack outputs (useful for cross-stack / CLI inspection) ────────────
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