import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

// ─────────────────────────────────────────────────────────────────────────────
// Stack Props
// All required tags + bucket-specific overrides must be passed at deploy time.
// ─────────────────────────────────────────────────────────────────────────────
export interface AocAppDataBucketStackProps extends cdk.StackProps {
  /** Deployment environment — must be one of: dev | staging | prod */
  readonly env: 'dev' | 'staging' | 'prod';

  /**
   * Owning team name, e.g. "platform-engineering".
   * Required by org tagging policy.
   */
  readonly team: string;

  /**
   * Cost center identifier — must match pattern CC-XXXX, e.g. "CC-1234".
   * Required by org tagging policy.
   */
  readonly costCenter: string;

  /**
   * Data sensitivity level.
   * Defaults to "internal" — set to "confidential" if the bucket holds PII.
   * @default "internal"
   */
  readonly dataClassification?: 'public' | 'internal' | 'confidential';

  /**
   * Backup frequency tag.
   * @default "daily"
   */
  readonly backup?: 'daily' | 'weekly' | 'none';

  /**
   * Number of days before non-current object versions are permanently deleted.
   * @default 90
   */
  readonly noncurrentVersionExpirationDays?: number;

  /**
   * Number of days before current objects are transitioned to S3-IA.
   * @default 30
   */
  readonly transitionToIADays?: number;

  /**
   * Number of days before current objects are transitioned to Glacier.
   * @default 90
   */
  readonly transitionToGlacierDays?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stack
// ─────────────────────────────────────────────────────────────────────────────
export class AocAppDataBucketStack extends cdk.Stack {
  /** The underlying S3 bucket — exposed for cross-stack references if needed. */
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: AocAppDataBucketStackProps) {
    super(scope, id, props);

    // ── Validate CostCenter format ──────────────────────────────────────────
    if (!/^CC-\d{4}$/.test(props.costCenter)) {
      throw new Error(
        `Invalid CostCenter "${props.costCenter}". Must match pattern CC-XXXX (e.g. CC-1234).`
      );
    }

    // ── Resolved defaults ───────────────────────────────────────────────────
    const dataClassification = props.dataClassification ?? 'internal';
    const backup              = props.backup              ?? 'daily';
    const noncurrentVersionExpirationDays = props.noncurrentVersionExpirationDays ?? 90;
    const transitionToIADays              = props.transitionToIADays              ?? 30;
    const transitionToGlacierDays         = props.transitionToGlacierDays         ?? 90;

    // ── Bucket name — org convention: {account_id}-{env}-{project}-{purpose}
    //    Resolved to: {account_id}-{env}-aoc-app-data
    //    CDK resolves cdk.Aws.ACCOUNT_ID at synthesis time.
    const bucketName = `${cdk.Aws.ACCOUNT_ID}-${props.env}-aoc-app-data`;

    // ── S3 Bucket ───────────────────────────────────────────────────────────
    this.bucket = new s3.Bucket(this, 'AocAppDataBucket', {
      bucketName,

      // Versioning — protects against accidental overwrites / deletes
      versioned: true,

      // Encryption — SSE-S3 (AES256); upgrade to S3_MANAGED_KMS for SSE-KMS
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true, // Deny any unencrypted-in-transit (HTTP) requests

      // Block ALL public access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,

      // Lifecycle rules — transition + expiry per data-retention policy
      lifecycleRules: [
        {
          id: 'aoc-app-data-lifecycle',
          enabled: true,

          // Current-version transitions
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(transitionToIADays),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(transitionToGlacierDays),
            },
          ],

          // Non-current version expiry (keeps costs bounded)
          noncurrentVersionExpiration: cdk.Duration.days(
            noncurrentVersionExpirationDays
          ),

          // Clean up incomplete multipart uploads after 7 days
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],

      // Retain the bucket on stack deletion — prevents accidental data loss.
      // Change to DESTROY only in dev/test environments with explicit intent.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Stack-level tags (propagate to all resources in this stack) ─────────
    // Required tags — org tagging policy v1.0
    cdk.Tags.of(this).add('Environment',  props.env);
    cdk.Tags.of(this).add('Project',      'AOC');
    cdk.Tags.of(this).add('Team',         props.team);
    cdk.Tags.of(this).add('CostCenter',   props.costCenter);
    cdk.Tags.of(this).add('ManagedBy',    'cdk');

    // Optional tags — present in plan, included per policy
    cdk.Tags.of(this).add('DataClassification', dataClassification);
    cdk.Tags.of(this).add('Backup',             backup);

    // ── CfnOutputs ──────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'AOC app-data S3 bucket name',
      exportName: `${id}-BucketName`,
    });

    new cdk.CfnOutput(this, 'BucketArn', {
      value: this.bucket.bucketArn,
      description: 'AOC app-data S3 bucket ARN',
      exportName: `${id}-BucketArn`,
    });
  }
}