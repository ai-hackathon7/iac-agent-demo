import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

// ─────────────────────────────────────────────
// Stack Props — replace ALL placeholder values
// before running `npx cdk deploy`
// ─────────────────────────────────────────────
export interface VpcStackProps extends cdk.StackProps {
  /** Must be one of: dev | staging | prod */
  readonly environment: 'dev' | 'staging' | 'prod';
  /** Short project identifier, e.g. "payments" */
  readonly project: string;
  /** Owning team name, e.g. "platform-eng" */
  readonly team: string;
  /** Cost center in format CC-XXXX, e.g. "CC-1234" */
  readonly costCenter: string;
  /** Optional: data classification level */
  readonly dataClassification?: 'public' | 'internal' | 'confidential';

  // VPC tunables (all have org-module defaults)
  readonly cidrBlock?: string;   // default: 10.0.0.0/16
  readonly maxAzs?: number;      // default: 3
  readonly enableNat?: boolean;  // default: true
  readonly singleNat?: boolean;  // default: false  (one NAT per AZ — HA)
}

export class VpcStack extends cdk.Stack {
  /** The created VPC — importable by downstream stacks */
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    // ── Resolve config with module defaults ──────────────────────────────
    const cidrBlock  = props.cidrBlock  ?? '10.0.0.0/16';
    const maxAzs     = props.maxAzs     ?? 3;
    const enableNat  = props.enableNat  ?? true;
    const singleNat  = props.singleNat  ?? false;

    // ── Org naming convention: {env}-{project}-vpc ────────────────────────
    const baseName = `${props.environment}-${props.project}`;

    // ── Required tags (applied to every resource in this stack) ──────────
    // Source: get_tagging_policy v1.0
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project',     props.project);
    cdk.Tags.of(this).add('Team',        props.team);
    cdk.Tags.of(this).add('CostCenter',  props.costCenter);
    cdk.Tags.of(this).add('ManagedBy',   'cdk');

    // ── Optional tags ─────────────────────────────────────────────────────
    if (props.dataClassification) {
      cdk.Tags.of(this).add('DataClassification', props.dataClassification);
    }

    // ─────────────────────────────────────────────────────────────────────
    // VPC  (org module: vpc v2.1.0)
    // Pattern : {env}-{project}-vpc
    // Subnets : public  → {env}-{project}-public-{az}
    //           private → {env}-{project}-private-{az}
    // ─────────────────────────────────────────────────────────────────────
    const natGateways = !enableNat ? 0 : singleNat ? 1 : maxAzs;

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `${baseName}-vpc`,                         // {env}-{project}-vpc
      ipAddresses: ec2.IpAddresses.cidr(cidrBlock),
      maxAzs,
      natGateways,
      subnetConfiguration: [
        {
          // public tier — one subnet per AZ
          // name becomes: {env}-{project}-public-{az}
          cidrMask:   24,
          name:       `${baseName}-public`,
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          // private tier — one subnet per AZ, egress via NAT
          // name becomes: {env}-{project}-private-{az}
          cidrMask:   24,
          name:       `${baseName}-private`,
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // ── Stack outputs ─────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'VpcId', {
      value:       this.vpc.vpcId,
      description: 'VPC ID',
      exportName:  `${baseName}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value:       cdk.Fn.join(',', this.vpc.publicSubnets.map(s => s.subnetId)),
      description: 'Comma-separated list of public subnet IDs',
      exportName:  `${baseName}-public-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value:       cdk.Fn.join(',', this.vpc.privateSubnets.map(s => s.subnetId)),
      description: 'Comma-separated list of private subnet IDs',
      exportName:  `${baseName}-private-subnet-ids`,
    });
  }
}