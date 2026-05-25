import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { VpcConstruct } from '../constructs/vpc-construct';

// ---------------------------------------------------------------------------
// Stack props — all required values that carry unresolved placeholders in the
// plan must be injected here so they can be supplied at synth time via
// cdk.json context or environment variables (see bin/app.ts).
// ---------------------------------------------------------------------------
export interface InfraStackProps extends cdk.StackProps {
  /** One of: dev | staging | prod  (tagging policy requirement) */
  env: string;
  /** Project short name, e.g. "myapp" */
  project: string;
  /** Owning team name, e.g. "platform" */
  team: string;
  /** Cost center matching pattern CC-[0-9]{4}, e.g. "CC-1234" */
  costCenter: string;
}

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    const { env, project, team, costCenter } = props;

    // -------------------------------------------------------------------------
    // Stack-level tags — applied to every resource in this stack automatically.
    // Required tags per org tagging policy v1.0.
    // -------------------------------------------------------------------------
    cdk.Tags.of(this).add('Environment', env);
    cdk.Tags.of(this).add('Project', project);
    cdk.Tags.of(this).add('Team', team);
    cdk.Tags.of(this).add('CostCenter', costCenter);
    cdk.Tags.of(this).add('ManagedBy', 'cdk');  // corrected from plan's "terraform"

    // =========================================================================
    // VPC — org module vpc v2.1.0
    // Name: {env}-{project}-vpc
    // =========================================================================
    const vpcConstruct = new VpcConstruct(this, 'Vpc', {
      cidrBlock: '10.0.0.0/16',
      maxAzs: 3,
      enableNat: true,
      singleNat: false,   // one NAT gateway per AZ (HA) — singleNat=false per plan
      environment: env,
      project,
    });

    // =========================================================================
    // Bastion Security Group
    // Name convention: {env}-{project}-{service}-sg  →  {env}-{project}-bastion-sg
    // No org module exists for security groups; using CDK L2 ec2.SecurityGroup.
    //
    // ⚠️  WARNING: SSH (port 22) is open to 0.0.0.0/0 and ::/0 as explicitly
    //     requested. This is a HIGH SECURITY RISK in production. Restrict the
    //     source CIDR to known IP ranges before deploying to staging or prod.
    // =========================================================================
    const bastionSg = new ec2.SecurityGroup(this, 'BastionSg', {
      securityGroupName: `${env}-${project}-bastion-sg`,  // {env}-{project}-{service}-sg
      description: 'Security group for bastion host - allows inbound SSH from anywhere',
      vpc: vpcConstruct.vpc,
      allowAllOutbound: false, // we define egress explicitly below
    });

    // --- Ingress: SSH from anywhere (IPv4 + IPv6) ----------------------------
    bastionSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH from anywhere (IPv4) — REVIEW before prod',
    );
    bastionSg.addIngressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(22),
      'Allow SSH from anywhere (IPv6) — REVIEW before prod',
    );

    // --- Egress: allow all outbound traffic -----------------------------------
    bastionSg.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTraffic(),
      'Allow all outbound traffic',
    );

    // -------------------------------------------------------------------------
    // CloudFormation Outputs — useful for cross-stack references or debugging
    // -------------------------------------------------------------------------
    new cdk.CfnOutput(this, 'VpcId', {
      value: vpcConstruct.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${env}-${project}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: cdk.Fn.join(',', vpcConstruct.publicSubnets.map(s => s.subnetId)),
      description: 'Comma-separated list of public subnet IDs',
      exportName: `${env}-${project}-public-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: cdk.Fn.join(',', vpcConstruct.privateSubnets.map(s => s.subnetId)),
      description: 'Comma-separated list of private subnet IDs',
      exportName: `${env}-${project}-private-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'BastionSgId', {
      value: bastionSg.securityGroupId,
      description: 'Bastion host security group ID',
      exportName: `${env}-${project}-bastion-sg-id`,
    });
  }
}