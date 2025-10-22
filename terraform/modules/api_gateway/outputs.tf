output "api_id" {
  description = "ID of the API Gateway"
  value       = aws_api_gateway_rest_api.main.id
}

output "api_endpoint" {
  description = "Endpoint URL of the API Gateway"
  value       = aws_api_gateway_stage.main.invoke_url
}

output "api_execution_arn" {
  description = "Execution ARN of the API Gateway"
  value       = aws_api_gateway_rest_api.main.execution_arn
}

output "stage_name" {
  description = "Name of the API Gateway stage"
  value       = aws_api_gateway_stage.main.stage_name
}

output "generate_story_endpoint" {
  description = "Full URL for the /generate-story endpoint"
  value       = "${aws_api_gateway_stage.main.invoke_url}/generate-story"
}

output "regenerate_segment_endpoint" {
  description = "Full URL for the /regenerate-segment endpoint"
  value       = "${aws_api_gateway_stage.main.invoke_url}/regenerate-segment"
}

output "generate_story_outline_endpoint" {
  description = "Full URL for the /generate-story-outline endpoint"
  value       = "${aws_api_gateway_stage.main.invoke_url}/generate-story-outline"
}

output "generate_story_image_endpoint" {
  description = "Full URL for the /generate-story-image endpoint"
  value       = "${aws_api_gateway_stage.main.invoke_url}/generate-story-image"
}

output "regenerate_segment_image_endpoint" {
  description = "Full URL for the /regenerate-segment-image endpoint"
  value       = "${aws_api_gateway_stage.main.invoke_url}/regenerate-segment-image"
}

output "generate_topics_ideas_endpoint" {
  description = "Full URL for the /generate-topics-ideas endpoint"
  value       = "${aws_api_gateway_stage.main.invoke_url}/generate-topics-ideas"
}
