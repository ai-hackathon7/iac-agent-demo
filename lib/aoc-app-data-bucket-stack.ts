import * as cdk from 'aws-cdk-lib';
import * as s3  from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

// ── Stack props ────────────────────────────────────────────────────────────────
export interface AocAppDataBucketStackProps extends cdk.StackProps {
  /** One of: dev | staging | prod  (validated in bin/app.ts) */
  readonly envName: string;
  /** Owning team name, e.g. "platform-engineering" */
  readonly team: string;
  /** Cost centre in format CC-XXXX, e.g. "CC-4321" */
  readonly costCenter: string;
}

// ── Stack ──────────────────────────────────────────────────────────────────────
export class AocAppDataBucketStack extends cdk.Stack {
  /** Exposes the bucket so it can be consumed by other stacks if needed. */
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: AocAppDataBucketStackProps) {
    super(scope, id, props);

    const { envName, team, costCenter } = props;

    // ── Resolved account ID (available post-synth / deploy) ─────────────────
    const accountId = cdk.Stack.of(this).account;

    // ── Naming convention: {account_id}-{env}-{project}-{purpose} ───────────
    // project = "aoc", purpose = "app-data"  →  matches plan's bucket name
    const bucketName = `${accountId}-${envName}-aoc-app-data`;

    // ── Required + optional tags applied at the stack level ──────────────────
    // Every resource synthesised inside this stack inherits these tags.
    cdk.Tags.of(this).add('Environment',      envName);           // required
    cdk.Tags.of(this).add('Project',          'AOC');             // required
    cdk.Tags.of(this).add('Team',             team);              // required
    cdk.Tags.of(this).add('CostCenter',       costCenter);        // required — CC-XXXX
    cdk.Tags.of(this).add('ManagedBy',        'cdk');             // required
    cdk.Tags.of(this).add('DataClassification', 'internal');      // optional — change to 'confidential' if needed
    cdk.Tags.of(this).add('Backup',           'daily');           // optional

    // ── S3 Bucket ─────────────────────────────────────────────────────────────
    this.bucket = new s3.Bucket(this, 'AocAppDataBucket', {
      // ── Identity ────────────────────────────────────────────────────────────
      bucketName,

      // ── Encryption: SSE-S3 (AES256) ─────────────────────────────────────────
      // Upgrade to BucketEncryption.KMS_MANAGED for stricter key management.
      encryption:           s3.BucketEncryption.S3_MANAGED,
      enforceSSL:           true,          // deny all non-HTTPS requests

      // ── Public access: fully blocked ─────────────────────────────────────────
      blockPublicAccess:    s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess:     false,

      // ── Versioning ───────────────────────────────────────────────────────────
      versioned:            true,

      // ── Object ownership ─────────────────────────────────────────────────────
      objectOwnership:      s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,

      // ── Lifecycle rules ───────────────────────────────────────────────────────
      lifecycleRules: [
        {
          id:      'aoc-app-data-tiering',
          enabled: true,
          // Current (live) object transitions
          transitions: [
            {
              // Transition to S3-IA after 90 days
              storageClass:            s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter:         cdk.Duration.days(90),
            },
            {
              // Transition to Glacier after 365 days
              storageClass:            s3.StorageClass.GLACIER,
              transitionAfter:         cdk.Duration.days(365),
            },
          ],
          // Non-current (versioned) object transitions
          noncurrentVersionTransitions: [
            {
              storageClass:              s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter:           cdk.Duration.days(90),
            },
            {
              storageClass:              s3.StorageClass.GLACIER,
              transitionAfter:           cdk.Duration.days(365),
            },
          ],
          // Clean up incomplete multipart uploads
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],

      // ── Removal policy: RETAIN for all envs (safest default for data buckets)
      // Change to DESTROY only in a dedicated sandbox/test account.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Stack outputs ─────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'BucketName', {
      value:       this.bucket.bucketName,
      description: 'AOC application data bucket name',
      exportName:  `${envName}-aoc-app-data-bucket-name`,
    });

    new cdk.CfnOutput(this, 'BucketArn', {
      value:       this.bucket.bucketArn,
      description: 'AOC application data bucket ARN',
      exportName:  `${envName}-aoc-app-data-bucket-arn`,
    });
  }
}