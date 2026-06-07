import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

// ─────────────────────────────────────────────
// Stack Props — all placeholder values MUST be
// supplied before running `npx cdk deploy`.
// ─────────────────────────────────────────────
export interface RdpAccessStackProps extends cdk.StackProps {
  /** Environment name: 'dev' | 'staging' | 'prod' */
  readonly env_name: 'dev' | 'staging' | 'prod';

  /** Short project identifier, e.g. 'myapp' */
  readonly project: string;

  /** Owning team name, e.g. 'platform' */
  readonly team: string;

  /** Cost center code matching pattern CC-XXXX, e.g. 'CC-1234' */
  readonly costCenter: string;

  /**
   * The VPC to attach this security group to.
   * If you are provisioning a new VPC alongside this stack,
   * pass the VPC construct. Otherwise import an existing one
   * via ec2.Vpc.fromLookup().
   */
  readonly vpc: ec2.IVpc;

  /**
   * CIDR block used as the RDP ingress source.
   * Defaults to the VPC's own CIDR block so that only
   * intra-VPC traffic can reach RDP (port 3389).
   * Override only if you need a more restrictive range.
   *
   * @default vpc.vpcCidrBlock
   */
  readonly rdpSourceCidr?: string;
}

export class RdpAccessStack extends cdk.Stack {
  /** The created security group — export for cross-stack attachment. */
  public readonly rdpSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: RdpAccessStackProps) {
    super(scope, id, props);

    // ── Validate CostCenter format ──────────────────────────────────────────
    if (!/^CC-\d{4}$/.test(props.costCenter)) {
      throw new Error(
        `CostCenter must match pattern CC-XXXX (e.g. CC-1234). Received: "${props.costCenter}"`
      );
    }

    // ── Org-required tags applied to every resource in this stack ───────────
    // Pattern from tagging policy v1.0 — ManagedBy must be 'cdk' for CDK stacks.
    cdk.Tags.of(this).add('Environment', props.env_name);
    cdk.Tags.of(this).add('Project',     props.project);
    cdk.Tags.of(this).add('Team',        props.team);
    cdk.Tags.of(this).add('CostCenter',  props.costCenter);
    cdk.Tags.of(this).add('ManagedBy',   'cdk'); // plan said 'terraform'; corrected to 'cdk'

    // ── Naming convention: {env}-{project}-{service}-sg ─────────────────────
    const sgName = `${props.env_name}-${props.project}-rdp-sg`;

    // ── RDP ingress source — default to VPC CIDR (least-privilege) ──────────
    const rdpSourceCidr = props.rdpSourceCidr ?? props.vpc.vpcCidrBlock;

    // ── Security Group ───────────────────────────────────────────────────────
    this.rdpSecurityGroup = new ec2.SecurityGroup(this, 'RdpAccessSecurityGroup', {
      vpc:               props.vpc,
      securityGroupName: sgName,
      description:       'Security group allowing RDP access from within the VPC CIDR',
      // Disable the default allow-all egress so we can define it explicitly below.
      allowAllOutbound: false,
    });

    // ── Ingress: RDP (TCP 3389) from VPC CIDR only ──────────────────────────
    this.rdpSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(rdpSourceCidr),
      ec2.Port.tcp(3389),
      'Allow RDP from VPC CIDR',
    );

    // ── Egress: all outbound traffic ─────────────────────────────────────────
    // NOTE: Tighten this rule if outbound destinations are known at deploy time.
    this.rdpSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTraffic(),
      'Allow all outbound traffic',
    );

    // ── CloudFormation Output ─────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'RdpSecurityGroupId', {
      value:       this.rdpSecurityGroup.securityGroupId,
      description: 'ID of the RDP access security group',
      exportName:  `${sgName}-id`,
    });

    new cdk.CfnOutput(this, 'RdpSecurityGroupName', {
      value:       sgName,
      description: 'Name of the RDP access security group',
    });

    new cdk.CfnOutput(this, 'RdpSourceCidr', {
      value:       rdpSourceCidr,
      description: 'CIDR used as the RDP ingress source (should match VPC CIDR)',
    });
  }
}