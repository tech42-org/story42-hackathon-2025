"""
State Management Tools for persisting story creation sessions.

Enables users to save their progress and resume work later. Uses DynamoDB
for metadata and S3 for large content storage (audio/image files).
"""

import os
import json
from typing import Dict, Optional
from datetime import datetime
import boto3
from botocore.exceptions import ClientError
from strands import tool


# Initialize AWS clients (lazy initialization)
_dynamodb = None
_s3 = None


def get_dynamodb_client():
    """Lazy initialization of DynamoDB client."""
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource(
            'dynamodb',
            region_name=os.getenv('AWS_REGION', 'us-east-1')
        )
    return _dynamodb


def get_s3_client():
    """Lazy initialization of S3 client."""
    global _s3
    if _s3 is None:
        _s3 = boto3.client(
            's3',
            region_name=os.getenv('AWS_REGION', 'us-east-1')
        )
    return _s3


@tool
async def save_story_session(
    session_id: str,
    session_data: dict
) -> Dict:
    """
    Persist story creation session to DynamoDB.
    
    Saves complete session state including concepts, drafts, and user selections.
    Enables resuming work across multiple interactions.
    
    Args:
        session_id: Unique identifier for the session
        session_data: Complete session state dictionary
    
    Returns:
        Confirmation of successful save with timestamp
    """
    
    table_name = os.getenv('SESSION_TABLE_NAME', 'story-creator-sessions')
    
    try:
        dynamodb = get_dynamodb_client()
        table = dynamodb.Table(table_name)
        
        # Add timestamp
        session_data['updated_at'] = datetime.utcnow().isoformat()
        
        # Save to DynamoDB
        table.put_item(
            Item={
                'session_id': session_id,
                'data': json.dumps(session_data),  # Serialize complex data
                'updated_at': session_data['updated_at'],
                'ttl': int(datetime.utcnow().timestamp()) + (30 * 24 * 60 * 60)  # 30 days expiry
            }
        )
        
        return {
            "status": "success",
            "content": [{
                "json": {
                    "session_id": session_id,
                    "saved_at": session_data['updated_at'],
                    "message": "Session saved successfully"
                }
            }]
        }
        
    except ClientError as e:
        return {
            "status": "error",
            "content": [{
                "text": f"Failed to save session to DynamoDB: {e.response['Error']['Message']}"
            }]
        }
    except Exception as e:
        return {
            "status": "error",
            "content": [{
                "text": f"Error saving session: {str(e)}"
            }]
        }


@tool
async def load_story_session(session_id: str) -> Dict:
    """
    Retrieve story creation session from DynamoDB.
    
    Loads previously saved session to resume work.
    
    Args:
        session_id: Unique identifier for the session to load
    
    Returns:
        Complete session data or error if not found
    """
    
    table_name = os.getenv('SESSION_TABLE_NAME', 'story-creator-sessions')
    
    try:
        dynamodb = get_dynamodb_client()
        table = dynamodb.Table(table_name)
        
        response = table.get_item(Key={'session_id': session_id})
        
        if 'Item' in response:
            session_data = json.loads(response['Item']['data'])
            return {
                "status": "success",
                "content": [{
                    "json": {
                        "session_data": session_data,
                        "loaded_at": datetime.utcnow().isoformat()
                    }
                }]
            }
        else:
            return {
                "status": "error",
                "content": [{
                    "text": f"No session found with ID: {session_id}"
                }]
            }
            
    except ClientError as e:
        return {
            "status": "error",
            "content": [{
                "text": f"Failed to load session from DynamoDB: {e.response['Error']['Message']}"
            }]
        }
    except Exception as e:
        return {
            "status": "error",
            "content": [{
                "text": f"Error loading session: {str(e)}"
            }]
        }


@tool
async def save_draft_to_s3(
    session_id: str,
    draft_content: str,
    draft_id: str
) -> Dict:
    """
    Save large story draft content to S3.
    
    For very long stories, S3 is more efficient than DynamoDB.
    DynamoDB stores metadata and references the S3 object.
    
    Args:
        session_id: Session this draft belongs to
        draft_content: Full story text content
        draft_id: Unique identifier for this draft version
    
    Returns:
        S3 object URL and metadata
    """
    
    bucket_name = os.getenv('SESSION_BUCKET_NAME', 'story-creator-drafts')
    object_key = f"sessions/{session_id}/drafts/{draft_id}.json"
    
    try:
        s3 = get_s3_client()
        
        # Upload to S3
        s3.put_object(
            Bucket=bucket_name,
            Key=object_key,
            Body=draft_content.encode('utf-8'),
            ContentType='application/json',
            Metadata={
                'session_id': session_id,
                'draft_id': draft_id,
                'uploaded_at': datetime.utcnow().isoformat()
            }
        )
        
        # Generate presigned URL (valid for 7 days)
        presigned_url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket_name, 'Key': object_key},
            ExpiresIn=7*24*60*60
        )
        
        return {
            "status": "success",
            "content": [{
                "json": {
                    "object_key": object_key,
                    "presigned_url": presigned_url,
                    "message": "Draft saved to S3 successfully"
                }
            }]
        }
        
    except ClientError as e:
        return {
            "status": "error",
            "content": [{
                "text": f"Failed to save draft to S3: {e.response['Error']['Message']}"
            }]
        }
    except Exception as e:
        return {
            "status": "error",
            "content": [{
                "text": f"Error saving draft to S3: {str(e)}"
            }]
        }


@tool
async def list_user_sessions(user_id: str, limit: int = 10) -> Dict:
    """
    List all story sessions for a user.
    
    Enables users to see their previous story projects and resume them.
    
    Args:
        user_id: User identifier
        limit: Maximum number of sessions to return (default 10)
    
    Returns:
        List of session summaries with metadata
    """
    
    table_name = os.getenv('SESSION_TABLE_NAME', 'story-creator-sessions')
    
    try:
        dynamodb = get_dynamodb_client()
        table = dynamodb.Table(table_name)
        
        # Query by user_id (requires GSI on user_id)
        response = table.query(
            IndexName='user_id-index',
            KeyConditionExpression='user_id = :uid',
            ExpressionAttributeValues={':uid': user_id},
            Limit=limit,
            ScanIndexForward=False  # Most recent first
        )
        
        sessions = []
        for item in response.get('Items', []):
            session_data = json.loads(item['data'])
            sessions.append({
                'session_id': item['session_id'],
                'original_prompt': session_data.get('original_prompt', ''),
                'current_stage': session_data.get('current_stage', 'unknown'),
                'updated_at': item.get('updated_at', '')
            })
        
        return {
            "status": "success",
            "content": [{
                "json": {
                    "sessions": sessions,
                    "count": len(sessions)
                }
            }]
        }
        
    except ClientError as e:
        return {
            "status": "error",
            "content": [{
                "text": f"Failed to list sessions: {e.response['Error']['Message']}"
            }]
        }
    except Exception as e:
        return {
            "status": "error",
            "content": [{
                "text": f"Error listing sessions: {str(e)}"
            }]
        }

