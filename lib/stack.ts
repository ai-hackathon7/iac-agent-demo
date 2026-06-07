import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { OrgVpc } from './constructs/org-vpc';

// ---------------------------------------------------------------------------
// Stack props
// ---------------------------------------------------------------------------
export interface BastionInfraStackProps extends cdk.StackProps {
  /** Environment name — must be one of: dev | staging | prod */
  appEnv: string;
  /** Short project identifier */
  project: string;
  /** Owning team name */
  team: string;
  /** Cost-centre code, pattern CC-[0-9]{4} */
  costCenter: string;
}

// ---------------------------------------------------------------------------
// Stack
// ---------------------------------------------------------------------------
export class BastionInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BastionInfraStackProps) {
    super(scope, id, props);

    const { appEnv, project, team, costCenter } = props;

    // -----------------------------------------------------------------------
    // Stack-level tags  — propagate to every resource in this stack
    // Required tags per org tagging policy v1.0
    // -----------------------------------------------------------------------
    cdk.Tags.of(this).add('Environment', appEnv);
    cdk.Tags.of(this).add('Project',     project);
    cdk.Tags.of(this).add('Team',        team);
    cdk.Tags.of(this).add('CostCenter',  costCenter);
    cdk.Tags.of(this).add('ManagedBy',   'cdk');   // corrected from 'terraform'

    // -----------------------------------------------------------------------
    // VPC — org module: vpc v2.1.0
    // Name pattern: {env}-{project}-vpc
    // -----------------------------------------------------------------------
    const orgVpc = new OrgVpc(this, 'OrgVpc', {
      cidrBlock:   '10.0.0.0/16',
      maxAzs:      3,
      enableNat:   true,
      singleNat:   true,   // ⚠️ cost-saving default — set false for prod HA
      environment: appEnv,
      project:     project,
    });

    const vpc = orgVpc.vpc;

    // -----------------------------------------------------------------------
    // VPC Flow Logs (mandatory security control)
    // -----------------------------------------------------------------------
    const flowLogGroup = new logs.LogGroup(this, 'VpcFlowLogGroup', {
      logGroupName:  `/vpc/flowlogs/${appEnv}-${project}-vpc`,
      retention:     logs.RetentionDays.THREE_MONTHS,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    vpc.addFlowLog('VpcFlowLog', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });

    // -----------------------------------------------------------------------
    // Security Group — bastion host
    // Name pattern: {env}-{project}-{service}-sg  →  {env}-{project}-bastion-sg
    //
    // ⚠️  REPLACE '203.0.113.0/24' with your real trusted CIDR(s) before deploy
    // -----------------------------------------------------------------------
    const bastionSgName = `${appEnv}-${project}-bastion-sg`;
    const bastionSg = new ec2.SecurityGroup(this, 'BastionSg', {
      vpc,
      securityGroupName: bastionSgName,
      description:       'Security group for bastion host SSH access',
      allowAllOutbound:  false,   // explicit egress rules below
    });

    // Ingress: SSH from trusted CIDRs only — replace placeholder before deploy
    bastionSg.addIngressRule(
      ec2.Peer.ipv4('REPLACE_WITH_TRUSTED_CIDR/32'),  // ⚠️ replace with real CIDR
      ec2.Port.tcp(22),
      'SSH from trusted CIDRs',
    );

    // Egress: HTTPS to AWS endpoints (SSM Session Manager requires 443)
    bastionSg.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS egress for SSM and AWS API calls',
    );

    // -----------------------------------------------------------------------
    // IAM Role — bastion host
    // Name pattern: {env}-{project}-{service}-role  →  {env}-{project}-bastion-role
    //
    // NOTE: aws_instance is NOT in the approved resource list.
    //       Role is provisioned with AmazonSSMManagedInstanceCore to support
    //       AWS Systems Manager Session Manager as the SSH alternative.
    //       Confirm SSM-only access is acceptable with your platform team.
    // -----------------------------------------------------------------------
    const bastionRoleName = `${appEnv}-${project}-bastion-role`;
    const bastionRole = new iam.Role(this, 'BastionRole', {
      roleName:    bastionRoleName,
      description: 'IAM role for bastion host — SSM Session Manager access',
      assumedBy:   new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        // Enables SSM Session Manager, Run Command, and Patch Manager
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    // Scoped inline policy — write SSM session logs to a dedicated S3 path
    // (no wildcard actions or resources)
    bastionRole.addToPolicy(new iam.PolicyStatement({
      sid:     'SSMSessionLogging',
      effect:  iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'logs:DescribeLogGroups',
        'logs:DescribeLogStreams',
      ],
      resources: [
        // Scope to this account/region log group — resolved at deploy time
        `arn:aws:logs:${this.region}:${this.account}:log-group:/ssm/sessions/${appEnv}-${project}:*`,
      ],
    }));

    // -----------------------------------------------------------------------
    // Instance Profile (required to attach IAM role to EC2)
    // -----------------------------------------------------------------------
    const bastionInstanceProfile = new iam.CfnInstanceProfile(
      this,
      'BastionInstanceProfile',
      {
        instanceProfileName: `${appEnv}-${project}-bastion-profile`,
        roles: [bastionRole.roleName],
      },
    );

    // -----------------------------------------------------------------------
    // Outputs — useful for downstream stacks / ops teams
    // -----------------------------------------------------------------------
    new cdk.CfnOutput(this, 'VpcId', {
      value:       vpc.vpcId,
      description: 'VPC ID',
      exportName:  `${appEnv}-${project}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value:       vpc.publicSubnets.map(s => s.subnetId).join(','),
      description: 'Public subnet IDs',
      exportName:  `${appEnv}-${project}-public-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value:       vpc.privateSubnets.map(s => s.subnetId).join(','),
      description: 'Private subnet IDs',
      exportName:  `${appEnv}-${project}-private-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'BastionSecurityGroupId', {
      value:       bastionSg.securityGroupId,
      description: 'Bastion security group ID',
      exportName:  `${appEnv}-${project}-bastion-sg-id`,
    });

    new cdk.CfnOutput(this, 'BastionRoleArn', {
      value:       bastionRole.roleArn,
      description: 'Bastion IAM role ARN',
      exportName:  `${appEnv}-${project}-bastion-role-arn`,
    });

    new cdk.CfnOutput(this, 'BastionInstanceProfileArn', {
      value:       bastionInstanceProfile.attrArn,
      description: 'Bastion instance profile ARN',
      exportName:  `${appEnv}-${project}-bastion-profile-arn`,
    });
  }
}