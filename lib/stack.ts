import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { OrgVpc } from './constructs/org-vpc';

// ---------------------------------------------------------------------------
// Stack props — extends cdk.StackProps with org-required context values
// ---------------------------------------------------------------------------
export interface InfraStackProps extends cdk.StackProps {
  /** Environment name — must be one of: dev | staging | prod */
  stackEnv: string;
  /** Project short name used in all resource names */
  project: string;
  /** Owning team — required tag */
  team: string;
  /** Cost center — required tag, format CC-XXXX */
  costCenter: string;
}

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    const { stackEnv, project, team, costCenter } = props;

    // -------------------------------------------------------------------------
    // Stack-level tags — applied to ALL resources in this stack automatically.
    // Required tags per org tagging policy v1.0.
    // NOTE: 'ManagedBy' is set to 'cdk' — the plan specified 'terraform' but
    //       this code is CDK-managed; update to 'manual' if deployed by other tooling.
    // -------------------------------------------------------------------------
    cdk.Tags.of(this).add('Environment', stackEnv);
    cdk.Tags.of(this).add('Project',     project);
    cdk.Tags.of(this).add('Team',        team);
    cdk.Tags.of(this).add('CostCenter',  costCenter);
    cdk.Tags.of(this).add('ManagedBy',   'cdk');

    // -------------------------------------------------------------------------
    // 1. VPC  — org module: vpc v2.1.0
    //    Name pattern : {env}-{project}-vpc
    //    Subnets      : 3 public + 3 private (one per AZ)
    //    NAT gateways : single (singleNat: true) — cost-saving mode
    // -------------------------------------------------------------------------
    const orgVpc = new OrgVpc(this, 'Vpc', {
      cidrBlock:   '10.0.0.0/16',
      maxAzs:      3,
      enableNat:   true,
      singleNat:   true,         // ⚠️ Change to false for prod-grade multi-AZ NAT resilience
      environment: stackEnv,
      project:     project,
    });

    // -------------------------------------------------------------------------
    // 2. Bastion Security Group — no org module available; raw CDK L2 construct
    //    Name pattern : {env}-{project}-{service}-sg  →  {env}-{project}-bastion-sg
    //    ⚠️ SSH is open to 0.0.0.0/0 and ::/0 — restrict to known CIDRs in prod
    // -------------------------------------------------------------------------
    const bastionSgName = `${stackEnv}-${project}-bastion-sg`;

    const bastionSg = new ec2.SecurityGroup(this, 'BastionSg', {
      vpc:               orgVpc.vpc,
      securityGroupName: bastionSgName,
      description:       'Security group for bastion host - allows inbound SSH from anywhere',
      allowAllOutbound:  false, // Egress rules managed explicitly below
    });

    // --- Ingress: SSH (TCP/22) from all IPv4 ---
    bastionSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'SSH from anywhere (IPv4) — ⚠️ restrict in production',
    );

    // --- Ingress: SSH (TCP/22) from all IPv6 ---
    bastionSg.addIngressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(22),
      'SSH from anywhere (IPv6) — ⚠️ restrict in production',
    );

    // --- Egress: allow all outbound traffic ---
    bastionSg.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTraffic(),
      'Allow all outbound traffic',
    );

    // Explicit Name tag — SecurityGroup.securityGroupName sets the AWS name,
    // but we also apply a tag to keep it consistent with org naming conventions.
    cdk.Tags.of(bastionSg).add('Name', bastionSgName);

    // -------------------------------------------------------------------------
    // Stack Outputs — useful for cross-stack references and CI pipelines
    // -------------------------------------------------------------------------
    new cdk.CfnOutput(this, 'VpcId', {
      value:       orgVpc.vpc.vpcId,
      description: 'VPC ID',
      exportName:  `${stackEnv}-${project}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value:       cdk.Fn.join(',', orgVpc.vpc.publicSubnets.map(s => s.subnetId)),
      description: 'Public subnet IDs (comma-separated)',
      exportName:  `${stackEnv}-${project}-public-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value:       cdk.Fn.join(',', orgVpc.vpc.privateSubnets.map(s => s.subnetId)),
      description: 'Private subnet IDs (comma-separated)',
      exportName:  `${stackEnv}-${project}-private-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'BastionSecurityGroupId', {
      value:       bastionSg.securityGroupId,
      description: 'Bastion host security group ID',
      exportName:  `${stackEnv}-${project}-bastion-sg-id`,
    });
  }
}