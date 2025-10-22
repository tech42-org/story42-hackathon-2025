import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { Label } from './components/ui/label';
import { BookOpen, Sparkles, Newspaper, Rocket, Loader2, ArrowLeft } from 'lucide-react';
import Breadcrumb from './components/Breadcrumb';
import { API_BASE_URL } from './config';
import michaelApiService from './services/michaelApiService';
import { useAuth } from './contexts/AuthContext';

const StoryGenerator = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { idToken } = useAuth();

  // Get session ID from URL params or create new one
  const [sessionId] = useState(() => {
    if (params.sessionId) {
      return params.sessionId;
    }
    // Create new session ID
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    // Redirect to URL with session ID
    navigate(`/manual/${newSessionId}`, { replace: true });
    return newSessionId;
  });

  const [storyType, setStoryType] = useState('fiction');
  const [formData, setFormData] = useState({
    topic: '',
    subject: '',
    scope: '',
    structure: '',
    sources: '',
    targetAudience: '',
    tone: '',
    length: ''
  });

  const [isGenerating, setIsGenerating] = useState(false);

  // Load session on mount if returning from another page
  useEffect(() => {
    const loadSession = async () => {
      if (!location.state?.sessionId) return;
      
      try {
        if (false) {
        const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`);
          const session = await response.json();
          const data = session.data;
          
          // Restore form data
          if (data.storyData) {
            setFormData(prev => ({ ...prev, ...data.storyData }));
            setStoryType(data.storyData.storyType || 'fiction');
          }
          
          console.log('Session loaded:', sessionId);
        }
      } catch (error) {
        console.error('Failed to load session:', error);
      }
    };
    
    loadSession();
  }, [location.state, sessionId]);

  const generateFields = async (topic, type) => {
    if (!topic || topic.length < 3 || !idToken) return;

    setIsGenerating(true);

    try {
      console.log('Calling generateTopicIdeas with:', { genre: type, topics: topic });

      // Call Michael's API to generate topic ideas
      const result = await michaelApiService.generateTopicIdeas({
        genre: type,
        topics: topic
      }, idToken);

      // Both fiction and non-fiction use the same fields now
      setFormData(prev => ({
        ...prev,
        subject: result.subject_category || prev.subject,
        scope: result.scope_coverage || prev.scope,
        structure: result.structure || prev.structure,
        sources: result.source_types || prev.sources,
        targetAudience: result.target_audience || prev.targetAudience,
        tone: result.tone || prev.tone
      }));

      console.log('AI-generated fields from Michael API:', result);
    } catch (error) {
      console.error('Failed to generate fields:', error);
      // Silently fail - user can still fill in manually
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData.topic) {
        generateFields(formData.topic, storyType);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.topic, storyType]);

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleGenerate = async () => {
    try {
      // Save session to backend before navigating
      const response = await fetch(`${API_BASE_URL}/api/sessions/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          data: {
            storyData: { ...formData, storyType }
          }
        })
      });
      
      if (response.ok) {
        console.log('Session saved:', sessionId);
      }
    } catch (error) {
      console.error('Failed to save session:', error);
    }
    
    // Navigate with session ID in URL
    navigate(`/manual/${sessionId}/voice`, {
      state: { 
        storyData: { ...formData, storyType }
      }
    });
  };

  const isFormComplete = () => {
    // Both fiction and non-fiction use the same fields now
    return formData.topic && formData.subject && formData.scope &&
           formData.structure && formData.sources && formData.targetAudience &&
           formData.tone && formData.length;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Breadcrumb at top */}
      <div className="pt-6">
        <Breadcrumb
          steps={[
            { id: 'describe', label: 'Describe Story' },
            { id: 'voice', label: 'Story Configuration' },
            { id: 'generate', label: 'Review & Generate' },
            { id: 'assign', label: 'Assign Voices' }
          ]}
          currentStep={0}
        />
      </div>

      <div className="max-w-4xl mx-auto px-6 pb-6">
        <div className="mb-6">
          <Button variant="outline" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-black dark:bg-white flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-white dark:text-black" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Manual Story Builder</CardTitle>
                  <CardDescription>Define your story parameters and we'll help you build it</CardDescription>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                color={storyType === 'fiction' ? 'primary' : 'gray'}
                variant={storyType === 'fiction' ? 'solid' : 'outline'}
                onClick={() => setStoryType('fiction')}
                className="flex-1"
              >
                <BookOpen className="w-4 h-4 mr-2" />
                Fiction
              </Button>
              <Button
                color={storyType === 'non-fiction' ? 'primary' : 'gray'}
                variant={storyType === 'non-fiction' ? 'solid' : 'outline'}
                onClick={() => setStoryType('non-fiction')}
                className="flex-1"
              >
                <Newspaper className="w-4 h-4 mr-2" />
                Non-Fiction
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="topic">
                {storyType === 'fiction' ? 'Story Topic or Description' : 'Subject or Topic'}
              </Label>
              <Textarea
                id="topic"
                value={formData.topic}
                onChange={(e) => handleFieldChange('topic', e.target.value)}
                placeholder={
                  storyType === 'fiction'
                    ? "Describe your story idea... (e.g., 'A space adventure with robots' or 'A dragon quest')"
                    : "What do you want to write about? (e.g., 'The history of Serbia' or 'Climate change impacts')"
                }
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Start typing and AI will automatically suggest content for the fields below
              </p>
            </div>

            {isGenerating && (
              <div className="flex items-center justify-center gap-2 py-4">
                <Loader2 className="w-5 h-5 animate-spin text-purple-600 dark:text-purple-400" />
                <span className="text-sm text-muted-foreground">
                  AI is analyzing your topic and generating suggestions...
                </span>
              </div>
            )}

            {formData.topic && (
              <div className="space-y-4 pt-4 border-t">
                {storyType === 'fiction' ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject Category</Label>
                      <Input
                        id="subject"
                        value={formData.subject}
                        onChange={(e) => handleFieldChange('subject', e.target.value)}
                        placeholder="e.g., Fantasy Adventure, Sci-Fi Thriller"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="scope">Scope & Coverage</Label>
                      <Textarea
                        id="scope"
                        value={formData.scope}
                        onChange={(e) => handleFieldChange('scope', e.target.value)}
                        placeholder="What themes and elements will be explored?"
                        rows={2}
                        className="resize-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="structure">Structure</Label>
                      <Input
                        id="structure"
                        value={formData.structure}
                        onChange={(e) => handleFieldChange('structure', e.target.value)}
                        placeholder="e.g., Three-act structure, Hero's journey"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sources">Source Types</Label>
                      <Input
                        id="sources"
                        value={formData.sources}
                        onChange={(e) => handleFieldChange('sources', e.target.value)}
                        placeholder="e.g., Classic literature, mythology, folklore"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="targetAudience">Target Audience</Label>
                      <Input
                        id="targetAudience"
                        value={formData.targetAudience}
                        onChange={(e) => handleFieldChange('targetAudience', e.target.value)}
                        placeholder="Who is this for?"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tone">Tone</Label>
                      <Input
                        id="tone"
                        value={formData.tone}
                        onChange={(e) => handleFieldChange('tone', e.target.value)}
                        placeholder="e.g., Lighthearted, Dark, Epic"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="length">Story Length</Label>
                      <select
                        id="length"
                        value={formData.length}
                        onChange={(e) => handleFieldChange('length', e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="">Select length</option>
                        <option value="Short (1-3 pages)">Short (1-3 pages)</option>
                        <option value="Medium (5-10 pages)">Medium (5-10 pages)</option>
                        <option value="Long (15-25 pages)">Long (15-25 pages)</option>
                        <option value="Novel (50+ pages)">Novel (50+ pages)</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject Category</Label>
                      <Input
                        id="subject"
                        value={formData.subject}
                        onChange={(e) => handleFieldChange('subject', e.target.value)}
                        placeholder="e.g., Historical Deep Dive, Scientific Exploration"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="scope">Scope & Coverage</Label>
                      <Textarea
                        id="scope"
                        value={formData.scope}
                        onChange={(e) => handleFieldChange('scope', e.target.value)}
                        placeholder="What aspects will be covered?"
                        rows={2}
                        className="resize-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="structure">Structure</Label>
                      <Input
                        id="structure"
                        value={formData.structure}
                        onChange={(e) => handleFieldChange('structure', e.target.value)}
                        placeholder="How will the content be organized?"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sources">Source Types</Label>
                      <Input
                        id="sources"
                        value={formData.sources}
                        onChange={(e) => handleFieldChange('sources', e.target.value)}
                        placeholder="e.g., Academic journals, interviews, historical documents"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="targetAudience">Target Audience</Label>
                      <Input
                        id="targetAudience"
                        value={formData.targetAudience}
                        onChange={(e) => handleFieldChange('targetAudience', e.target.value)}
                        placeholder="Who is this for?"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tone">Tone</Label>
                      <Input
                        id="tone"
                        value={formData.tone}
                        onChange={(e) => handleFieldChange('tone', e.target.value)}
                        placeholder="e.g., Informative, Analytical"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="length">Length</Label>
                      <select
                        id="length"
                        value={formData.length}
                        onChange={(e) => handleFieldChange('length', e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="">Select length</option>
                        <option value="Short (1-3 pages)">Short (1-3 pages)</option>
                        <option value="Medium (5-10 pages)">Medium (5-10 pages)</option>
                        <option value="Long (15-25 pages)">Long (15-25 pages)</option>
                        <option value="Book (50+ pages)">Book (50+ pages)</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="pt-4 border-t">
              <Button
                onClick={handleGenerate}
                disabled={!isFormComplete()}
                className="w-full"
                size="lg"
              >
                Continue to Voice Selection
                <ArrowLeft className="w-5 h-5 ml-2 rotate-180" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StoryGenerator;
