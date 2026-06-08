terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# ---------------------------------------------------------------------------
# S3 Logging Bucket
# A dedicated bucket to receive access logs from the application data bucket.
# The logging bucket itself does NOT log (avoids circular logging).
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "access_logs" {
  bucket        = "${var.project_prefix}-application-data-logs-${var.environment}"
  force_destroy = false

  tags = merge(var.common_tags, {
    Name       = "${var.project_prefix}-application-data-logs-${var.environment}"
    Purpose    = "access-logs"
    CostCenter = var.cost_center
    Owner      = var.owner
  })
}

resource "aws_s3_bucket_versioning" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    id     = "expire-old-access-logs"
    status = "Enabled"

    filter {
      prefix = ""
    }

    expiration {
      days = 90
    }
  }
}

# Bucket ownership controls required to allow log delivery
resource "aws_s3_bucket_ownership_controls" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

# Grant S3 log delivery service write access to the logging bucket
resource "aws_s3_bucket_acl" "access_logs" {
  depends_on = [aws_s3_bucket_ownership_controls.access_logs]

  bucket = aws_s3_bucket.access_logs.id
  acl    = "log-delivery-write"
}

# ---------------------------------------------------------------------------
# AOC Application Data Bucket — Primary Resource
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "aoc_application_data" {
  bucket        = "${var.project_prefix}-application-data-${var.environment}"
  force_destroy = false

  tags = merge(var.common_tags, {
    Name       = "${var.project_prefix}-application-data-${var.environment}"
    Purpose    = "application-data"
    CostCenter = var.cost_center
    Owner      = var.owner
  })
}

# --- Versioning ---
resource "aws_s3_bucket_versioning" "aoc_application_data" {
  bucket = aws_s3_bucket.aoc_application_data.id

  versioning_configuration {
    status = "Enabled"
  }
}

# --- Server-Side Encryption (AES256 / SSE-S3) ---
resource "aws_s3_bucket_server_side_encryption_configuration" "aoc_application_data" {
  bucket = aws_s3_bucket.aoc_application_data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# --- Block All Public Access ---
resource "aws_s3_bucket_public_access_block" "aoc_application_data" {
  bucket = aws_s3_bucket.aoc_application_data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- Access Logging → dedicated logging bucket ---
resource "aws_s3_bucket_logging" "aoc_application_data" {
  bucket = aws_s3_bucket.aoc_application_data.id

  target_bucket = aws_s3_bucket.access_logs.id
  target_prefix = "s3-access-logs/${aws_s3_bucket.aoc_application_data.id}/"
}

# --- Lifecycle Rules ---
resource "aws_s3_bucket_lifecycle_configuration" "aoc_application_data" {
  # Versioning must be enabled before lifecycle rules that act on versions
  depends_on = [aws_s3_bucket_versioning.aoc_application_data]

  bucket = aws_s3_bucket.aoc_application_data.id

  # Transition current-version objects to lower-cost storage tiers
  rule {
    id     = "transition-current-to-ia"
    status = "Enabled"

    filter {
      prefix = ""
    }

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 180
      storage_class = "GLACIER"
    }
  }

  # Clean up incomplete multipart uploads to avoid orphaned storage costs
  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {
      prefix = ""
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # Expire non-current (overwritten/deleted) versions to manage storage costs
  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {
      prefix = ""
    }

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }

    noncurrent_version_transition {
      noncurrent_days = 60
      storage_class   = "GLACIER"
    }

    noncurrent_version_expiration {
      noncurrent_days = 365
    }
  }
}

# --- Bucket Ownership Controls ---
resource "aws_s3_bucket_ownership_controls" "aoc_application_data" {
  bucket = aws_s3_bucket.aoc_application_data.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# --- Bucket Policy: enforce TLS-only (HTTPS) access ---
resource "aws_s3_bucket_policy" "aoc_application_data_tls_only" {
  bucket     = aws_s3_bucket.aoc_application_data.id
  depends_on = [aws_s3_bucket_public_access_block.aoc_application_data]

  policy = data.aws_iam_policy_document.aoc_application_data_tls_only.json
}

data "aws_iam_policy_document" "aoc_application_data_tls_only" {
  statement {
    sid    = "DenyNonTLSRequests"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]

    resources = [
      aws_s3_bucket.aoc_application_data.arn,
      "${aws_s3_bucket.aoc_application_data.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}