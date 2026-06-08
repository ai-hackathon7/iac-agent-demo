# ---------------------------------------------------------------------------
# Primary Application Data Bucket Outputs
# ---------------------------------------------------------------------------
output "aoc_application_data_bucket_id" {
  description = "The name (ID) of the AOC application data S3 bucket."
  value       = aws_s3_bucket.aoc_application_data.id
}

output "aoc_application_data_bucket_arn" {
  description = "The ARN of the AOC application data S3 bucket. Use this in IAM policies."
  value       = aws_s3_bucket.aoc_application_data.arn
}

output "aoc_application_data_bucket_domain_name" {
  description = "The bucket domain name for path-style S3 access."
  value       = aws_s3_bucket.aoc_application_data.bucket_domain_name
}

output "aoc_application_data_bucket_regional_domain_name" {
  description = "The regional bucket domain name (recommended for reduced latency and consistency)."
  value       = aws_s3_bucket.aoc_application_data.bucket_regional_domain_name
}

output "aoc_application_data_bucket_versioning_status" {
  description = "Versioning status of the application data bucket."
  value       = aws_s3_bucket_versioning.aoc_application_data.versioning_configuration[0].status
}

# ---------------------------------------------------------------------------
# Access Logs Bucket Outputs
# ---------------------------------------------------------------------------
output "access_logs_bucket_id" {
  description = "The name (ID) of the S3 access logging bucket."
  value       = aws_s3_bucket.access_logs.id
}

output "access_logs_bucket_arn" {
  description = "The ARN of the S3 access logging bucket."
  value       = aws_s3_bucket.access_logs.arn
}