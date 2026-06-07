/**
 * OrgVpc — CDK implementation of the org vpc module v2.1.0
 *
 * Module metadata:
 *   name:        vpc
 *   version:     2.1.0
 *   description: Standard VPC with public/private subnets and NAT gateways
 *   category:    networking
 *
 * Inputs match the module schema exactly; subnets are named following the
 * org convention: {env}-{project}-{tier}-{az}
 *
 * Outputs:
 *   vpc            — ec2.Vpc instance
 *   publicSubnets  — list of public ISubnet
 *   privateSubnets — list of private ISubnet
 */
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface OrgVpcProps {
  /** VPC CIDR block — default: 10.0.0.0/16 */
  cidrBlock?: string;
  /** Maximum number of availability zones — default: 3 */
  maxAzs?: number;
  /** Enable NAT gateways — default: true */
  enableNat?: boolean;
  /**
   * Use a single shared NAT gateway (cost saving).
   * ⚠️ Set to false in staging/prod for high-availability egress.
   * default: false
   */
  singleNat?: boolean;
  /** Environment name (required) */
  environment: string;
  /** Project name (required) */
  project: string;
}

export class OrgVpc extends Construct {
  public readonly vpc:            ec2.Vpc;
  public readonly publicSubnets:  ec2.ISubnet[];
  public readonly privateSubnets: ec2.ISubnet[];

  constructor(scope: Construct, id: string, props: OrgVpcProps) {
    super(scope, id);

    const cidrBlock  = props.cidrBlock  ?? '10.0.0.0/16';
    const maxAzs     = props.maxAzs     ?? 3;
    const enableNat  = props.enableNat  ?? true;
    const singleNat  = props.singleNat  ?? false;
    const env        = props.environment;
    const project    = props.project;

    // Subnet configuration
    // Public subnet: {env}-{project}-public  → named per org convention
    // Private subnet: {env}-{project}-private → /24 slices from the /16
    const subnetConfig: ec2.SubnetConfiguration[] = [
      {
        name:       `${env}-${project}-public`,
        subnetType: ec2.SubnetType.PUBLIC,
        cidrMask:   24,
        mapPublicIpOnLaunch: true,   // bastion / ALB tier
      },
      {
        name:       `${env}-${project}-private`,
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        cidrMask:   24,
      },
    ];

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName:     `${env}-${project}-vpc`,           // org convention
      ipAddresses: ec2.IpAddresses.cidr(cidrBlock),
      maxAzs,
      enableDnsHostnames: true,
      enableDnsSupport:   true,
      natGateways: enableNat
        ? (singleNat ? 1 : maxAzs)   // 1 = cost-save; maxAzs = HA
        : 0,
      subnetConfiguration: subnetConfig,
    });

    // Tag each subnet with the org naming convention: {env}-{project}-{tier}-{az}
    this.vpc.publicSubnets.forEach(subnet => {
      const az = subnet.availabilityZone.slice(-1);   // e.g. 'a', 'b', 'c'
      cdk.Tags.of(subnet).add('Name', `${env}-${project}-public-${az}`);
    });

    this.vpc.privateSubnets.forEach(subnet => {
      const az = subnet.availabilityZone.slice(-1);
      cdk.Tags.of(subnet).add('Name', `${env}-${project}-private-${az}`);
    });

    this.publicSubnets  = this.vpc.publicSubnets;
    this.privateSubnets = this.vpc.privateSubnets;
  }
}