"""
SQLite storage adapter for local development and testing.

This provides a drop-in replacement for DynamoDB state management
using SQLite for quick local testing without AWS dependencies.
"""

import sqlite3
import json
import os
from typing import Dict, Optional
from datetime import datetime


# Database file path
DB_PATH = os.getenv('SQLITE_DB_PATH', './story_sessions.db')


def get_db_connection():
    """Get SQLite database connection and initialize schema if needed."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # Access columns by name
    
    # Initialize schema if not exists
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    
    # Create index on user_id for fast lookups
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_id ON sessions(user_id)
    """)
    
    conn.commit()
    return conn


def _serialize_datetime(obj):
    """JSON serializer for datetime objects."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


async def save_story_session_sqlite(
    session_id: str,
    session_data: dict
) -> Dict:
    """
    Persist story creation session to SQLite.
    
    Drop-in replacement for DynamoDB save_story_session.
    
    Args:
        session_id: Unique identifier for the session
        session_data: Complete session state dictionary
    
    Returns:
        Confirmation of successful save with timestamp
    """
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Add timestamps
        now = datetime.utcnow().isoformat()
        session_data['updated_at'] = now
        
        # Check if session exists
        cursor.execute(
            "SELECT session_id FROM sessions WHERE session_id = ?",
            (session_id,)
        )
        exists = cursor.fetchone() is not None
        
        # Serialize session data with datetime support
        serialized_data = json.dumps(session_data, default=_serialize_datetime)
        
        if exists:
            # Update existing session
            cursor.execute("""
                UPDATE sessions 
                SET data = ?, updated_at = ?
                WHERE session_id = ?
            """, (serialized_data, now, session_id))
        else:
            # Insert new session
            cursor.execute("""
                INSERT INTO sessions (session_id, user_id, data, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
            """, (
                session_id,
                session_data.get('user_id', 'unknown'),
                serialized_data,
                now,
                now
            ))
        
        conn.commit()
        conn.close()
        
        return {
            "session_id": session_id,
            "saved_at": now,
            "message": "Session saved to SQLite successfully"
        }
        
    except Exception as e:
        raise Exception(f"Error saving session to SQLite: {str(e)}")


async def load_story_session_sqlite(session_id: str) -> Dict:
    """
    Retrieve story creation session from SQLite.
    
    Drop-in replacement for DynamoDB load_story_session.
    
    Args:
        session_id: Unique identifier for the session to load
    
    Returns:
        Complete session data dictionary
    
    Raises:
        FileNotFoundError: If session not found
        Exception: For other errors
    """
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT data FROM sessions WHERE session_id = ?",
            (session_id,)
        )
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            session_data = json.loads(row['data'])
            return session_data
        else:
            raise FileNotFoundError(f"No session found with ID: {session_id}")
            
    except sqlite3.Error as e:
        raise Exception(f"Error loading session from SQLite: {str(e)}")


async def list_user_sessions_sqlite(user_id: str, limit: int = 10) -> Dict:
    """
    List all story sessions for a user from SQLite.
    
    Drop-in replacement for DynamoDB list_user_sessions.
    
    Args:
        user_id: User identifier
        limit: Maximum number of sessions to return
    
    Returns:
        List of session summaries with metadata
    """
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT session_id, data, updated_at
            FROM sessions
            WHERE user_id = ?
            ORDER BY updated_at DESC
            LIMIT ?
        """, (user_id, limit))
        
        rows = cursor.fetchall()
        conn.close()
        
        sessions = []
        for row in rows:
            session_data = json.loads(row['data'])
            sessions.append({
                'session_id': row['session_id'],
                'original_prompt': session_data.get('original_prompt', ''),
                'current_stage': session_data.get('current_stage', 'unknown'),
                'updated_at': row['updated_at']
            })
        
        return {
            "sessions": sessions,
            "count": len(sessions)
        }
        
    except Exception as e:
        raise Exception(f"Error listing sessions from SQLite: {str(e)}")


async def delete_session_sqlite(session_id: str) -> Dict:
    """Delete a session from SQLite."""
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "DELETE FROM sessions WHERE session_id = ?",
            (session_id,)
        )
        
        conn.commit()
        deleted = cursor.rowcount > 0
        conn.close()
        
        if deleted:
            return {
                "message": "Session deleted successfully",
                "session_id": session_id
            }
        else:
            raise FileNotFoundError(f"Session not found: {session_id}")
            
    except Exception as e:
        raise Exception(f"Error deleting session: {str(e)}")


# Export functions for easy import
__all__ = [
    'save_story_session_sqlite',
    'load_story_session_sqlite',
    'list_user_sessions_sqlite',
    'delete_session_sqlite',
]

