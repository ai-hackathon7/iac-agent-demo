import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

// ---------------------------------------------------------------------------
// Stack props — all placeholder values from the infrastructure plan MUST be
// supplied by the caller (or via CDK context / environment variables).
// ---------------------------------------------------------------------------
export interface AocAppDataBucketStackProps extends cdk.StackProps {
  /** Target environment: 'dev' | 'staging' | 'prod'  (required tag + bucket name segment) */
  readonly env_name: 'dev' | 'staging' | 'prod';

  /** Owning team name, e.g. 'platform-eng'  (required tag) */
  readonly owningTeam: string;

  /** Cost-centre code matching pattern CC-XXXX, e.g. 'CC-1234'  (required tag) */
  readonly costCenter: string;

  /**
   * Optional: data sensitivity level.
   * Defaults to 'internal' — review if data is 'confidential'.
   */
  readonly dataClassification?: 'public' | 'internal' | 'confidential';

  /**
   * Optional: backup cadence tag value.
   * Defaults to 'daily' — adjust if a different schedule is acceptable.
   */
  readonly backup?: 'daily' | 'weekly' | 'none';
}

// ---------------------------------------------------------------------------
// Stack
// ---------------------------------------------------------------------------
export class AocAppDataBucketStack extends cdk.Stack {
  /** The provisioned S3 bucket (exposed for cross-stack references if needed). */
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: AocAppDataBucketStackProps) {
    super(scope, id, props);

    // -----------------------------------------------------------------------
    // Resolved config values
    // -----------------------------------------------------------------------
    const dataClassification = props.dataClassification ?? 'internal';
    const backup              = props.backup              ?? 'daily';

    // Bucket name follows org pattern: {account_id}-{env}-{project}-{purpose}
    // Resolved to: {account_id}-{env}-aoc-app-data
    // cdk.Aws.ACCOUNT_ID resolves at synthesis/deploy time.
    const bucketName = `${cdk.Aws.ACCOUNT_ID}-${props.env_name}-aoc-app-data`;

    // -----------------------------------------------------------------------
    // Required tags — applied to every resource in this stack
    // -----------------------------------------------------------------------
    cdk.Tags.of(this).add('Environment',      props.env_name);
    cdk.Tags.of(this).add('Project',          'AOC');
    cdk.Tags.of(this).add('Team',             props.owningTeam);
    cdk.Tags.of(this).add('CostCenter',       props.costCenter);
    cdk.Tags.of(this).add('ManagedBy',        'cdk');

    // Optional tags (org policy)
    cdk.Tags.of(this).add('DataClassification', dataClassification);
    cdk.Tags.of(this).add('Backup',             backup);

    // -----------------------------------------------------------------------
    // S3 Bucket
    // No org module available — provisioned as a direct CDK L2 construct.
    // -----------------------------------------------------------------------
    this.bucket = new s3.Bucket(this, 'AocAppDataBucket', {
      bucketName,

      // --- Versioning ---
      versioned: true,

      // --- Encryption: AES256 (S3-managed keys) ---
      encryption:           s3.BucketEncryption.S3_MANAGED,
      enforceSSL:           true, // deny any HTTP (non-TLS) requests

      // --- Block all public access ---
      blockPublicAccess:    s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess:     false,

      // --- Lifecycle rules for cost optimisation ---
      lifecycleRules: [
        {
          id:      'tiered-storage-transition',
          enabled: true,
          transitions: [
            {
              // Move to S3 Standard-IA after 90 days
              storageClass:        s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter:     cdk.Duration.days(90),
            },
            {
              // Move to S3 Glacier after 365 days
              storageClass:        s3.StorageClass.GLACIER,
              transitionAfter:     cdk.Duration.days(365),
            },
          ],
        },
      ],

      // --- Retain bucket on stack deletion to protect application data ---
      removalPolicy:        cdk.RemovalPolicy.RETAIN,

      // --- Object ownership: bucket owner enforced (ACLs disabled) ---
      objectOwnership:      s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    });

    // -----------------------------------------------------------------------
    // Outputs
    // -----------------------------------------------------------------------
    new cdk.CfnOutput(this, 'BucketName', {
      value:       this.bucket.bucketName,
      description: 'AOC application data bucket name',
      exportName:  `${id}-BucketName`,
    });

    new cdk.CfnOutput(this, 'BucketArn', {
      value:       this.bucket.bucketArn,
      description: 'AOC application data bucket ARN',
      exportName:  `${id}-BucketArn`,
    });
  }
}