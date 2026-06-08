import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

// ─────────────────────────────────────────────────────────────────────────────
// Org VPC Module v2.1.0 — CDK implementation
//
// Natively emits: vpc, publicSubnets, privateSubnets
// Extended with:  dataSubnets (isolated tier — not part of module v2.1.0 output)
//                 VPC Flow Logs (org security requirement)
// ─────────────────────────────────────────────────────────────────────────────

export interface VpcModuleProps {
  /** VPC CIDR block. Default: 10.0.0.0/16 */
  readonly cidrBlock?: string;
  /** Maximum number of Availability Zones. Default: 3 */
  readonly maxAzs?: number;
  /** Enable NAT Gateways. Default: true */
  readonly enableNat?: boolean;
  /** Use a single shared NAT Gateway to reduce cost. Default: false (one per AZ) */
  readonly singleNat?: boolean;
  /** Environment name — required. Allowed: dev | staging | prod */
  readonly environment: 'dev' | 'staging' | 'prod';
  /** Project short name — required */
  readonly project: string;
}

export interface VpcModuleOutputs {
  /** The ec2.Vpc instance */
  readonly vpc: ec2.Vpc;
  /** Public subnets (one per AZ) */
  readonly publicSubnets: ec2.ISubnet[];
  /** Private subnets with egress via NAT (one per AZ) */
  readonly privateSubnets: ec2.ISubnet[];
  /**
   * Data / isolated subnets (one per AZ).
   * Manual extension — not a native module v2.1.0 output.
   */
  readonly dataSubnets: ec2.ISubnet[];
}

export class VpcConstruct extends Construct implements VpcModuleOutputs {
  public readonly vpc: ec2.Vpc;
  public readonly publicSubnets: ec2.ISubnet[];
  public readonly privateSubnets: ec2.ISubnet[];
  public readonly dataSubnets: ec2.ISubnet[];

  constructor(scope: Construct, id: string, props: VpcModuleProps) {
    super(scope, id);

    const cidrBlock  = props.cidrBlock  ?? '10.0.0.0/16';
    const maxAzs     = props.maxAzs     ?? 3;
    const enableNat  = props.enableNat  ?? true;
    const singleNat  = props.singleNat  ?? false;

    const vpcName = `${props.environment}-${props.project}-vpc`;

    // ── Subnet configuration ──────────────────────────────────────────────
    //
    //  /16 split across 3 tiers × 3 AZs using /20 blocks (4096 IPs each):
    //
    //  Tier     CDK subnetType              cidrMask   AZ-a          AZ-b          AZ-c
    //  public   PUBLIC                        /20      10.0.0.0/20   10.0.16.0/20  10.0.32.0/20
    //  private  PRIVATE_WITH_EGRESS           /20      10.0.48.0/20  10.0.64.0/20  10.0.80.0/20
    //  data     ISOLATED                      /20      10.0.96.0/20  10.0.112.0/20 10.0.128.0/20
    //
    //  Remaining space (10.0.144.0/20 – 10.0.255.0/20) is unallocated / reserved.
    //
    const natGatewayCount = !enableNat ? 0 : singleNat ? 1 : maxAzs;

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName,
      ipAddresses: ec2.IpAddresses.cidr(cidrBlock),
      maxAzs,
      natGateways: natGatewayCount,
      enableDnsHostnames: true,
      enableDnsSupport:   true,
      subnetConfiguration: [
        {
          // Naming convention: {env}-{project}-public-{az}
          name:       `${props.environment}-${props.project}-public`,
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask:   20,
        },
        {
          // Naming convention: {env}-{project}-private-{az}
          name:       `${props.environment}-${props.project}-private`,
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask:   20,
        },
        {
          // Naming convention: {env}-{project}-data-{az}
          // Manual extension — not a native module v2.1.0 output
          name:       `${props.environment}-${props.project}-data`,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask:   20,
        },
      ],
    });

    // ── VPC Flow Logs ─────────────────────────────────────────────────────
    // Required by org security policy. Logs to CloudWatch Logs with a
    // dedicated IAM role scoped to this log group only.

    const flowLogGroup = new logs.LogGroup(this, 'FlowLogGroup', {
      logGroupName:  `/aws/vpc/flowlogs/${vpcName}`,
      retention:     logs.RetentionDays.ONE_YEAR,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const flowLogRole = new iam.Role(this, 'FlowLogRole', {
      roleName:  `${props.environment}-${props.project}-vpc-flowlog-role`,
      assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
    });

    // Least-privilege: scoped to the specific log group and its log streams
    flowLogRole.addToPolicy(new iam.PolicyStatement({
      sid: 'AllowFlowLogDelivery',
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'logs:DescribeLogGroups',
        'logs:DescribeLogStreams',
      ],
      resources: [
        flowLogGroup.logGroupArn,
        `${flowLogGroup.logGroupArn}:log-stream:*`,
      ],
    }));

    this.vpc.addFlowLog('FlowLog', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup, flowLogRole),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });

    // ── Resolve subnet outputs (module interface) ─────────────────────────
    this.publicSubnets  = this.vpc.selectSubnets({
      subnetGroupName: `${props.environment}-${props.project}-public`,
    }).subnets;

    this.privateSubnets = this.vpc.selectSubnets({
      subnetGroupName: `${props.environment}-${props.project}-private`,
    }).subnets;

    // data tier — manual extension, not a native v2.1.0 output
    this.dataSubnets = this.vpc.selectSubnets({
      subnetGroupName: `${props.environment}-${props.project}-data`,
    }).subnets;
  }
}