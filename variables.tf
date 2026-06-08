variable "region" {
  description = "AWS region where all resources will be deployed."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (e.g. dev, staging, prod). Appended to resource names."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "project_prefix" {
  description = <<-EOT
    Short project identifier prepended to every resource name.
    Defaults to 'aoc' matching the AOC project; override if your org
    naming convention requires a different prefix.
  EOT
  type        = string
  default     = "aoc"
}

variable "cost_center" {
  description = "Cost center code used for billing allocation (required tag)."
  type        = string
}

variable "owner" {
  description = "Team or individual owner of this resource (required tag)."
  type        = string
}

variable "common_tags" {
  description = <<-EOT
    Map of tags applied to every resource in this stack.
    Merged with resource-specific tags; resource-specific values take precedence.
  EOT
  type        = map(string)
  default = {
    Project     = "AOC"
    ManagedBy   = "terraform"
  }
}