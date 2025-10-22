import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Loader2,
  PlayCircle,
  PauseCircle,
  CheckCircle2,
  RefreshCw,
  BookOpen,
  Download,
  Sparkles,
  Activity,
  PenTool,
  Mic,
  Waves,
  ShieldCheck,
  TimerReset,
  Layers
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import Breadcrumb from './Breadcrumb';
import { streamStoryGeneration } from '../services/bedrockService';
import { useAuth } from '../contexts/AuthContext';
import StreamingAudioPlayer from './StreamingAudioPlayer';
import { fetchWithAuth } from '../lib/api';
import { API_BASE_URL, AGENT_API_BASE_URL } from '../config';

const defaultForm = {
  topic: '',
  story_type: 'fiction',
  length: 'medium',
  tone_style: 'engaging and descriptive',
  target_audience: '',
  creative_notes: ''
};

const agentMeta = {
  system_start: {
    label: 'System Initialization',
    icon: Sparkles,
    badgeClass: 'bg-purple-50 text-purple-600 border border-purple-200'
  },
  research: {
    label: 'Research Agent',
    icon: BookOpen,
    badgeClass: 'bg-blue-50 text-blue-600 border border-blue-200'
  },
  planning: {
    label: 'Planning Agent',
    icon: Activity,
    badgeClass: 'bg-emerald-50 text-emerald-600 border border-emerald-200'
  },
  writer: {
    label: 'Writer Agent',
    icon: PenTool,
    badgeClass: 'bg-orange-50 text-orange-600 border border-orange-200'
  },
  editor: {
    label: 'Editor Agent',
    icon: ShieldCheck,
    badgeClass: 'bg-rose-50 text-rose-600 border border-rose-200'
  },
  voice: {
    label: 'Voice Agent',
    icon: Mic,
    badgeClass: 'bg-indigo-50 text-indigo-600 border border-indigo-200'
  },
  audio: {
    label: 'Audio Agent',
    icon: Waves,
    badgeClass: 'bg-cyan-50 text-cyan-600 border border-cyan-200'
  },
  system_end: {
    label: 'System Finalization',
    icon: CheckCircle2,
    badgeClass: 'bg-emerald-50 text-emerald-600 border border-emerald-200'
  }
};

const AIPoweredFlow = () => {
  const navigate = useNavigate();
  const { getValidIdToken } = useAuth();
  const [form, setForm] = useState(defaultForm);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [agentLog, setAgentLog] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [storyResult, setStoryResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('input');
  const [showRecentStories, setShowRecentStories] = useState(false);
  const [storySourceFilter, setStorySourceFilter] = useState('ai');
  const [aiStories, setAiStories] = useState([]);
  const [manualStories, setManualStories] = useState([]);

  const orderedLog = useMemo(() => agentLog.slice().reverse(), [agentLog]);
  const filteredStories = useMemo(
    () => (storySourceFilter === 'ai' ? aiStories : manualStories),
    [storySourceFilter, aiStories, manualStories]
  );

  useEffect(() => {
    if (!isGenerating && storyResult) {
      setActiveTab('review');
    }
  }, [isGenerating, storyResult]);

  useEffect(() => {
    fetchAiStories();
    fetchManualStories();
  }, []);

  const fetchAiStories = async () => {
    try {
      const response = await fetchWithAuth('/api/v1/stories/list');
      const data = await response.json();
      setAiStories(data.stories || []);
    } catch (err) {
      console.error('Failed to fetch AI stories:', err);
    }
  };

  const fetchManualStories = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/manual/sessions/list`);
      if (!response.ok) return;
      const data = await response.json();
      setManualStories(data.sessions || []);
    } catch (err) {
      console.error('Failed to fetch manual stories:', err);
    }
  };

  const updateLog = (entry) => {
    setAgentLog((prev) => [...prev, { ...entry, id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}` }]);
  };

  const handleEvent = (event) => {
    switch (event.type) {
      case 'start':
        updateLog({ agent: 'system_start', message: event.message || 'Pipeline started' });
        break;
      case 'themed_activities':
        // Log themed activities (backend will use them for agent_activity events)
        console.log('🎨 Received themed activities:', event.activities);
        break;
      case 'agent_start':
        updateLog({ agent: event.agent_id, message: `${event.agent} started` });
        setProgress(event.progress ?? progress);
        break;
      case 'agent_activity':
        // Backend already sends themed activities in the 'activity' field
        // No need to look them up - just display what we receive
        updateLog({ agent: event.agent_id, message: event.activity });
        break;
      case 'agent_complete':
        updateLog({
          agent: event.agent_id,
          message: `${event.agent} completed in ${(event.execution_time_ms / 1000).toFixed(1)}s`
        });
        setProgress(event.progress ?? progress);
        break;
      case 'complete':
        console.log('✅ Received complete event:', event);
        updateLog({ agent: 'system_end', message: 'Story generation complete!' });
        setProgress(100);
        const completedSessionId = event.result?.session_id;
        console.log('📍 Session ID for navigation:', completedSessionId);
        setSessionId(completedSessionId);
        setStoryResult(event.result);
        setIsGenerating(false);

        // Navigate to the full story viewer immediately
        if (completedSessionId) {
          console.log(`🚀 Navigating to /stories/${completedSessionId} immediately...`);
          navigate(`/stories/${completedSessionId}`);
        } else {
          console.warn('⚠️ No session ID found, staying on review tab');
          setActiveTab('review');
        }
        break;
      case 'error':
        updateLog({ agent: 'system_end', message: `Error: ${event.error}` });
        setError(event.error || 'Generation failed');
        setIsGenerating(false);
        break;
      default:
        break;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsGenerating(true);
    setProgress(0);
    setAgentLog([]);
    setStoryResult(null);
    setError(null);
    setActiveTab('generate');

    try {
      const idToken = await getValidIdToken();
      await streamStoryGeneration({ ...form, idToken }, handleEvent);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to generate story.');
      setIsGenerating(false);
    }
  };

  const renderAgentLog = () => (
    <div className="max-h-[420px] overflow-hidden" data-testid="agent-activity-log">
      {agentLog.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground bg-muted/40 rounded-lg border border-dashed">
          Activity will appear here while your story is being generated.
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {orderedLog.map((entry) => {
              const meta = agentMeta[entry.agent] || {
                label: entry.agent,
                icon: RefreshCw,
                badgeClass: 'bg-muted text-muted-foreground border border-muted'
              };
              const Icon = meta.icon;

              return (
                <Motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -40 }}
                  transition={{ duration: 0.25 }}
                  className="rounded-xl border border-border/70 bg-background p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${meta.badgeClass}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{meta.label}</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{entry.message}</p>
                      </div>
                    </div>
                    {entry.execution_time && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/20 bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                        <TimerReset className="h-3 w-3" />
                        {(entry.execution_time / 1000).toFixed(2)}s
                      </span>
                    )}
                  </div>
                </Motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );

  const renderStoryResult = () => {
    if (!storyResult) return null;

    return (
      <Card className="shadow-xl border border-border/70 bg-background/95 backdrop-blur space-y-6">
        <CardHeader>
          <CardTitle className="text-2xl">{form.topic || 'Generated Story'}</CardTitle>
          <div className="flex gap-2 mt-2">
            <Badge variant="secondary">{form.story_type}</Badge>
            <Badge variant="secondary">{form.length}</Badge>
            {form.target_audience && <Badge variant="outline">{form.target_audience}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">Story Text</h3>
              <div className="max-h-96 overflow-y-auto prose dark:prose-invert bg-muted/20 p-4 rounded-lg">
                {storyResult.story?.split('\n').map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                )) || 'Story content is unavailable.'}
              </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Audiobook</h3>
            {sessionId ? (
              <StreamingAudioPlayer
                sessionId={sessionId}
                speakerOptions={storyResult?.speakerOptions || ['Narrator']}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No audio session found.</p>
            )}
          </div>

          {Array.isArray(storyResult.images) && storyResult.images.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Story Images</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {storyResult.images.map((image, idx) => (
                  <Card key={idx} className="overflow-hidden">
                    <img
                      src={image.url || image}
                      alt={image.caption || `Story panel ${idx + 1}`}
                      className="h-64 w-full object-cover"
                    />
                    {image.caption && (
                      <CardContent className="p-3 text-sm text-muted-foreground">
                        {image.caption}
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setSessionId(null);
                setStoryResult(null);
                setActiveTab('input');
              }}
            >
              Generate Another
            </Button>
            {sessionId && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const res = await fetchWithAuth(`/api/v1/stories/${sessionId}/download`);
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${sessionId}.txt`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error(err);
                    setError('Failed to download story assets.');
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" /> Download Assets
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const loadStoryFromSession = async (id) => {
    try {
      const response = await fetchWithAuth(`/api/v1/stories/${id}`);
      const data = await response.json();
      let images = [];
      if (Array.isArray(data?.images) && data.images.length > 0) {
        images = data.images.map((img, index) => (
          typeof img === 'string'
            ? { url: img, caption: `Scene ${index + 1}` }
            : {
                url: img.image_presigned_url || img.url,
                caption: img.caption || img.story_segment_content || `Scene ${index + 1}`
              }
        ));
      } else if (Array.isArray(data?.story_segments)) {
        images = data.story_segments
          .filter((seg) => seg.image_presigned_url)
          .map((seg) => ({
            url: seg.image_presigned_url,
            caption: seg.story_segment_content || `Scene ${seg.story_segment_number}`
          }));
      }

      setStoryResult(data);
      setSessionId(data?.session_id || data?.story_id || id);
      setStoryResult({ ...data, images });
      setActiveTab('review');
      setShowRecentStories(false);
    } catch (err) {
      console.error('Failed to load story', err);
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        <Breadcrumb
          steps={[
            { id: 'describe', label: 'Describe Story' },
              { id: 'generate', label: 'Generate & Listen' },
              { id: 'review', label: 'Review & Download' }
            ]}
            currentStep={activeTab === 'input' ? 0 : activeTab === 'generate' ? 1 : 2}
          />
          <Badge variant="outline" className="gap-1 px-3 py-1 text-xs uppercase tracking-wide">
            <span>Status:</span>
            <span className="font-semibold">{isGenerating ? 'Generating' : storyResult ? 'Completed' : 'Idle'}</span>
              </Badge>
        </div>
                </div>

      <div className="max-w-6xl mx-auto px-6 pb-16 pt-10 space-y-8">
        <Card className="shadow-xl">
          <CardHeader className="space-y-4 pb-4">
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-black flex-shrink-0">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <div className="flex flex-col gap-2">
                <CardTitle className="text-3xl">Automated Story Generation</CardTitle>
                <p className="text-muted-foreground max-w-2xl text-sm">
                  Craft a story in minutes with our coordinated team of AI agents. Every stage surfaces live updates so you can follow along as research, planning, writing, editing, voice, and audio agents collaborate.
                </p>
                </div>
              </div>
            </CardHeader>
          <CardContent className="space-y-8">
            {activeTab === 'input' && (
              <form className="grid gap-6" onSubmit={handleSubmit}>
                <div className="grid gap-2">
                  <Label htmlFor="topic">Story Topic *</Label>
                <Input
                  id="topic"
                    value={form.topic}
                    onChange={(e) => setForm({ ...form, topic: e.target.value })}
                    placeholder="e.g., A space adventure for kids"
                    required
                    disabled={isGenerating}
                />
              </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="story_type">Story Type</Label>
                  <select
                      id="story_type"
                      value={form.story_type}
                      onChange={(e) => setForm({ ...form, story_type: e.target.value })}
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      disabled={isGenerating}
                    >
                      <option value="fiction">Fiction</option>
                      <option value="educational">Educational</option>
                      <option value="childrens">Children's</option>
                      <option value="documentary">Documentary</option>
                  </select>
                </div>

                  <div className="grid gap-2">
                  <Label htmlFor="length">Length</Label>
                  <select
                    id="length"
                      value={form.length}
                      onChange={(e) => setForm({ ...form, length: e.target.value })}
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      disabled={isGenerating}
                    >
                      <option value="tiny">Tiny (~300 words)</option>
                      <option value="short">Short (~600 words)</option>
                      <option value="medium">Medium (~1,000 words)</option>
                      <option value="long">Long (~1,500 words)</option>
                  </select>
              </div>

                  <div className="grid gap-2">
                    <Label htmlFor="target_audience">Target Audience *</Label>
                <Input
                      id="target_audience"
                      value={form.target_audience}
                      onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
                      placeholder="e.g., Kids age 8-10"
                      required
                      disabled={isGenerating}
                    />
                  </div>
              </div>

                <div className="grid gap-2">
                  <Label htmlFor="tone_style">Tone & Style</Label>
                <Input
                    id="tone_style"
                    value={form.tone_style}
                    onChange={(e) => setForm({ ...form, tone_style: e.target.value })}
                    placeholder="e.g., Whimsical and uplifting"
                    disabled={isGenerating}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="creative_notes">Creative Notes (Optional)</Label>
                <textarea
                  id="creative_notes"
                  value={form.creative_notes}
                  onChange={(e) => setForm({ ...form, creative_notes: e.target.value })}
                  placeholder="You can write anything you want here for your agent to consider while creating your story (e.g., character names, specific plot points, themes, settings, etc.)"
                  disabled={isGenerating}
                  className="min-h-[100px] px-3 py-2 text-sm rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  💡 Tip: Mention characters, settings, plot twists, or any creative ideas you'd like included
                </p>
              </div>

                <div className="space-y-4">
                            <Button
                    type="submit" 
                    size="lg" 
                    disabled={isGenerating} 
                    className="gap-3 relative overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-2xl group"
                  >
                    {/* Magical gradient background animation */}
                    <span className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-gradient-x"></span>
                    <span className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity duration-700 animate-gradient-xy"></span>
                    
                    {/* Sparkle effect */}
                    <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <span className="absolute top-1/4 left-1/4 w-1 h-1 bg-white rounded-full animate-ping"></span>
                      <span className="absolute top-1/2 right-1/4 w-1 h-1 bg-yellow-300 rounded-full animate-ping animation-delay-150"></span>
                      <span className="absolute bottom-1/4 left-1/3 w-1 h-1 bg-pink-300 rounded-full animate-ping animation-delay-300"></span>
                    </span>
                    
                    {/* Button content */}
                    <span className="relative z-10 flex items-center gap-3">
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" /> Generating...
                                </>
                              ) : (
                                <>
                          <PlayCircle className="w-5 h-5 group-hover:animate-pulse" /> Generate Story & Audio
                                </>
                              )}
                    </span>
                  </Button>
                  <div className="h-2 w-full rounded-full bg-muted">
                    <Motion.div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500"
                      style={{ width: `${progress}%` }}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: progress / 100, originX: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              </form>
            )}

            {activeTab === 'generate' && (
              <div className="grid gap-6">
                <div className="rounded-xl border border-border/70 bg-background/80 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pipeline Progress</p>
                      <h3 className="text-2xl font-semibold text-foreground">{progress.toFixed(0)}% complete</h3>
                    </div>
                    <Badge variant="outline" className="gap-1">
                      <TimerReset className="h-3 w-3" />
                      {isGenerating ? 'Running' : 'Idle'}
                    </Badge>
                  </div>
                  <div className="mt-4 h-3 rounded-full bg-muted">
                    <Motion.div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                </div>
                {renderAgentLog()}
              </div>
            )}

            {activeTab === 'review' && renderStoryResult()}

            {error && (
              <Card className="shadow-xl border-red-200 dark:border-red-800">
                <CardHeader>
                  <CardTitle className="text-lg text-red-600 dark:text-red-400">Generation Failed</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}
              </CardContent>
            </Card>
      </div>

      <AnimatePresence>
        {showRecentStories && (
          <Motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            className="fixed right-0 top-0 h-full w-96 bg-background/95 backdrop-blur shadow-2xl z-50 overflow-y-auto border-l border-border"
          >
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Recent Stories</h2>
                  <p className="text-xs text-muted-foreground">Review stories generated by AI or crafted manually.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowRecentStories(false)}>×</Button>
                          </div>
                          
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium">
                  <Layers className="h-3 w-3" />
                  <select
                    value={storySourceFilter}
                    onChange={(e) => setStorySourceFilter(e.target.value)}
                    className="bg-transparent focus:outline-none"
                  >
                    <option value="ai">AI Generated</option>
                    <option value="manual">Manual Builder</option>
                  </select>
                </div>
                    <Button
                  variant="outline"
                  size="sm"
                  onClick={storySourceFilter === 'ai' ? fetchAiStories : fetchManualStories}
                  className="gap-2"
                >
                  <RefreshCw className="h-3 w-3" /> Refresh
                    </Button>
                  </div>

              {filteredStories.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                  No {storySourceFilter === 'ai' ? 'AI' : 'manual'} stories yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredStories.map((story) => {
                    const isAiStory = storySourceFilter === 'ai';
                    const storyId = isAiStory ? (story.story_id || story.session_id) : story.session_id;

                    return (
                      <button
                        key={storyId}
                        onClick={() => {
                          if (isAiStory) {
                            loadStoryFromSession(storyId);
                          } else {
                            navigate(`/manual/${story.session_id}/final`, {
                              state: { sessionId: story.session_id }
                            });
                            setShowRecentStories(false);
                          }
                        }}
                        className="w-full rounded-lg border border-border/60 bg-background/80 px-4 py-3 text-left transition hover:border-primary/50 hover:bg-background"
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground">{story.title || story.topic || story.session_name || 'Untitled Story'}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(story.created_at || story.updated_at || Date.now()).toLocaleString()}
                            </p>
                        </div>
                          <Badge variant="outline" className={isAiStory ? 'text-primary border-primary/50' : 'text-emerald-600 border-emerald-400/40'}>
                            {isAiStory ? 'AI Story' : 'Manual Builder'}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
                </div>
          </Motion.div>
        )}
      </AnimatePresence>

      {showRecentStories && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setShowRecentStories(false)} />
      )}
    </div>
  );
};

export default AIPoweredFlow;
