import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ArrowLeft, BookOpen, Layers, Play, Trash2, Loader2 } from 'lucide-react';
import { fetchWithAuth } from '../lib/api';
import { BUILDER_API_BASE_URL } from '../config';

const StoriesList = () => {
  const navigate = useNavigate();
  const [aiStories, setAiStories] = useState([]);
  const [manualStories, setManualStories] = useState([]);
  const [loadingAi, setLoadingAi] = useState(true);
  const [loadingManual, setLoadingManual] = useState(true);
  const [aiError, setAiError] = useState(null);
  const [manualError, setManualError] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('ai');
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    fetchAiStories();
    fetchManualStories();
  }, []);

  const fetchAiStories = async () => {
    try {
      setLoadingAi(true);
      const response = await fetchWithAuth('/api/v1/stories/list');
      const data = await response.json();
      setAiStories(data.stories || []);
      setAiError(null);
    } catch (err) {
      console.error('Failed to fetch AI stories:', err);
      setAiError(err.message);
    } finally {
      setLoadingAi(false);
    }
  };

  const fetchManualStories = async () => {
    try {
      setLoadingManual(true);
      const response = await fetch(`${BUILDER_API_BASE_URL}/api/sessions/list`);
      if (!response.ok) return;
      const data = await response.json();
      setManualStories(data.sessions || []);
      setManualError(null);
    } catch (err) {
      console.error('Failed to fetch manual stories:', err);
      setManualError(err.message);
    } finally {
      setLoadingManual(false);
    }
  };

  const stories = useMemo(() => {
    if (sourceFilter === 'ai') {
      return aiStories.length > 0 ? aiStories : manualStories;
    }
    return manualStories;
  }, [sourceFilter, aiStories, manualStories]);
  const activeError = sourceFilter === 'ai' && aiStories.length === 0 ? aiError : sourceFilter === 'manual' ? manualError : null;
  const isLoading = sourceFilter === 'ai' ? loadingAi : loadingManual;

  useEffect(() => {
    if (aiError && !manualError && manualStories.length > 0) {
      setSourceFilter('manual');
    }
  }, [aiError, manualError, manualStories.length]);

  const handleDelete = async (storyId, e) => {
    e.stopPropagation();

    setDeletingId(storyId);
    setDeleteError(null);

    try {
      if (sourceFilter === 'ai') {
        await fetchWithAuth(`/api/v1/stories/${storyId}`, {
          method: 'DELETE',
        });
        setAiStories((prev) => prev.filter((story) => (story.id || story.story_id || story.session_id) !== storyId));
      } else {
        await fetch(`${BUILDER_API_BASE_URL}/api/sessions/${storyId}`, {
          method: 'DELETE',
        });
        setManualStories((prev) => prev.filter((story) => (story.id || story.story_id || story.session_id) !== storyId));
      }

      console.info('🗑️ Story deleted', { storyId, source: sourceFilter });
    } catch (err) {
      console.error('Failed to delete story:', err);
      setDeleteError('Failed to delete story. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleViewStory = (storyId) => {
    if (sourceFilter === 'ai') {
      navigate(`/stories/${storyId}`);
    } else {
      navigate(`/manual/${storyId}/final`, { state: { sessionId: storyId } });
    }
  };

  if (isLoading && stories.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black dark:border-white"></div>
      </div>
    );
  }

  if (activeError) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="max-w-4xl mx-auto p-6">
          <div className="flex justify-between items-center mb-6">
            <Button variant="outline" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h2 className="text-2xl font-bold text-foreground">Your Stories</h2>
            <div className="w-24"></div>
          </div>
          <div className="p-8 text-center">
            <p className="text-red-600 dark:text-red-400 mb-4">Error: {activeError}</p>
            <Button onClick={sourceFilter === 'ai' ? fetchAiStories : fetchManualStories}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (stories.length === 0 && !activeError) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="max-w-4xl mx-auto p-6">
          <div className="flex justify-between items-center mb-6">
            <Button variant="outline" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h2 className="text-2xl font-bold text-foreground">Your Stories</h2>
            <div className="w-24"></div>
          </div>
          <div className="p-8 text-center">
            <div className="max-w-md mx-auto">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No stories yet</h3>
              <p className="text-muted-foreground mb-6">Generate your first story to get started!</p>
              <Button onClick={() => navigate('/')}>
                Go to Home
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <div className="flex justify-between items-center mb-6">
          <Button variant="outline" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h2 className="text-2xl font-bold text-foreground">Your Stories</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium">
              <Layers className="h-3 w-3" />
              <select
                className="bg-transparent focus:outline-none"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="ai">AI Generated</option>
                <option value="manual">Manual Builder</option>
              </select>
            </div>
            <Button onClick={sourceFilter === 'ai' ? fetchAiStories : fetchManualStories} variant="outline">
              Refresh
            </Button>
          </div>
        </div>

        {activeError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 flex items-center justify-between">
            <span>{activeError}</span>
            <Button size="sm" variant="ghost" onClick={sourceFilter === 'ai' ? fetchAiStories : fetchManualStories}>
              Retry
            </Button>
          </div>
        )}
        {deleteError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 flex items-center justify-between">
            <span>{deleteError}</span>
            <Button size="sm" variant="ghost" onClick={() => setDeleteError(null)}>
              Dismiss
            </Button>
          </div>
        )}

      <div className="space-y-4">
        <AnimatePresence>
          {stories.map((story) => {
            const storyId = story.id || story.story_id || story.session_id;
            if (!storyId) {
              console.warn('Story is missing an id field; skipping', story);
              return null;
            }

            const sourceMode = story.source_mode
              ?? (story.metadata ? story.metadata.source_mode : undefined)
              ?? (story.type === 'manual' || story.builder_version ? 'manual' : 'ai');
            const isManual = sourceMode === 'manual';
            const createdTime = story.created_at || story.updated_at || story.createdAt || story.updatedAt;

            return (
            <motion.div
              key={storyId}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
              layout
            >
            <Card
              className={`p-6 hover:shadow-lg transition-all cursor-pointer group ${deletingId === storyId ? 'opacity-60 pointer-events-none' : ''}`}
              onClick={() => handleViewStory(storyId)}
            >
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-black/10 dark:group-hover:bg-white/10 transition-colors">
                    <BookOpen className="w-6 h-6 text-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-foreground mb-2 truncate">
                      {story.title}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={isManual ? 'secondary' : 'default'} className="text-xs">
                        {isManual ? 'Manual' : 'AI'}
                      </Badge>
                      {story.genre && (
                        <Badge variant="secondary" className="text-xs">
                          {story.genre}
                        </Badge>
                      )}
                      {story.topic && (
                        <Badge variant="outline" className="text-xs">
                          {story.topic}
                        </Badge>
                      )}
                      {typeof story.chapters_count === 'number' && (
                        <Badge variant="outline" className="text-xs">
                          {story.chapters_count} chapter{story.chapters_count !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  Created: {createdTime ? new Date(createdTime).toLocaleDateString() : 'N/A'}{createdTime ? ` at ${new Date(createdTime).toLocaleTimeString()}` : ''}
                </p>
              </div>

              <div className="flex flex-col gap-2 flex-shrink-0">
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewStory(storyId);
                  }}
                  className="gap-2"
                  size="sm"
                >
                  <Play className="w-4 h-4" />
                  Read
                </Button>
                <Button
                  onClick={(e) => handleDelete(storyId, e)}
                  variant="outline"
                  size="sm"
                  disabled={deletingId === storyId}
                  className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950 gap-2"
                >
                  {deletingId === storyId ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
          </motion.div>
        );
        })}
        </AnimatePresence>
      </div>
      </div>
    </div>
  );
};

export default StoriesList;

