import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VpcConstruct } from './constructs/vpc-construct';

export interface NetworkingStackProps extends cdk.StackProps {
  /** Environment name. Allowed: dev | staging | prod */
  readonly environment: 'dev' | 'staging' | 'prod';
  /** Project short name, e.g. "myapp" */
  readonly project: string;
  /** Owning team — required tag */
  readonly team: string;
  /** Cost center in format CC-XXXX — required tag */
  readonly costCenter: string;
}

export class NetworkingStack extends cdk.Stack {
  /** Expose the VPC construct so other stacks can consume its outputs */
  public readonly vpcModule: VpcConstruct;

  constructor(scope: Construct, id: string, props: NetworkingStackProps) {
    super(scope, id, props);

    // ── Required org tags (tagging-policy v1.0) ───────────────────────────
    // Applied at stack level so every resource inherits them automatically.
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project',     props.project);
    cdk.Tags.of(this).add('Team',        props.team);
    cdk.Tags.of(this).add('CostCenter',  props.costCenter);
    cdk.Tags.of(this).add('ManagedBy',   'cdk');

    // ── VPC Module v2.1.0 ─────────────────────────────────────────────────
    // Provisions:
    //   • VPC                    — {env}-{project}-vpc
    //   • Internet Gateway       — auto-attached to the VPC by CDK
    //   • Public subnets  ×3     — {env}-{project}-public-{az}
    //   • Private subnets ×3     — {env}-{project}-private-{az}
    //   • NAT Gateways    ×3     — one per AZ (singleNat=false for full HA)
    //   • Route tables           — auto-created per subnet tier by CDK
    //   • VPC Flow Logs          — to CloudWatch Logs (org security requirement)
    //
    // Manual extension on top of module:
    //   • Data / isolated subnets ×3 — {env}-{project}-data-{az}
    //     (third subnet tier not emitted as a named output in module v2.1.0)
    this.vpcModule = new VpcConstruct(this, 'VpcModule', {
      cidrBlock:   '10.0.0.0/16',
      maxAzs:      3,
      enableNat:   true,
      singleNat:   false,           // one NAT GW per AZ for full HA
      environment: props.environment,
      project:     props.project,
    });

    // ── Stack outputs ─────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'VpcId', {
      description: 'VPC ID',
      value:       this.vpcModule.vpc.vpcId,
      exportName:  `${props.environment}-${props.project}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      description: 'Comma-separated public subnet IDs',
      value:       cdk.Fn.join(',', this.vpcModule.publicSubnets.map(s => s.subnetId)),
      exportName:  `${props.environment}-${props.project}-public-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      description: 'Comma-separated private subnet IDs',
      value:       cdk.Fn.join(',', this.vpcModule.privateSubnets.map(s => s.subnetId)),
      exportName:  `${props.environment}-${props.project}-private-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'DataSubnetIds', {
      description: 'Comma-separated data (isolated) subnet IDs',
      value:       cdk.Fn.join(',', this.vpcModule.dataSubnets.map(s => s.subnetId)),
      exportName:  `${props.environment}-${props.project}-data-subnet-ids`,
    });
  }
}