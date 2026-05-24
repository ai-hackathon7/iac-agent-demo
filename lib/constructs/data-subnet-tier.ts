import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
export interface DataSubnetTierProps {
  readonly envName:      string;
  readonly project:      string;
  readonly vpc:          ec2.Vpc;
  /** One CIDR per AZ, in AZ order. */
  readonly cidrBlocks:   string[];
  /** AZ suffix characters ('a', 'b', 'c'). Length must match cidrBlocks. */
  readonly azSuffixes:   string[];
  readonly requiredTags: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data-Tier Subnets
//
// The org vpc module (v2.1.0) does not expose a data / isolated tier.
// These subnets are therefore defined explicitly as L2 (ec2.Subnet) constructs.
//
// Routing:  ISOLATED – no default route, no NAT GW → no internet egress.
//           Only the implicit local VPC route is present.
// Naming:   {env}-{project}-data-{az}
// Route table: {env}-{project}-rt-data  (one shared isolated RT, no 0/0 route)
// ─────────────────────────────────────────────────────────────────────────────
export class DataSubnetTier extends Construct {
  /** All provisioned data-tier subnets. */
  public readonly subnets: ec2.Subnet[] = [];

  constructor(scope: Construct, id: string, props: DataSubnetTierProps) {
    super(scope, id);

    const { envName, project, vpc, cidrBlocks, azSuffixes, requiredTags } = props;

    if (cidrBlocks.length !== azSuffixes.length) {
      throw new Error('cidrBlocks and azSuffixes must have the same length');
    }

    // ── Shared isolated route table (local VPC route only, no 0/0) ──────────
    // Naming: {env}-{project}-rt-data
    const dataRt = new ec2.CfnRouteTable(this, 'DataRouteTable', {
      vpcId: vpc.vpcId,
      tags: [
        { key: 'Name',  value: `${envName}-${project}-rt-data` },
        ...Object.entries(requiredTags).map(([k, v]) => ({ key: k, value: v })),
      ],
    });

    // ── One subnet per AZ ───────────────────────────────────────────────────
    cidrBlocks.forEach((cidr, i) => {
      const az     = azSuffixes[i];
      const suffix = az.toUpperCase();               // logical ID suffix: A, B, C
      const subnetName = `${envName}-${project}-data-${az}`;

      // L1 subnet (ec2.Subnet L2 requires a routerType that we don't need here)
      const cfnSubnet = new ec2.CfnSubnet(this, `DataSubnet${suffix}`, {
        vpcId:               vpc.vpcId,
        cidrBlock:           cidr,
        availabilityZone:    `${cdk.Stack.of(this).region}${az}`,
        mapPublicIpOnLaunch: false,
        tags: [
          { key: 'Name',  value: subnetName },
          ...Object.entries(requiredTags).map(([k, v]) => ({ key: k, value: v })),
        ],
      });

      // Associate subnet with the shared isolated route table
      new ec2.CfnSubnetRouteTableAssociation(this, `DataSubnetRtAssoc${suffix}`, {
        subnetId:     cfnSubnet.ref,
        routeTableId: dataRt.ref,
      });

      // Wrap in L2 for convenient downstream access
      const subnet = ec2.Subnet.fromSubnetAttributes(this, `DataSubnetL2${suffix}`, {
        subnetId:         cfnSubnet.ref,
        availabilityZone: `${cdk.Stack.of(this).region}${az}`,
      }) as ec2.Subnet;

      this.subnets.push(subnet);
    });
  }
}