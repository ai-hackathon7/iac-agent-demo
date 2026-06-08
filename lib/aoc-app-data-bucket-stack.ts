import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

// ─────────────────────────────────────────────────────────────────────────────
// Stack Props
// ─────────────────────────────────────────────────────────────────────────────
export interface AocAppDataBucketStackProps extends cdk.StackProps {
  /**
   * Deployment environment.
   * Must be one of: dev | staging | prod
   * Used in both the bucket name and the Environment tag.
   */
  readonly env: 'dev' | 'staging' | 'prod';

  /**
   * AWS Account ID — embedded in the bucket name per org naming convention:
   * {account_id}-{env}-{project}-{purpose}
   */
  readonly accountId: string;

  /**
   * Owning team name (required tag).
   * Example: "platform-engineering"
   */
  readonly team: string;

  /**
   * Cost centre code (required tag).
   * Must match pattern: CC-XXXX  (e.g. "CC-4231")
   */
  readonly costCenter: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stack
// ─────────────────────────────────────────────────────────────────────────────
export class AocAppDataBucketStack extends cdk.Stack {
  /** Expose the bucket so integration tests / other stacks can reference it. */
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: AocAppDataBucketStackProps) {
    super(scope, id, props);

    // ── Validate costCenter format at synth time ──────────────────────────
    if (!/^CC-\d{4}$/.test(props.costCenter)) {
      throw new Error(
        `Invalid costCenter "${props.costCenter}". Must match CC-XXXX (e.g. CC-4231).`
      );
    }

    // ── Bucket name — org naming convention: {account_id}-{env}-{project}-{purpose}
    //    Resolved: {accountId}-{env}-aoc-app-data
    const bucketName = `${props.accountId}-${props.env}-aoc-app-data`;

    // ── S3 Bucket ─────────────────────────────────────────────────────────
    this.bucket = new s3.Bucket(this, 'AocAppDataBucket', {
      bucketName,

      // Versioning — enabled to protect against accidental deletion/overwrites
      versioned: true,

      // Encryption — SSE-S3 (AES256). Upgrade to S3_MANAGED → KMS if needed.
      encryption: s3.BucketEncryption.S3_MANAGED,

      // Public access — fully blocked; bucket is private application storage
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,

      // Enforce HTTPS-only access (best practice for private data)
      enforceSSL: true,

      // Retain bucket on stack deletion to prevent accidental data loss.
      // Change to DESTROY (+ autoDeleteObjects: true) only in dev if desired.
      removalPolicy: cdk.RemovalPolicy.RETAIN,

      // Object ownership — bucket-owner enforced, disables ACLs
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    });

    // ── Required tags (org tagging policy v1.0) ───────────────────────────
    cdk.Tags.of(this.bucket).add('Environment',       props.env);
    cdk.Tags.of(this.bucket).add('Project',           'AOC');
    cdk.Tags.of(this.bucket).add('Team',              props.team);
    cdk.Tags.of(this.bucket).add('CostCenter',        props.costCenter);
    cdk.Tags.of(this.bucket).add('ManagedBy',         'cdk');        // ⚠ see ASSUMPTIONS

    // ── Optional tags ─────────────────────────────────────────────────────
    cdk.Tags.of(this.bucket).add('DataClassification', 'internal');  // ⚠ see ASSUMPTIONS
    cdk.Tags.of(this.bucket).add('Backup',             'daily');

    // ── Stack-level outputs ───────────────────────────────────────────────
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