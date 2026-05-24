import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { OrgVpcConstruct } from './constructs/org-vpc-construct';
import { DataSubnetTier } from './constructs/data-subnet-tier';

// ─────────────────────────────────────────────────────────────────────────────
// Stack props
// ─────────────────────────────────────────────────────────────────────────────
export interface NetworkStackProps extends cdk.StackProps {
  /** Environment name – must match tagging policy (dev | staging | prod). */
  readonly envName: string;
  readonly project: string;
  readonly team: string;
  readonly costCenter: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stack
// ─────────────────────────────────────────────────────────────────────────────
export class NetworkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { envName, project, team, costCenter } = props;

    // ── Required tags applied to every resource in this stack ──────────────
    // ManagedBy is corrected to 'cdk' per org tagging policy.
    const requiredTags: Record<string, string> = {
      Environment: envName,
      Project:     project,
      Team:        team,
      CostCenter:  costCenter,
      ManagedBy:   'cdk',
    };
    Object.entries(requiredTags).forEach(([k, v]) => cdk.Tags.of(this).add(k, v));

    // ── Org VPC Construct (module vpc v2.1.0) ───────────────────────────────
    // Handles: VPC, public subnets, private subnets, IGW, NAT GWs (one per AZ),
    // public route table (→ IGW), private route tables (→ NAT per AZ).
    const vpcConstruct = new OrgVpcConstruct(this, 'OrgVpc', {
      envName,
      project,
      cidrBlock:  '10.0.0.0/16',
      maxAzs:     3,
      enableNat:  true,
      singleNat:  false,       // one NAT GW per AZ for HA
      requiredTags,
    });

    // ── Data-tier subnets ───────────────────────────────────────────────────
    // The org vpc module (v2.1.0) only exposes public + private tiers;
    // the data tier is provisioned as custom resources below.
    new DataSubnetTier(this, 'DataTier', {
      envName,
      project,
      vpc:         vpcConstruct.vpc,
      cidrBlocks:  ['10.0.12.0/23', '10.0.14.0/23', '10.0.16.0/23'],
      azSuffixes:  ['a', 'b', 'c'],
      requiredTags,
    });
  }
}