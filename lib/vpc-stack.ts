import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

// ─────────────────────────────────────────────
// Props — all placeholder values must be
// supplied by the caller (bin/app.ts or CI/CD).
// ─────────────────────────────────────────────
export interface VpcStackProps extends cdk.StackProps {
  /** Environment name — must be one of: dev | staging | prod */
  readonly environment: 'dev' | 'staging' | 'prod';
  /** Short project identifier, e.g. "payments" */
  readonly project: string;
  /** Owning team name, e.g. "platform" */
  readonly team: string;
  /** Cost-center code — must match pattern CC-XXXX (4 digits) */
  readonly costCenter: string;
  /**
   * Use a single shared NAT Gateway instead of one per AZ.
   * Recommended for non-prod to reduce cost.
   * @default false  (one NAT per AZ — HA configuration)
   */
  readonly singleNat?: boolean;
}

// ─────────────────────────────────────────────
// Org VPC Module  v2.1.0
// Naming: {env}-{project}-vpc  (org standard)
// Subnets: 3 public + 3 private across 3 AZs
// ─────────────────────────────────────────────
export class VpcStack extends cdk.Stack {
  /** The created VPC — expose for cross-stack references */
  public readonly vpc: ec2.Vpc;
  /** All public subnets (one per AZ) */
  public readonly publicSubnets: ec2.ISubnet[];
  /** All private subnets (one per AZ) */
  public readonly privateSubnets: ec2.ISubnet[];

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    // ── Validate CostCenter pattern: CC-XXXX ──────────────────────────────
    if (!/^CC-\d{4}$/.test(props.costCenter)) {
      throw new Error(
        `costCenter "${props.costCenter}" does not match required pattern CC-XXXX (e.g. CC-1234).`
      );
    }

    // ── Stack-level tags (propagate to every resource in this stack) ───────
    // Required tags per org tagging policy v1.0
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project',     props.project);
    cdk.Tags.of(this).add('Team',        props.team);
    cdk.Tags.of(this).add('CostCenter',  props.costCenter);
    cdk.Tags.of(this).add('ManagedBy',   'cdk');

    // ── Org naming convention: {env}-{project}-vpc ─────────────────────────
    const namePrefix = `${props.environment}-${props.project}`;
    const vpcName    = `${namePrefix}-vpc`;

    // ── NAT Gateway strategy ───────────────────────────────────────────────
    const natGateways = props.singleNat === true ? 1 : 3; // default: one per AZ

    // ── VPC (org module: vpc v2.1.0) ───────────────────────────────────────
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName,
      ipAddresses:  ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs:       3,
      natGateways,
      enableDnsHostnames: true,
      enableDnsSupport:   true,

      // Subnet layout mirrors the org module:
      //   public  — /20 each  → ALB / NAT Gateway attachment points only
      //   private — /20 each  → all workloads (ECS, EC2, Lambda, RDS, …)
      subnetConfiguration: [
        {
          cidrMask:   20,
          name:       'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          mapPublicIpOnLaunch: false, // org security policy: no auto-public IPs
        },
        {
          cidrMask:   20,
          name:       'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // ── VPC Flow Logs (mandatory — org security baseline) ─────────────────
    // Dedicated CloudWatch log group with 90-day retention
    const flowLogGroup = new logs.LogGroup(this, 'VpcFlowLogGroup', {
      logGroupName:  `/vpc/flow-logs/${vpcName}`,
      retention:     logs.RetentionDays.THREE_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // log group only; adjust for prod
    });

    // Least-privilege IAM role for VPC Flow Logs delivery
    const flowLogRole = new iam.Role(this, 'VpcFlowLogRole', {
      roleName:    `${namePrefix}-vpc-flow-log-role`,
      assumedBy:   new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
      description: `Allows VPC Flow Logs to deliver to CloudWatch for ${vpcName}`,
    });

    flowLogRole.addToPolicy(new iam.PolicyStatement({
      sid:     'AllowFlowLogDelivery',
      effect:  iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'logs:DescribeLogGroups',
        'logs:DescribeLogStreams',
      ],
      resources: [
        flowLogGroup.logGroupArn,
        // Also allow stream-level ARN under the group
        `${flowLogGroup.logGroupArn}:log-stream:*`,
      ],
    }));

    this.vpc.addFlowLog('FlowLog', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup, flowLogRole),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });

    // ── Expose subnet lists (convenience for dependent stacks) ────────────
    this.publicSubnets  = this.vpc.publicSubnets;
    this.privateSubnets = this.vpc.privateSubnets;

    // ── Stack Outputs ──────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'VpcId', {
      exportName: `${namePrefix}-vpc-id`,
      value:      this.vpc.vpcId,
      description: `VPC ID for ${vpcName}`,
    });

    new cdk.CfnOutput(this, 'VpcCidr', {
      exportName: `${namePrefix}-vpc-cidr`,
      value:      this.vpc.vpcCidrBlock,
      description: `CIDR block for ${vpcName}`,
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      exportName:  `${namePrefix}-public-subnet-ids`,
      value:       cdk.Fn.join(',', this.vpc.publicSubnets.map(s => s.subnetId)),
      description: 'Comma-separated list of public subnet IDs',
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      exportName:  `${namePrefix}-private-subnet-ids`,
      value:       cdk.Fn.join(',', this.vpc.privateSubnets.map(s => s.subnetId)),
      description: 'Comma-separated list of private subnet IDs',
    });

    new cdk.CfnOutput(this, 'FlowLogGroupName', {
      exportName:  `${namePrefix}-flow-log-group`,
      value:       flowLogGroup.logGroupName,
      description: 'CloudWatch Log Group receiving VPC Flow Logs',
    });
  }
}