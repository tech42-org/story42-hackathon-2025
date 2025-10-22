"""
Storage factory that switches between SQLite (local) and AWS (production).

This allows seamless transition from local development to production.
"""

import os


def get_storage_tools():
    """
    Get the appropriate storage tools based on configuration.
    
    Returns:
        Tuple of (save_session, load_session, list_sessions) functions
    """
    
    storage_mode = os.getenv('STORAGE_MODE', 'sqlite').lower()
    
    if storage_mode == 'sqlite':
        from src.tools.sqlite_storage import (
            save_story_session_sqlite,
            load_story_session_sqlite,
            list_user_sessions_sqlite
        )
        return (
            save_story_session_sqlite,
            load_story_session_sqlite,
            list_user_sessions_sqlite
        )
    else:  # aws mode
        from src.tools.state_management import (
            save_story_session,
            load_story_session,
            list_user_sessions
        )
        return (
            save_story_session,
            load_story_session,
            list_user_sessions
        )


# Convenience exports
save_session, load_session, list_sessions = get_storage_tools()

__all__ = ['save_session', 'load_session', 'list_sessions', 'get_storage_tools']

