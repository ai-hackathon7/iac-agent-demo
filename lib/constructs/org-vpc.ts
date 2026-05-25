import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

// ---------------------------------------------------------------------------
// OrgVpc — CDK wrapper for the org vpc module v2.1.0
//
// Implements the module contract defined in the vpc module template:
//   Outputs: vpc (ec2.Vpc), publicSubnets (ISubnet[]), privateSubnets (ISubnet[])
//
// Subnet naming follows org convention: {env}-{project}-{tier}-{az}
// ---------------------------------------------------------------------------

export interface OrgVpcProps {
  /** VPC CIDR block. Default: 10.0.0.0/16 */
  cidrBlock?: string;
  /** Maximum number of AZs to span. Default: 3 */
  maxAzs?: number;
  /** Enable NAT gateways for private subnets. Default: true */
  enableNat?: boolean;
  /** Use a single shared NAT gateway (cost-saving). Default: false */
  singleNat?: boolean;
  /** Environment name — required for naming and tags */
  environment: string;
  /** Project short name — required for naming and tags */
  project: string;
}

export class OrgVpc extends Construct {
  /** The underlying CDK VPC instance — use for cross-construct references */
  public readonly vpc: ec2.Vpc;
  /** Resolved public subnets */
  public readonly publicSubnets: ec2.ISubnet[];
  /** Resolved private subnets */
  public readonly privateSubnets: ec2.ISubnet[];

  constructor(scope: Construct, id: string, props: OrgVpcProps) {
    super(scope, id);

    const {
      cidrBlock   = '10.0.0.0/16',
      maxAzs      = 3,
      enableNat   = true,
      singleNat   = false,
      environment,
      project,
    } = props;

    // Resolve NAT gateway count per org module semantics:
    //   enableNat: false → 0 gateways
    //   enableNat: true, singleNat: true  → 1 gateway  (cost-saving)
    //   enableNat: true, singleNat: false → one per AZ (HA)
    const natGateways = !enableNat ? 0 : singleNat ? 1 : maxAzs;

    this.vpc = new ec2.Vpc(this, 'Resource', {
      vpcName:     `${environment}-${project}-vpc`,
      ipAddresses: ec2.IpAddresses.cidr(cidrBlock),
      maxAzs,
      natGateways,
      // Subnet layout mirrors the org module template:
      //   public  — cidrsubnet(/16, 4, 0..n)   → /20 blocks (4096 IPs each)
      //   private — cidrsubnet(/16, 4, n..2n)  → /20 blocks (4096 IPs each)
      subnetConfiguration: [
        {
          // Naming: {env}-{project}-public-{az} — CDK appends the AZ suffix automatically
          name:       `${environment}-${project}-public`,
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask:   20,
          mapPublicIpOnLaunch: true,
        },
        {
          // Naming: {env}-{project}-private-{az}
          name:       `${environment}-${project}-private`,
          subnetType: enableNat
            ? ec2.SubnetType.PRIVATE_WITH_EGRESS
            : ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask:   20,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport:   true,
    });

    // Tag the VPC itself with its canonical name
    cdk.Tags.of(this.vpc).add('Name', `${environment}-${project}-vpc`);

    // Expose subnet lists via the module output contract
    this.publicSubnets  = this.vpc.publicSubnets;
    this.privateSubnets = this.vpc.privateSubnets;
  }
}