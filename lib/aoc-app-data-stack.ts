import * as cdk from 'aws-cdk-lib';
import * as s3  from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

// ─────────────────────────────────────────────────────────────────────────────
// Stack props — appEnv, team, and costCenter are REQUIRED at instantiation.
// ─────────────────────────────────────────────────────────────────────────────
export interface AocAppDataStackProps extends cdk.StackProps {
  /** Target deployment environment: dev | staging | prod */
  appEnv:     'dev' | 'staging' | 'prod';
  /** Owning team name (required by tagging policy) */
  team:       string;
  /** Cost center code — must match CC-XXXX (required by tagging policy) */
  costCenter: string;
}

export class AocAppDataStack extends cdk.Stack {
  /** The provisioned S3 bucket, exposed for cross-stack reference if needed */
  public readonly appDataBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: AocAppDataStackProps) {
    super(scope, id, props);

    const { appEnv, team, costCenter } = props;

    // ── Resolve account ID for bucket naming ─────────────────────────────────
    // cdk.Stack.of(this).account resolves to the actual account ID at synth time
    // when CDK_DEFAULT_ACCOUNT is set, or remains a token in pipeline contexts.
    const accountId = cdk.Stack.of(this).account;

    // ── Bucket name — org convention: {account_id}-{env}-{project}-{purpose} ─
    // Resolves to e.g. "123456789012-prod-aoc-app-data"
    const bucketName = `${accountId}-${appEnv}-aoc-app-data`;

    // ─────────────────────────────────────────────────────────────────────────
    // S3 Bucket
    // - AES256 SSE (SSE-S3)        — upgrade to BucketEncryption.KMS for
    //                                 stricter key management
    // - Versioning enabled          — supports data recovery & audit
    // - All public access blocked   — private bucket for app backend
    // - Lifecycle rules             — IA @ 90d, Glacier @ 365d, no expiry
    // - No auto-delete on destroy   — RETAIN policy protects data
    // ─────────────────────────────────────────────────────────────────────────
    this.appDataBucket = new s3.Bucket(this, 'AppDataBucket', {
      bucketName,

      // Encryption — AES256 / SSE-S3
      // ASSUMPTION: Defaulting to SSE-S3 (AES256) per plan.
      //             Switch to BucketEncryption.KMS_MANAGED or provide a
      //             custom KMS key if stricter key management is required.
      encryption:             s3.BucketEncryption.S3_MANAGED,
      enforceSSL:             true,   // Deny any non-HTTPS requests via bucket policy

      // Block all public access
      blockPublicAccess:      s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess:       false,

      // Versioning
      versioned:              true,

      // Lifecycle rules
      lifecycleRules: [
        {
          id:      'tiered-storage-lifecycle',
          enabled: true,
          transitions: [
            {
              // Move to S3 Standard-IA after 90 days
              storageClass:      s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter:   cdk.Duration.days(90),
            },
            {
              // Move to S3 Glacier after 365 days
              storageClass:      s3.StorageClass.GLACIER,
              transitionAfter:   cdk.Duration.days(365),
            },
          ],
          // ASSUMPTION: No expiration configured per plan.
          //             Add `expiration: cdk.Duration.days(N)` if a
          //             retention limit is defined.
        },
      ],

      // Retain bucket on stack deletion — prevents accidental data loss
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Tags — ALL required org tags applied at the bucket level.
    // Team and CostCenter are injected at synth time via context (see bin/app.ts).
    // ─────────────────────────────────────────────────────────────────────────

    // Required tags (per tagging policy v1.0)
    cdk.Tags.of(this.appDataBucket).add('Environment',      appEnv);
    cdk.Tags.of(this.appDataBucket).add('Project',          'AOC');
    cdk.Tags.of(this.appDataBucket).add('Team',             team);
    cdk.Tags.of(this.appDataBucket).add('CostCenter',       costCenter);
    cdk.Tags.of(this.appDataBucket).add('ManagedBy',        'cdk');   // ASSUMPTION: overridden from 'terraform' — this is a CDK deployment

    // Optional tags (per tagging policy v1.0)
    cdk.Tags.of(this.appDataBucket).add('DataClassification', 'internal'); // ASSUMPTION: 'internal'; change to 'confidential' if bucket holds PII or sensitive data
    cdk.Tags.of(this.appDataBucket).add('Backup',             'daily');    // ASSUMPTION: 'daily'; adjust to 'weekly' or 'none' per actual recovery requirements

    // ─────────────────────────────────────────────────────────────────────────
    // Stack outputs — useful for pipelines and cross-stack references
    // ─────────────────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AppDataBucketName', {
      value:       this.appDataBucket.bucketName,
      description: 'AOC application data S3 bucket name',
      exportName:  `${appEnv}-aoc-app-data-bucket-name`,
    });

    new cdk.CfnOutput(this, 'AppDataBucketArn', {
      value:       this.appDataBucket.bucketArn,
      description: 'AOC application data S3 bucket ARN',
      exportName:  `${appEnv}-aoc-app-data-bucket-arn`,
    });
  }
}