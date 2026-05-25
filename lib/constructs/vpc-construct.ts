import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface VpcConstructProps {
  cidrBlock?: string;   // default: '10.0.0.0/16'
  maxAzs?: number;      // default: 3
  enableNat?: boolean;  // default: true
  singleNat?: boolean;  // default: false
  environment: string;  // REQUIRED
  project: string;      // REQUIRED
}

/**
 * Org VPC Module v2.1.0
 * Standard VPC with public/private subnets and NAT gateways.
 * Mirrors the org vpc module inputs/outputs.
 */
export class VpcConstruct extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly publicSubnets: ec2.ISubnet[];
  public readonly privateSubnets: ec2.ISubnet[];

  constructor(scope: Construct, id: string, props: VpcConstructProps) {
    super(scope, id);

    const {
      cidrBlock = '10.0.0.0/16',
      maxAzs = 3,
      enableNat = true,
      singleNat = false,
      environment,
      project,
    } = props;

    // Determine NAT gateway configuration
    let natGateways: number;
    if (!enableNat) {
      natGateways = 0;
    } else if (singleNat) {
      natGateways = 1;
    } else {
      natGateways = maxAzs; // one NAT per AZ — matches module default
    }

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `${environment}-${project}-vpc`,         // naming convention: {env}-{project}-vpc
      ipAddresses: ec2.IpAddresses.cidr(cidrBlock),
      maxAzs,
      natGateways,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          cidrMask: 20,   // /20 per subnet — provides 4094 hosts per subnet within /16
          name: `${environment}-${project}-public`,     // {env}-{project}-{tier}-{az} via CDK az suffix
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 20,
          name: `${environment}-${project}-private`,
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    this.publicSubnets = this.vpc.publicSubnets;
    this.privateSubnets = this.vpc.privateSubnets;
  }
}