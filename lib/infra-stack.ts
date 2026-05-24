import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { OrgVpc, OrgVpcProps } from './vpc-construct';

// ─────────────────────────────────────────────────────────────────────────────
// StackProps — all REQUIRED fields are surfaced here with no defaults so that
// a missing value fails loudly at synth time rather than silently at deploy.
// ─────────────────────────────────────────────────────────────────────────────

export interface InfraStackProps extends cdk.StackProps {
  /** dev | staging | prod */
  environment: OrgVpcProps['environment'];

  /** Project short name, e.g. "payments" */
  project: string;

  /** Owning team, e.g. "platform-eng" */
  team: string;

  /** Cost center — format CC-XXXX, e.g. "CC-4210" */
  costCenter: string;

  // ── Optional overrides ─────────────────────────────────────────────────────
  cidrBlock?:          string;
  maxAzs?:             number;
  enableNat?:          boolean;
  singleNat?:          boolean;
  dataClassification?: OrgVpcProps['dataClassification'];
  backup?:             OrgVpcProps['backup'];
}

export class InfraStack extends cdk.Stack {
  public readonly orgVpc: OrgVpc;

  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    const {
      environment,
      project,
      team,
      costCenter,
      cidrBlock,
      maxAzs,
      enableNat,
      singleNat,
      dataClassification,
      backup,
    } = props;

    // ── Stack-level tags propagate to every resource in this stack ─────────────
    // (The OrgVpc construct also tags the VPC directly; these provide a fallback
    //  for any future resources added to the stack.)
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('Project',     project);
    cdk.Tags.of(this).add('Team',        team);
    cdk.Tags.of(this).add('CostCenter',  costCenter);
    cdk.Tags.of(this).add('ManagedBy',   'cdk');

    if (dataClassification) cdk.Tags.of(this).add('DataClassification', dataClassification);
    if (backup)             cdk.Tags.of(this).add('Backup', backup);

    // ── Org VPC Module v2.1.0 ─────────────────────────────────────────────────
    this.orgVpc = new OrgVpc(this, 'OrgVpc', {
      environment,
      project,
      team,
      costCenter,
      cidrBlock,
      maxAzs,
      enableNat,
      singleNat,
      dataClassification,
      backup,
    });

    // ── Stack outputs (mirrors module outputs: vpc, publicSubnets, privateSubnets)
    new cdk.CfnOutput(this, 'VpcId', {
      description: 'VPC ID',
      value:       this.orgVpc.vpc.vpcId,
      exportName:  `${environment}-${project}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      description: 'Comma-separated list of public subnet IDs',
      value:       this.orgVpc.publicSubnets.map(s => s.subnetId).join(','),
      exportName:  `${environment}-${project}-public-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      description: 'Comma-separated list of private subnet IDs',
      value:       this.orgVpc.privateSubnets.map(s => s.subnetId).join(','),
      exportName:  `${environment}-${project}-private-subnet-ids`,
    });
  }
}