import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface AocAppDataStackProps extends cdk.StackProps {
  /**
   * Deployment environment. Must be one of: dev | staging | prod.
   * Used in resource names and the Environment tag.
   */
  readonly env_name: 'dev' | 'staging' | 'prod';

  /**
   * Owning team name — populates the required "Team" tag.
   * e.g. "platform", "backend"
   */
  readonly owningTeam: string;

  /**
   * Cost center code — must match pattern CC-XXXX (e.g. "CC-1234").
   * Populates the required "CostCenter" tag.
   */
  readonly costCenter: string;

  /**
   * Optional: DataClassification tag value.
   * Defaults to "internal". Set to "confidential" if the data warrants it.
   */
  readonly dataClassification?: 'public' | 'internal' | 'confidential';
}

export class AocAppDataStack extends cdk.Stack {
  /** The S3 bucket created for AOC application data. */
  public readonly bucket: s3.Bucket;

  /** The managed IAM policy granting application access to the bucket. */
  public readonly bucketPolicy: iam.ManagedPolicy;

  constructor(scope: Construct, id: string, props: AocAppDataStackProps) {
    super(scope, id, props);

    // -------------------------------------------------------------------------
    // Validate CostCenter format at synth time
    // -------------------------------------------------------------------------
    if (!/^CC-\d{4}$/.test(props.costCenter)) {
      throw new Error(
        `Invalid costCenter "${props.costCenter}". Must match pattern CC-XXXX (e.g. CC-1234).`
      );
    }

    const dataClassification = props.dataClassification ?? 'internal';

    // -------------------------------------------------------------------------
    // Apply required org tags at the stack level so every resource inherits them
    // Naming convention: {account_id}-{env}-{project}-{purpose}
    // -------------------------------------------------------------------------
    cdk.Tags.of(this).add('Environment', props.env_name);
    cdk.Tags.of(this).add('Project', 'AOC');
    cdk.Tags.of(this).add('Team', props.owningTeam);
    cdk.Tags.of(this).add('CostCenter', props.costCenter);
    cdk.Tags.of(this).add('ManagedBy', 'cdk');           // overrides plan's "terraform"
    cdk.Tags.of(this).add('DataClassification', dataClassification);

    // -------------------------------------------------------------------------
    // S3 Bucket — org naming: {account_id}-{env}-{project}-{purpose}
    //   => resolved at deploy time via cdk.Aws.ACCOUNT_ID token
    //   => e.g. "123456789012-dev-aoc-app-data"
    // -------------------------------------------------------------------------
    this.bucket = new s3.Bucket(this, 'AocAppDataBucket', {
      // Org naming convention: {account_id}-{env}-aoc-app-data
      bucketName: `${cdk.Aws.ACCOUNT_ID}-${props.env_name}-aoc-app-data`,

      // Security baseline — required by constraints
      encryption: s3.BucketEncryption.S3_MANAGED,   // AES256 / SSE-S3
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,                              // Deny http:// requests

      // Data durability
      versioned: true,

      // Safe removal behaviour — change to DESTROY only for ephemeral envs
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    // -------------------------------------------------------------------------
    // IAM Managed Policy — org naming: {env}-{project}-{service}-role pattern
    //   => "{env}-aoc-app-data-bucket-policy"
    // -------------------------------------------------------------------------
    this.bucketPolicy = new iam.ManagedPolicy(this, 'AocAppDataBucketPolicy', {
      managedPolicyName: `${props.env_name}-aoc-app-data-bucket-policy`,
      description:
        'IAM policy granting application access to the AOC app data S3 bucket',
      document: new iam.PolicyDocument({
        statements: [
          // Object-level permissions (scoped to the specific bucket)
          new iam.PolicyStatement({
            sid: 'AocAppDataObjectAccess',
            effect: iam.Effect.ALLOW,
            actions: [
              's3:GetObject',
              's3:PutObject',
              's3:DeleteObject',
            ],
            // Scoped to objects inside this bucket only — no wildcard resources
            resources: [this.bucket.arnForObjects('*')],
          }),

          // Bucket-level permission (ListBucket requires bucket ARN, not object ARN)
          new iam.PolicyStatement({
            sid: 'AocAppDataBucketList',
            effect: iam.Effect.ALLOW,
            actions: [
              's3:ListBucket',
            ],
            resources: [this.bucket.bucketArn],
          }),
        ],
      }),
    });

    // -------------------------------------------------------------------------
    // Stack outputs — useful for cross-stack references and CI pipelines
    // -------------------------------------------------------------------------
    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'AOC application data S3 bucket name',
      exportName: `${props.env_name}-aoc-app-data-bucket-name`,
    });

    new cdk.CfnOutput(this, 'BucketArn', {
      value: this.bucket.bucketArn,
      description: 'AOC application data S3 bucket ARN',
      exportName: `${props.env_name}-aoc-app-data-bucket-arn`,
    });

    new cdk.CfnOutput(this, 'BucketPolicyArn', {
      value: this.bucketPolicy.managedPolicyArn,
      description: 'ARN of the IAM managed policy for AOC app data bucket access',
      exportName: `${props.env_name}-aoc-app-data-bucket-policy-arn`,
    });
  }
}