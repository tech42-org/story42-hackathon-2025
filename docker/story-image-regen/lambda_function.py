import json
import logging
import os
import io
from datetime import datetime, timezone
from typing import List, Optional
from decimal import Decimal
import boto3
from google import genai
from google.genai import types
from PIL import Image

# Configure logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize clients
s3_client = boto3.client('s3')
secrets_client = boto3.client('secretsmanager')
dynamodb = boto3.resource('dynamodb')
MODEL_ID = "gemini-2.5-flash-image-preview"

# S3 bucket for storing images
S3_BUCKET = os.environ.get('S3_BUCKET', 'aws-hackathon-2025-story-images')
GOOGLE_API_KEY_SECRET_ARN = os.environ.get('GOOGLE_API_KEY_SECRET_ARN')
DYNAMODB_TABLE_NAME = os.environ.get('DYNAMODB_TABLE_NAME')
table = dynamodb.Table(DYNAMODB_TABLE_NAME) if DYNAMODB_TABLE_NAME else None

# Cache for API key
_google_api_key_cache: Optional[str] = None

# Helper function to convert Decimal to float for JSON serialization
def decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError

def write_to_dynamodb(user_id: str, session_id: str, route: str, request_data: dict, response_data: dict) -> None:
    """
    Write request/response data to DynamoDB for tracking and analytics.
    This function will not raise exceptions to avoid breaking the main Lambda flow.
    
    Args:
        user_id: User ID from Cognito
        session_id: Session ID (typically job_id)
        route: The route/endpoint that was called
        request_data: The request payload
        response_data: The response payload
    """
    if not table or not DYNAMODB_TABLE_NAME:
        logger.warning("DynamoDB table not configured. Skipping write.")
        return
    
    try:
        timestamp_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        created_at = datetime.now(timezone.utc).isoformat()
        
        # Serialize request and response as JSON strings to avoid DynamoDB type descriptors
        # This makes the data more readable and easier to query
        item = {
            'user_id': user_id,
            'session_id': session_id,
            'timestamp': timestamp_ms,
            'route': route,
            'created_at': created_at,
            'request': json.dumps(request_data, default=decimal_default),
            'response': json.dumps(response_data, default=decimal_default)
        }
        
        table.put_item(Item=item)
        logger.info(f"Successfully wrote tracking data to DynamoDB for session: {session_id}")
    except Exception as e:
        logger.error(f"Error writing to DynamoDB: {str(e)}")
        # Don't raise - we don't want tracking failures to break the main flow

def get_google_api_key() -> str:
    """
    Retrieve Google API key from Secrets Manager (with caching)
    """
    global _google_api_key_cache
    
    if _google_api_key_cache:
        return _google_api_key_cache
    
    try:
        if not GOOGLE_API_KEY_SECRET_ARN:
            raise ValueError("GOOGLE_API_KEY_SECRET_ARN environment variable not set")
        
        logger.info(f"Retrieving Google API key from Secrets Manager: {GOOGLE_API_KEY_SECRET_ARN}")
        
        response = secrets_client.get_secret_value(SecretId=GOOGLE_API_KEY_SECRET_ARN)
        
        if 'SecretString' in response:
            secret = response['SecretString']
            # Handle both plain string and JSON format
            try:
                secret_dict = json.loads(secret)
                api_key = secret_dict.get('GOOGLE_API_KEY', secret)
            except json.JSONDecodeError:
                api_key = secret
            
            _google_api_key_cache = api_key
            logger.info("Successfully retrieved Google API key from Secrets Manager")
            return api_key
        else:
            raise ValueError("Secret does not contain SecretString")
            
    except Exception as e:
        logger.error(f"Error retrieving Google API key from Secrets Manager: {str(e)}")
        raise

def clean_unicode_characters(text: str) -> str:
    """
    Clean Unicode escape sequences and special characters from text.
    Replaces common Unicode punctuation marks with their ASCII equivalents or spaces.
    
    Args:
        text: The text to clean
    
    Returns:
        Cleaned text with Unicode characters replaced
    """
    # Dictionary of Unicode characters to replace
    replacements = {
        '\u2019': "'",      # Right single quotation mark
        '\u2018': "'",      # Left single quotation mark
        '\u201c': '"',      # Left double quotation mark
        '\u201d': '"',      # Right double quotation mark
        '\u2011': '-',      # Non-breaking hyphen
        '\u2013': '-',      # En dash
        '\u2014': '-',      # Em dash
        '\u2026': '...',    # Horizontal ellipsis
        '\u00a0': ' ',      # Non-breaking space
        '\u2022': '*',      # Bullet point
        '\u2032': "'",      # Prime (feet/minutes)
        '\u2033': '"',      # Double prime (inches/seconds)
    }
    
    cleaned_text = text
    for unicode_char, replacement in replacements.items():
        cleaned_text = cleaned_text.replace(unicode_char, replacement)
    
    return cleaned_text

def extract_quoted_text(text: str) -> str:
    """
    Extract text within quotation marks from a string.
    Handles both straight quotes (") and curly quotes (" ").
    Only looks for double quotes to avoid matching apostrophes.
    If no quoted text is found, returns the original text.
    
    Args:
        text: The text to extract quotes from
    
    Returns:
        Extracted quoted text, or original text if no quotes found
    """
    import re
    
    # Pattern to match text within various types of double quotation marks only
    # We exclude single quotes to avoid matching apostrophes like "I'm" or "Let's"
    patterns = [
        r'"([^"]+)"',      # Straight double quotes - use + instead of * to require at least 1 char
        r'"([^"]+)"',      # Curly double quotes (left and right)
        r'[""]([^""]+)[""]',  # Mixed curly quotes
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text)
        if matches:
            # Return the longest quoted text found (in case of nested quotes)
            longest_match = max(matches, key=len)
            return longest_match.strip()
    
    # If no quoted text found, return original text
    return text

def load_image_from_s3(s3_uri: str) -> Image.Image:
    """
    Load image from S3 URI and return PIL Image
    
    Args:
        s3_uri: S3 URI in format s3://bucket/key
    
    Returns:
        PIL Image object
    """
    try:
        # Parse S3 URI
        if not s3_uri.startswith('s3://'):
            raise ValueError(f"Invalid S3 URI format: {s3_uri}")
        
        # Remove s3:// prefix and split bucket/key
        s3_path = s3_uri[5:]
        bucket, key = s3_path.split('/', 1)
        
        logger.info(f"Loading image from S3: bucket={bucket}, key={key}")
        
        # Download image from S3
        response = s3_client.get_object(Bucket=bucket, Key=key)
        image_data = response['Body'].read()
        
        # Convert to PIL Image
        image = Image.open(io.BytesIO(image_data))
        logger.info(f"Successfully loaded image from S3: {s3_uri}")
        
        return image
        
    except Exception as e:
        logger.error(f"Error loading image from S3: {str(e)}")
        raise

def save_image_to_s3(image_data, s3_key: str) -> dict:
    """
    Save image to S3 and return both S3 URI and presigned URL
    
    Returns:
        dict with 's3_uri' and 'presigned_url' keys
    """
    try:
        # Convert PIL Image to bytes
        img_byte_arr = io.BytesIO()
        image_data.save(img_byte_arr, format='PNG')
        img_byte_arr.seek(0)
        
        # Upload to S3
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=s3_key,
            Body=img_byte_arr.getvalue(),
            ContentType='image/png'
        )
        
        # Generate S3 URI
        s3_uri = f"s3://{S3_BUCKET}/{s3_key}"
        
        # Generate presigned URL (valid for 1 hour)
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': S3_BUCKET,
                'Key': s3_key
            },
            ExpiresIn=3600  # 1 hour
        )
        
        logger.info(f"Image saved to S3: {s3_uri}")
        logger.info(f"Presigned URL generated (expires in 1 hour)")
        
        return {
            's3_uri': s3_uri,
            'presigned_url': presigned_url
        }
        
    except Exception as e:
        logger.error(f"Error saving image to S3: {str(e)}")
        raise

def generate_entire_story_image(complete_story_parts: List[dict], art_style: str, number_of_panels: int, user_id: str, job_id: str) -> dict:
    """
    Generate images for entire story using Gemini
    
    Args:
        complete_story_parts: List of story sections/segments dictionaries
        art_style: The art style for image generation
        number_of_panels: Number of panels/images to generate
        user_id: Cognito user ID for organizing S3 storage
        job_id: Unique identifier for this image generation job
    """
    try:
        # Process story_parts: combine all segments in each section
        story_segments = []
        for story_part in complete_story_parts:
            for section in story_part['sections']:
                # Format and concatenate only narrator content in this section
                formatted_segments = []
                for seg in section['segments']:
                    speaker = seg['speaker']
                    
                    # Only include narrator content as scene description
                    if speaker.lower() == "narrator":
                        content = clean_unicode_characters(seg['segment_content'])
                        formatted_segments.append(f"Scene description: \"{content}\"")
                
                # Join all formatted segments with space
                combined_content = " ".join(formatted_segments)
                
                # Collect all unique speakers from this section (preserving order)
                speakers = []
                seen = set()
                for seg in section['segments']:
                    if seg['speaker'] not in seen:
                        speakers.append(seg['speaker'])
                        seen.add(seg['speaker'])
                
                # Create a combined segment with section_num as the segment_number
                story_segments.append({
                    "story_segment_number": section['section_num'],
                    "story_segment_content": combined_content,
                    "story_segment_speakers": speakers
                })

        api_key = get_google_api_key()
        client = genai.Client(api_key=api_key)
        
        # Build prompt for generating all story images
        prompt = f"Create a {number_of_panels} part story in {art_style} style with {number_of_panels} images with the following content for each image. Make sure to create the images separately. Do not include any text in the images."
        
        for i, segment in enumerate(story_segments[:number_of_panels], 1):
            prompt += f"Image {i}: {segment.get('story_segment_content', '')}\n"
        
        logger.info(f"[Job: {job_id}] Generating {number_of_panels} images for user {user_id}")
        
        # Retry loop for panel count validation
        max_retries = 3
        result_segments = None
        
        for attempt in range(1, max_retries + 1):
            logger.info(f"[Job: {job_id}] Image generation attempt {attempt}/{max_retries}")
            
            response = client.models.generate_content(
                model=MODEL_ID,
                contents=prompt,
            )
            
            # Extract images from response and save to S3
            temp_result_segments = []
            timestamp = datetime.now(timezone.utc).isoformat()
            image_index = 0
            
            # Access candidates[0].content.parts for Google GenAI response
            if hasattr(response, 'candidates') and response.candidates:
                parts = response.candidates[0].content.parts
            else:
                parts = []
            
            for part in parts:
                # Check if part has inline_data (image data)
                if hasattr(part, 'inline_data') and part.inline_data:
                    if image_index < len(story_segments):
                        segment = story_segments[image_index]
                        
                        # Get image bytes from inline_data
                        image_bytes = part.inline_data.data
                        
                        # Convert bytes to PIL Image
                        image = Image.open(io.BytesIO(image_bytes))
                        
                        # Generate S3 key with user_id and job_id
                        s3_key = f"users/{user_id}/jobs/{job_id}/segment_{segment.get('story_segment_number', image_index + 1)}.png"
                        
                        # Save image to S3 and get both URI and presigned URL
                        image_data = save_image_to_s3(image, s3_key)
                        
                        # Build result segment
                        temp_result_segments.append({
                            "story_segment_content": segment.get('story_segment_content', ''),
                            "story_segment_number": segment.get('story_segment_number', image_index + 1),
                            "story_segment_speaker": segment.get('story_segment_speaker', 'Narrator'),
                            "image_s3_uri": image_data['s3_uri'],
                            "image_presigned_url": image_data['presigned_url']
                        })
                        
                        image_index += 1
            
            # Validate panel count
            generated_count = len(temp_result_segments)
            if generated_count == number_of_panels:
                logger.info(f"[Job: {job_id}] Panel count validation successful: {generated_count} == {number_of_panels}")
                result_segments = temp_result_segments
                break
            else:
                logger.warning(f"[Job: {job_id}] Panel count mismatch on attempt {attempt}: generated {generated_count}, expected {number_of_panels}")
                result_segments = temp_result_segments  # Keep last result
                
                if attempt < max_retries:
                    logger.info(f"[Job: {job_id}] Retrying image generation...")
        
        # Build final result
        result = {
            "story_segments": result_segments,
            "metadata": {
                "created_timestamp": timestamp,
                "art_style": art_style,
                "number_of_panels": number_of_panels,
                "generated_panels": len(result_segments),
                "user_id": user_id,
                "job_id": job_id
            }
        }
        
        # Add warning if panel count doesn't match
        if len(result_segments) != number_of_panels:
            result["metadata"]["panel_count_warning"] = f"Generated {len(result_segments)} panels but {number_of_panels} were requested"
            logger.warning(f"[Job: {job_id}] All retries exhausted. Panel count mismatch persists: {len(result_segments)} != {number_of_panels}")
        
        logger.info(f"[Job: {job_id}] Successfully generated {len(result_segments)} story images for user {user_id}")
        return result
        
    except Exception as e:
        logger.error(f"[Job: {job_id}] Error generating story images: {str(e)}")
        raise

def regenerate_segment_image(user_request: str, original_segment_image_s3_uri: str, user_id: str, job_id: str) -> dict:
    """
    Regenerate a specific story segment image using Gemini by reading the original image and modifying it
    
    Args:
        user_request: User's request for how to modify the image
        original_segment_image_s3_uri: S3 URI of the original image
        user_id: Cognito user ID for organizing S3 storage
        job_id: Unique identifier for this image generation job
    """
    try:
        api_key = get_google_api_key()
        client = genai.Client(api_key=api_key)
        
        # Load the original image from S3
        logger.info(f"[Job: {job_id}] Loading original image from: {original_segment_image_s3_uri}")
        original_image = load_image_from_s3(original_segment_image_s3_uri)
        
        # Build prompt for regenerating image based on the original
        text_input = f"Using the provided image, {user_request}. "
        text_input += "Keep the overall composition and style similar to the original. "
        
        logger.info(f"[Job: {job_id}] Regenerating image for user {user_id} with request: {user_request}")
        
        # Generate new image using original image and text input
        response = client.models.generate_content(
            model=MODEL_ID,
            contents=[original_image, text_input],
        )
        
        # Extract image from response and save to S3
        timestamp = datetime.now(timezone.utc).isoformat()
        new_image_data = None
        
        # Extract the segment number from the original S3 URI
        # Example: users/user123/jobs/job456/segment_2.png -> 2
        segment_num = None
        try:
            import re
            match = re.search(r'segment_(\d+)', original_segment_image_s3_uri)
            if match:
                segment_num = int(match.group(1))
        except:
            segment_num = "unknown"
        
        # Access candidates[0].content.parts for Google GenAI response
        if hasattr(response, 'candidates') and response.candidates:
            parts = response.candidates[0].content.parts
        else:
            parts = []
        
        for part in parts:
            # Check if part has inline_data (image data)
            if hasattr(part, 'inline_data') and part.inline_data:
                # Get image bytes from inline_data
                image_bytes = part.inline_data.data
                
                # Convert bytes to PIL Image
                image = Image.open(io.BytesIO(image_bytes))
                
                # Generate S3 key for regenerated image with user_id and job_id
                s3_key = f"users/{user_id}/jobs/{job_id}/segment_{segment_num}_regenerated_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}.png"
                
                # Save image to S3 and get both URI and presigned URL
                new_image_data = save_image_to_s3(image, s3_key)
                break  # Only use the first image
        
        if not new_image_data:
            raise ValueError("No image generated in response")
        
        result = {
            "new_story_segment_image_s3_uri": new_image_data['s3_uri'],
            "new_story_segment_image_presigned_url": new_image_data['presigned_url'],
            "metadata": {
                "user_request": user_request,
                "original_segment_image_s3_uri": original_segment_image_s3_uri,
                "created_timestamp": timestamp,
                "user_id": user_id,
                "job_id": job_id
            }
        }
        
        logger.info(f"[Job: {job_id}] Successfully regenerated image for user {user_id}")
        return result
        
    except Exception as e:
        logger.error(f"[Job: {job_id}] Error regenerating segment image: {str(e)}")
        raise

def handler(event, context):
    """
    Lambda function handler for story image regeneration
    This function is protected by Cognito authentication via API Gateway
    """
    logger.info("Story image regeneration function invoked")
    logger.info(f"Event: {json.dumps(event)}")
    
    # Extract user information from Cognito claims if available
    user_info = {}
    if 'requestContext' in event:
        authorizer = event.get('requestContext', {}).get('authorizer', {})
        if 'claims' in authorizer:
            claims = authorizer['claims']
            user_info = {
                'email': claims.get('email'),
                'sub': claims.get('sub'),
                'username': claims.get('cognito:username')
            }
            logger.info(f"Authenticated user: {user_info}")
    
    try:
        # Parse the request body
        body = json.loads(event.get('body', '{}'))
        
        # Determine route from API Gateway path
        # Try both 'path' and 'resource' fields (resource doesn't include stage)
        path = event.get('resource', event.get('path', ''))
        logger.info(f"Path from event: {path}")
        
        if path.endswith('/generate-story-image'):
            route = 'generate_entire_story_image'
        elif path.endswith('/regenerate-segment-image'):
            route = 'regenerate_segment_image'
        else:
            route = body.get('route')  # Fallback to body route for backward compatibility
        
        logger.info(f"Determined route: {route}")
        
        if route == 'generate_entire_story_image':
            # Extract parameters
            complete_story_parts = body.get('complete_story_parts')
            art_style = body.get('art_style')
            number_of_panels = body.get('number_of_panels')
            job_id = body.get('job_id')
            
            # Get user_id from Cognito claims (use sub as user_id)
            user_id = user_info.get('sub', 'anonymous')
            
            # Validate required parameters
            if not all([complete_story_parts, art_style, number_of_panels, job_id]):
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'Missing required parameters: complete_story_parts, art_style, number_of_panels, job_id'
                    })
                }
            
            # Generate story images with user_id and job_id
            result = generate_entire_story_image(complete_story_parts, art_style, number_of_panels, user_id, job_id)
            
            response_body = {
                'success': True,
                'route': 'generate_entire_story_image',
                'result': result,
                'authenticated_user': user_info,
                'request_id': context.aws_request_id
            }
            
        elif route == 'regenerate_segment_image':
            # Extract parameters
            user_request = body.get('user_request')
            original_segment_image_s3_uri = body.get('original_segment_image_s3_uri')
            job_id = body.get('job_id')
            
            # Get user_id from Cognito claims (use sub as user_id)
            user_id = user_info.get('sub', 'anonymous')
            
            # Validate required parameters
            if not all([user_request, original_segment_image_s3_uri, job_id]):
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'error': 'Missing required parameters: user_request, original_segment_image_s3_uri, job_id'
                    })
                }
            
            # Regenerate segment image with user_id and job_id
            result = regenerate_segment_image(user_request, original_segment_image_s3_uri, user_id, job_id)
            
            response_body = {
                'success': True,
                'route': 'regenerate_segment_image',
                'result': result,
                'authenticated_user': user_info,
                'request_id': context.aws_request_id
            }
            
        else:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'error': f'Invalid route: {route}. Valid routes are: generate_entire_story_image, regenerate_segment_image'
                })
            }
        
        logger.info("Story image regeneration completed successfully")
        
        # Write to DynamoDB for tracking (non-blocking)
        try:
            user_id = user_info.get('sub', 'anonymous')
            session_id = body.get('job_id', body.get('session_id', f"session_{datetime.now(timezone.utc).timestamp()}"))
            route = response_body.get('route', 'unknown')
            
            write_to_dynamodb(
                user_id=user_id,
                session_id=session_id,
                route=route,
                request_data=body,
                response_data=response_body
            )
        except Exception as e:
            # Log but don't fail the request if DynamoDB write fails
            logger.error(f"Error writing to DynamoDB tracking: {str(e)}")
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(response_body)
        }
        
    except Exception as e:
        logger.error(f"Error in story image regeneration: {str(e)}")
        
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e),
                'request_id': context.aws_request_id
            })
        }

