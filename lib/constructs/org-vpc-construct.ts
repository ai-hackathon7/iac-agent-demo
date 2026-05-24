import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────
export interface OrgVpcConstructProps {
  readonly envName:      string;
  readonly project:      string;
  readonly cidrBlock:    string;
  readonly maxAzs:       number;
  readonly enableNat:    boolean;
  /** Set true in non-prod to provision only one NAT GW and cut cost. */
  readonly singleNat:    boolean;
  readonly requiredTags: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Org VPC Construct  –  mirrors vpc module v2.1.0
//
// Subnet CIDR layout (explicit, matching the infrastructure plan):
//   Public  a/b/c : 10.0.0.0/23, 10.0.2.0/23, 10.0.4.0/23
//   Private a/b/c : 10.0.6.0/23, 10.0.8.0/23, 10.0.10.0/23
//
// Naming convention: {env}-{project}-{tier}-{az}  (org standard)
// ─────────────────────────────────────────────────────────────────────────────
export class OrgVpcConstruct extends Construct {
  /** Provisioned VPC – expose for downstream constructs. */
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: OrgVpcConstructProps) {
    super(scope, id);

    const { envName, project, cidrBlock, maxAzs, enableNat, singleNat, requiredTags } = props;
    const azSuffixes = ['a', 'b', 'c'].slice(0, maxAzs);

    // ── VPC ─────────────────────────────────────────────────────────────────
    // Naming convention: {env}-{project}-vpc
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName:    `${envName}-${project}-vpc`,
      ipAddresses: ec2.IpAddresses.cidr(cidrBlock),
      maxAzs,
      enableDnsHostnames: true,
      enableDnsSupport:   true,

      // CDK automatically provisions one IGW for public subnets,
      // and one NAT GW per AZ (or one total when natGateways=1).
      natGateways: enableNat ? (singleNat ? 1 : maxAzs) : 0,

      // Explicit subnet configuration – CIDRs match the infrastructure plan.
      subnetConfiguration: [
        // Public subnets: 10.0.0.0/23, 10.0.2.0/23, 10.0.4.0/23
        {
          cidrMask:   23,
          name:       'public',   // CDK appends AZ; overridden via Tags below
          subnetType: ec2.SubnetType.PUBLIC,
          mapPublicIpOnLaunch: true,
        },
        // Private subnets (→ NAT GW): 10.0.6.0/23, 10.0.8.0/23, 10.0.10.0/23
        {
          cidrMask:   23,
          name:       'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          mapPublicIpOnLaunch: false,
        },
      ],
    });

    // ── Subnet Name Tags (org naming convention) ────────────────────────────
    // CDK names subnets as "<name>Subnet<AZ><index>"; we override the `Name`
    // tag to conform to the org pattern: {env}-{project}-{tier}-{az}.
    this.vpc.publicSubnets.forEach((subnet, i) => {
      const az = azSuffixes[i] ?? i.toString();
      cdk.Tags.of(subnet).add('Name', `${envName}-${project}-public-${az}`);
      Object.entries(requiredTags).forEach(([k, v]) => cdk.Tags.of(subnet).add(k, v));
    });

    this.vpc.privateSubnets.forEach((subnet, i) => {
      const az = azSuffixes[i] ?? i.toString();
      cdk.Tags.of(subnet).add('Name', `${envName}-${project}-private-${az}`);
      Object.entries(requiredTags).forEach(([k, v]) => cdk.Tags.of(subnet).add(k, v));
    });

    // ── Internet Gateway Name Tag ────────────────────────────────────────────
    // CDK provisions exactly one IGW per VPC; we tag it via the L1 child node.
    // Naming: {env}-{project}-igw  (no AZ suffix)
    const cfnVpc   = this.vpc.node.defaultChild as ec2.CfnVPC;
    const igw      = this.vpc.node.children.find(
      (c) => c instanceof ec2.CfnInternetGateway,
    ) as ec2.CfnInternetGateway | undefined;

    if (igw) {
      igw.addPropertyOverride('Tags', [
        { Key: 'Name', Value: `${envName}-${project}-igw` },
        ...Object.entries(requiredTags).map(([k, v]) => ({ Key: k, Value: v })),
      ]);
    }

    // ── NAT Gateway Name Tags ─────────────────────────────────────────────
    // Naming: {env}-{project}-nat-{az}
    // CDK creates NatGateway CfnResource children on each public subnet.
    this.vpc.publicSubnets.forEach((subnet, i) => {
      const az = azSuffixes[i] ?? i.toString();
      subnet.node.children
        .filter((c) => c instanceof ec2.CfnNatGateway)
        .forEach((natGwNode) => {
          const natGw = natGwNode as ec2.CfnNatGateway;
          natGw.addPropertyOverride('Tags', [
            { Key: 'Name', Value: `${envName}-${project}-nat-${az}` },
            ...Object.entries(requiredTags).map(([k, v]) => ({ Key: k, Value: v })),
          ]);
        });
    });

    // ── Route Table Name Tags ────────────────────────────────────────────────
    // Public route table(s):  {env}-{project}-rt-public
    // Private route tables:   {env}-{project}-rt-private-{az}
    //
    // CDK creates one shared route table for all public subnets and one
    // dedicated route table per private subnet (→ AZ-specific NAT GW).
    this.vpc.publicSubnets.forEach((subnet) => {
      const cfnSubnet = subnet.node.defaultChild as ec2.CfnSubnet;
      // Walk siblings to find the route table associated with this subnet
      subnet.node.children
        .filter((c) => c instanceof ec2.CfnRouteTable)
        .forEach((rtNode) => {
          (rtNode as ec2.CfnRouteTable).addPropertyOverride('Tags', [
            { Key: 'Name', Value: `${envName}-${project}-rt-public` },
            ...Object.entries(requiredTags).map(([k, v]) => ({ Key: k, Value: v })),
          ]);
        });
      void cfnSubnet; // suppress unused-var warning
    });

    this.vpc.privateSubnets.forEach((subnet, i) => {
      const az = azSuffixes[i] ?? i.toString();
      subnet.node.children
        .filter((c) => c instanceof ec2.CfnRouteTable)
        .forEach((rtNode) => {
          (rtNode as ec2.CfnRouteTable).addPropertyOverride('Tags', [
            { Key: 'Name', Value: `${envName}-${project}-rt-private-${az}` },
            ...Object.entries(requiredTags).map(([k, v]) => ({ Key: k, Value: v })),
          ]);
        });
    });

    // ── VPC Name Tag (explicit, belt-and-suspenders) ─────────────────────────
    cdk.Tags.of(this.vpc).add('Name', `${envName}-${project}-vpc`);
    Object.entries(requiredTags).forEach(([k, v]) => cdk.Tags.of(this.vpc).add(k, v));
  }
}