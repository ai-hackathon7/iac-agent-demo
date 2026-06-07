import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface AocAppDataBucketStackProps extends cdk.StackProps {
  /**
   * Deployment environment. Must be one of: dev | staging | prod.
   * Used in the bucket name and the Environment tag.
   */
  readonly env_name: 'dev' | 'staging' | 'prod';

  /**
   * Owning team name. Required by org tagging policy.
   * Example: "platform-engineering"
   */
  readonly team: string;

  /**
   * Cost centre code. Required by org tagging policy.
   * Must match pattern CC-XXXX (e.g. "CC-1234").
   */
  readonly costCenter: string;

  /**
   * Data sensitivity level. Defaults to 'internal'.
   * Use 'confidential' if sensitive data will be stored.
   */
  readonly dataClassification?: 'public' | 'internal' | 'confidential';

  /**
   * Backup cadence. Defaults to 'none' because S3 versioning
   * serves as the data-protection mechanism.
   */
  readonly backup?: 'daily' | 'weekly' | 'none';
}

export class AocAppDataBucketStack extends cdk.Stack {
  /** The provisioned S3 bucket — exposed for cross-stack references if needed. */
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: AocAppDataBucketStackProps) {
    super(scope, id, props);

    // ------------------------------------------------------------------ //
    //  Input validation
    // ------------------------------------------------------------------ //
    const costCenterPattern = /^CC-[0-9]{4}$/;
    if (!costCenterPattern.test(props.costCenter)) {
      throw new Error(
        `Invalid costCenter "${props.costCenter}". ` +
        'Must match pattern CC-XXXX (e.g. "CC-1234").'
      );
    }

    // ------------------------------------------------------------------ //
    //  Resolved tag values
    // ------------------------------------------------------------------ //
    const dataClassification = props.dataClassification ?? 'internal';
    const backup             = props.backup             ?? 'none';

    // ------------------------------------------------------------------ //
    //  Bucket name  —  org convention: {account_id}-{env}-{project}-{purpose}
    //  project  = "aoc"   |   purpose = "app-data"
    // ------------------------------------------------------------------ //
    const bucketName = `${cdk.Aws.ACCOUNT_ID}-${props.env_name}-aoc-app-data`;

    // ------------------------------------------------------------------ //
    //  S3 Bucket
    // ------------------------------------------------------------------ //
    this.bucket = new s3.Bucket(this, 'AocAppDataBucket', {
      bucketName,

      // Versioning
      versioned: true,

      // Encryption — AES256 (SSE-S3)
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL:  true,            // deny HTTP (unencrypted) requests

      // Block all public access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,

      // Retain bucket on stack deletion to prevent accidental data loss;
      // change to DESTROY + autoDeleteObjects only for ephemeral environments.
      removalPolicy: cdk.RemovalPolicy.RETAIN,

      // Object ownership — disable ACLs (best practice for new buckets)
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    });

    // ------------------------------------------------------------------ //
    //  Tags  —  all required + applicable optional tags from org policy
    // ------------------------------------------------------------------ //
    cdk.Tags.of(this.bucket).add('Environment',        props.env_name);
    cdk.Tags.of(this.bucket).add('Project',            'AOC');
    cdk.Tags.of(this.bucket).add('Team',               props.team);
    cdk.Tags.of(this.bucket).add('CostCenter',         props.costCenter);
    cdk.Tags.of(this.bucket).add('ManagedBy',          'cdk');
    cdk.Tags.of(this.bucket).add('DataClassification', dataClassification);
    cdk.Tags.of(this.bucket).add('Backup',             backup);

    // ------------------------------------------------------------------ //
    //  Stack outputs
    // ------------------------------------------------------------------ //
    new cdk.CfnOutput(this, 'BucketName', {
      description: 'AOC application data bucket name',
      value:       this.bucket.bucketName,
      exportName:  `${id}-BucketName`,
    });

    new cdk.CfnOutput(this, 'BucketArn', {
      description: 'AOC application data bucket ARN',
      value:       this.bucket.bucketArn,
      exportName:  `${id}-BucketArn`,
    });
  }
}