output "lambda_function_name" {
  description = "Name of the story image Lambda function"
  value       = aws_lambda_function.story_image_main.function_name
}

output "lambda_function_arn" {
  description = "ARN of the story image Lambda function"
  value       = aws_lambda_function.story_image_main.arn
}

output "lambda_invoke_arn" {
  description = "Invoke ARN of the story image Lambda function"
  value       = aws_lambda_function.story_image_main.invoke_arn
}


