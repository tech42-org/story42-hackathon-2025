# DynamoDB Table for Story Sessions
resource "aws_dynamodb_table" "story_sessions" {
  name           = "${var.project_name}-story-sessions-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "user_id"
  range_key      = "session_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "session_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "N"
  }

  attribute {
    name = "route"
    type = "S"
  }

  # GSI for querying user sessions by timestamp (most recent first)
  global_secondary_index {
    name            = "TimestampIndex"
    hash_key        = "user_id"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # GSI for querying all sessions by route and timestamp (for analytics)
  global_secondary_index {
    name            = "RouteTimestampIndex"
    hash_key        = "route"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "${var.project_name}-story-sessions-${var.environment}"
    Environment = var.environment
    Project     = var.project_name
  }
}

