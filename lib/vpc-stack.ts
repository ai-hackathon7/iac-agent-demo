import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

// ─── Stack props ─────────────────────────────────────────────────────────────

export interface VpcStackProps extends cdk.StackProps {
  // Required tags (org tagging policy v1.0)
  environment:  'dev' | 'staging' | 'prod';
  project:      string;
  team:         string;
  costCenter:   string; // pattern: CC-XXXX

  // Optional tags
  dataClassification?: 'public' | 'internal' | 'confidential';
  backup?:             'daily'  | 'weekly'   | 'none';

  // VPC config — mirrors org vpc module v2.1.0 inputs
  cidrBlock?: string;  // default: '10.0.0.0/16'
  maxAzs?:    number;  // default: 3
  enableNat?: boolean; // default: true
  singleNat?: boolean; // default: false  ← set true in non-prod to save cost
}

// ─── Stack ───────────────────────────────────────────────────────────────────

export class VpcStack extends cdk.Stack {
  /** The provisioned VPC — expose for cross-stack references */
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    // ── Resolve config with module defaults ────────────────────────────────
    const cidrBlock = props.cidrBlock ?? '10.0.0.0/16';
    const maxAzs    = props.maxAzs    ?? 3;
    const enableNat = props.enableNat ?? true;
    const singleNat = props.singleNat ?? false;

    // ── Org naming convention: {env}-{project}-vpc ─────────────────────────
    const namePrefix = `${props.environment}-${props.project}`;
    const vpcName    = `${namePrefix}-vpc`;

    // ── Apply required tags to every resource in the stack ─────────────────
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project',     props.project);
    cdk.Tags.of(this).add('Team',        props.team);
    cdk.Tags.of(this).add('CostCenter',  props.costCenter);
    cdk.Tags.of(this).add('ManagedBy',   'cdk');

    // ── Optional tags (only applied when provided) ─────────────────────────
    if (props.dataClassification) {
      cdk.Tags.of(this).add('DataClassification', props.dataClassification);
    }
    if (props.backup) {
      cdk.Tags.of(this).add('Backup', props.backup);
    }

    // ── NAT gateway strategy ───────────────────────────────────────────────
    // singleNat=false → one NAT GW per AZ (HA, org default for prod)
    // singleNat=true  → one NAT GW total  (cost-saving for dev/staging)
    const natGateways = !enableNat
      ? 0
      : singleNat
        ? 1
        : maxAzs; // one per AZ

    // ── VPC (L2) ───────────────────────────────────────────────────────────
    // Subnet layout mirrors the org module:
    //   Public  subnets — Internet Gateway (ALB / NAT egress)
    //   Private subnets — NAT Gateway egress (workloads)
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName,
      ipAddresses:      ec2.IpAddresses.cidr(cidrBlock),
      maxAzs,
      natGateways,
      enableDnsHostnames: true,
      enableDnsSupport:   true,
      subnetConfiguration: [
        {
          // Org naming: {env}-{project}-public-{az}
          name:       `${namePrefix}-public`,
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask:   20, // /20 per AZ → ~4 k hosts; matches module cidrsubnet(...,4,...)
          mapPublicIpOnLaunch: false, // explicit: only ALB/NAT needs public IPs
        },
        {
          // Org naming: {env}-{project}-private-{az}
          name:       `${namePrefix}-private`,
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask:   20,
        },
      ],
    });

    // ── VPC Flow Logs (org security requirement) ───────────────────────────
    // Sends all ACCEPT/REJECT traffic records to CloudWatch Logs
    const flowLogGroup = new logs.LogGroup(this, 'VpcFlowLogGroup', {
      logGroupName:  `/aws/vpc/flowlogs/${vpcName}`,
      retention:     logs.RetentionDays.ONE_YEAR,  // inferred; adjust per data-retention policy
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const flowLogRole = new iam.Role(this, 'VpcFlowLogRole', {
      roleName:    `${vpcName}-flowlog-role`,
      assumedBy:   new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
      description: `Allows VPC Flow Logs to write to CloudWatch for ${vpcName}`,
    });

    // Least-privilege: only the specific log group, no wildcard actions/resources
    flowLogRole.addToPolicy(new iam.PolicyStatement({
      sid:     'AllowFlowLogWrite',
      effect:  iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'logs:DescribeLogStreams',
      ],
      resources: [
        flowLogGroup.logGroupArn,
        `${flowLogGroup.logGroupArn}:log-stream:*`, // streams within the group only
      ],
    }));

    flowLogRole.addToPolicy(new iam.PolicyStatement({
      sid:     'AllowDescribeLogGroups',
      effect:  iam.Effect.ALLOW,
      actions: [
        'logs:DescribeLogGroups',
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:*`,
      ],
    }));

    this.vpc.addFlowLog('FlowLog', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup, flowLogRole),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });

    // ── Stack outputs ──────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'VpcId', {
      description: 'VPC ID',
      value:       this.vpc.vpcId,
      exportName:  `${namePrefix}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'VpcCidr', {
      description: 'VPC CIDR block',
      value:       this.vpc.vpcCidrBlock,
      exportName:  `${namePrefix}-vpc-cidr`,
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      description: 'Comma-separated public subnet IDs',
      value:       cdk.Fn.join(',', this.vpc.publicSubnets.map(s => s.subnetId)),
      exportName:  `${namePrefix}-public-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      description: 'Comma-separated private subnet IDs',
      value:       cdk.Fn.join(',', this.vpc.privateSubnets.map(s => s.subnetId)),
      exportName:  `${namePrefix}-private-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'NatGatewayCount', {
      description: 'Number of NAT Gateways provisioned',
      value:       String(natGateways),
    });
  }
}