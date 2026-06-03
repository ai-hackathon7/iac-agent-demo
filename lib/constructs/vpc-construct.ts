import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

// ─────────────────────────────────────────────
// Org VPC Module v2.1.0  (format: CDK construct)
// Provisions: VPC, public/private subnets, IGW,
//             NAT Gateways (1 per AZ), route tables
// ─────────────────────────────────────────────

export interface VpcConstructProps {
  /** VPC CIDR block. Default: 10.0.0.0/16 */
  cidrBlock: string;
  /** Maximum number of availability zones. Default: 3 */
  maxAzs: number;
  /** Enable NAT Gateways. Default: true */
  enableNat: boolean;
  /** Use a single shared NAT Gateway (cost-saving). Default: false */
  singleNat: boolean;
  /** Environment name: dev | staging | prod */
  environment: string;
  /** Project short name */
  project: string;
}

export class VpcConstruct extends Construct {
  /** The provisioned VPC */
  public readonly vpc: ec2.Vpc;
  /** Public subnets (one per AZ) */
  public readonly publicSubnets: ec2.ISubnet[];
  /** Private subnets (one per AZ) */
  public readonly privateSubnets: ec2.ISubnet[];

  constructor(scope: Construct, id: string, props: VpcConstructProps) {
    super(scope, id);

    const {
      cidrBlock,
      maxAzs,
      enableNat,
      singleNat,
      environment,
      project,
    } = props;

    // ── Determine NAT gateway mode ──────────────────────────────────────
    // singleNat=false  → one NAT per AZ  (HA; recommended for prod)
    // singleNat=true   → one NAT total   (cost saving; ok for non-prod)
    const natGateways = !enableNat
      ? 0
      : singleNat
      ? 1
      : maxAzs;

    // ── VPC ─────────────────────────────────────────────────────────────
    // Naming convention: {env}-{project}-vpc
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `${environment}-${project}-vpc`,
      ipAddresses: ec2.IpAddresses.cidr(cidrBlock),
      maxAzs,
      natGateways,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      // Subnet naming: {env}-{project}-{tier}-{az}  (CDK appends the AZ suffix automatically)
      subnetConfiguration: [
        {
          cidrMask: 20, // 4,096 IPs per subnet — org standard /20 per tier per AZ
          name: `${environment}-${project}-public`,
          subnetType: ec2.SubnetType.PUBLIC,
          mapPublicIpOnLaunch: false, // Explicit: no auto-public IPs on launch
        },
        {
          cidrMask: 20,
          name: `${environment}-${project}-private`,
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // ── VPC Flow Logs ────────────────────────────────────────────────────
    // REQUIRED: always enable flow logs per org security policy
    this.vpc.addFlowLog('VpcFlowLog', {
      trafficType: ec2.FlowLogTrafficType.ALL,
      destination: ec2.FlowLogDestination.toCloudWatchLogs(),
    });

    // ── Expose subnet lists ───────────────────────────────────────────────
    this.publicSubnets  = this.vpc.publicSubnets;
    this.privateSubnets = this.vpc.privateSubnets;
  }
}