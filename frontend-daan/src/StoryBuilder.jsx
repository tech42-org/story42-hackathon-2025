import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Textarea } from './components/ui/textarea';
import { Input } from './components/ui/input';
import { Badge } from './components/ui/badge';
import { Label } from './components/ui/label';
import { ArrowLeft, Wand2, Loader2, CheckCircle2, Sparkles, BookOpen, Edit3, FileText, Activity, Flag, Play, Pause, AlertCircle, XCircle } from 'lucide-react';
import Breadcrumb from './components/Breadcrumb';
import { API_BASE_URL } from './config';
import audioService from './services/audioService';
import michaelApiService from './services/michaelApiService';
import storyStorageService from './services/storyStorageService';
import { useAuth } from './contexts/AuthContext';

const StoryBuilder = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { idToken } = useAuth();
  const storyData = location.state?.storyData;
  const storyConfig = location.state?.storyConfig;
  const sessionId = params.sessionId;
  
  const [story, setStory] = useState({
    title: storyData?.topic || 'Untitled Story',
    storyId: null,
    sections: [
      {
        id: 'beginning',
        title: 'Beginning',
        summary: 'Introduce the main character and setting. Establish the initial situation.',
        segments: [],
        speakers: ['Narrator'],
        icon: 'FileText',
        wordCount: 0
      },
      {
        id: 'middle',
        title: 'Middle',
        summary: 'Develop the conflict and challenges. Build tension and complications.',
        segments: [],
        speakers: ['Narrator'],
        icon: 'Activity',
        wordCount: 0
      },
      {
        id: 'end',
        title: 'End',
        summary: 'Resolve the conflict. Provide closure and conclusion to the story.',
        segments: [],
        speakers: ['Narrator'],
        icon: 'Flag',
        wordCount: 0
      }
    ]
  });

  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isGeneratingOutlines, setIsGeneratingOutlines] = useState(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [outlineError, setOutlineError] = useState(false);
  const [generationError, setGenerationError] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [playingSection, setPlayingSection] = useState(null);
  const [isRegeneratingImages, setIsRegeneratingImages] = useState(false);
  
  // Load session on mount
  useEffect(() => {
    const loadSession = async () => {
      if (!sessionId) {
        setSessionLoaded(true);
        return;
      }
      
      try {
        // First, try to load from local storage
        const cachedOutline = storyStorageService.loadOutline(sessionId);
        const cachedStory = storyStorageService.loadStory(sessionId);

        if (false) {
        // Try to load from backend session
        const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`);
        
          const session = await response.json();
          const data = session.data;
          
          // Restore story title
          if (data.title) {
            setStory(prev => ({ ...prev, title: data.title }));
          }
          
          // Restore outlines from backend or local storage
          const outlinesSource = data.outlines || cachedOutline?.outlines;
          if (outlinesSource) {
            setStory(prev => ({
              ...prev,
              sections: prev.sections.map(section => ({
                ...section,
                summary: outlinesSource[section.id]?.summary || section.summary,
                speakers: outlinesSource[section.id]?.speakers || section.speakers || ['Narrator']
              }))
            }));
          }

          // Restore complete story from backend or local storage
          const cachedStoryData = data.completeStory || cachedStory;
          if (cachedStoryData) {
            setStory(prev => ({
              ...prev,
              storyId: cachedStoryData.story_id || cachedStoryData.storyId,
              sections: prev.sections.map(section => {
                const cachedSection = cachedStoryData.sections?.find(s => s.id === section.id);
                if (cachedSection && cachedSection.segments && cachedSection.segments.length > 0) {
                  return {
                    ...section,
                    segments: cachedSection.segments,
                    wordCount: cachedSection.word_count || cachedSection.wordCount || 0
                  };
                }
                return section;
              })
            }));
            console.log('✅ Complete story restored from cache');
          }
          
          console.log('Session restored in StoryBuilder:', sessionId);
        } else {
          // Backend session not available, use local storage only
          if (cachedOutline?.outlines) {
            setStory(prev => ({
              ...prev,
              sections: prev.sections.map(section => ({
                ...section,
                summary: cachedOutline.outlines[section.id]?.summary || section.summary,
                speakers: cachedOutline.outlines[section.id]?.speakers || section.speakers || ['Narrator']
              }))
            }));
            console.log('✅ Outlines restored from local storage only');
          }

          if (cachedStory) {
            setStory(prev => ({
              ...prev,
              storyId: cachedStory.story_id || cachedStory.storyId,
              sections: prev.sections.map(section => {
                const cachedSection = cachedStory.sections?.find(s => s.id === section.id);
                if (cachedSection && cachedSection.segments && cachedSection.segments.length > 0) {
                  return {
                    ...section,
                    segments: cachedSection.segments,
                    wordCount: cachedSection.word_count || cachedSection.wordCount || 0
                  };
                }
                return section;
              })
            }));
            console.log('✅ Complete story restored from local storage only');
          }
        }
      } catch (error) {
        console.error('Failed to load session:', error);
        
        // Fallback to local storage on error
        const cachedOutline = storyStorageService.loadOutline(sessionId);
        const cachedStory = storyStorageService.loadStory(sessionId);

        if (cachedOutline?.outlines) {
          setStory(prev => ({
            ...prev,
            sections: prev.sections.map(section => ({
              ...section,
              summary: cachedOutline.outlines[section.id]?.summary || section.summary,
              speakers: cachedOutline.outlines[section.id]?.speakers || section.speakers || ['Narrator']
            }))
          }));
        }

        if (cachedStory) {
          setStory(prev => ({
            ...prev,
            storyId: cachedStory.story_id || cachedStory.storyId,
            sections: prev.sections.map(section => {
              const cachedSection = cachedStory.sections?.find(s => s.id === section.id);
              if (cachedSection && cachedSection.segments && cachedSection.segments.length > 0) {
                return {
                  ...section,
                  segments: cachedSection.segments,
                  wordCount: cachedSection.word_count || cachedSection.wordCount || 0
                };
              }
              return section;
            })
          }));
        }
      } finally {
        setSessionLoaded(true);
      }
    };
    
    loadSession();
  }, [sessionId]);
  
  // Generate AI outlines on mount (only if session doesn't have them)
  useEffect(() => {
    const generateOutlines = async () => {
      if (!storyData || !sessionLoaded || !idToken) return;

      // Check if complete story is already generated - skip outline generation
      if (sessionId) {
        const cachedStory = storyStorageService.loadStory(sessionId);
        if (cachedStory?.sections && cachedStory.sections.some(s => s.segments && s.segments.length > 0)) {
          console.log('✅ Complete story already exists - skipping outline generation');
          return;
        }

        try {
          const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`);
          if (response.ok) {
            const session = await response.json();
            if (session.data?.outlines) {
              console.log('Skipping outline generation - already in session');
              return;
            }
          }
        } catch {
          console.log('Session check failed, will generate outlines');
        }
      }

      // Check if local storage has outlines
      if (sessionId) {
        const cachedOutline = storyStorageService.loadOutline(sessionId);
        if (cachedOutline?.outlines) {
          console.log('✅ Using cached outlines from local storage');
          return;
        }
      }

      setIsGeneratingOutlines(true);
      try {
        // Generate a unique job ID
        const jobId = michaelApiService.generateJobId();

        // Call Michael's API to generate story outline
        const result = await michaelApiService.generateStoryOutline({
          topic: storyData.topic,
          genre: storyData.storyType, // 'fiction' or 'non-fiction'
          tone: storyData.tone,
          length: storyData.length,
          storyType: storyConfig?.storyType || 'visual',
          numberOfSpeakers: storyConfig?.numberOfSpeakers || 2,
          panels: storyConfig?.numberOfPanels || 6,
          audioLength: storyConfig?.audioLength,
          jobId
        }, idToken);

        // Update sections with generated outlines
        setStory(prev => ({
          ...prev,
          sections: prev.sections.map(section => ({
            ...section,
            summary: result.outlines[section.id]?.summary || section.summary,
            speakers: result.outlines[section.id]?.speakers || ['Narrator']
          }))
        }));

        setOutlineError(false);
        console.log('AI-generated outlines loaded from Michael API');

        // Save outlines to local storage
        if (sessionId) {
          storyStorageService.saveOutline(sessionId, {
            outlines: result.outlines,
            title: story.title,
            jobId
          });
        }
      } catch (error) {
        console.error('Failed to generate outlines:', error);
        setOutlineError(true);
      } finally {
        setIsGeneratingOutlines(false);
      }
    };

    generateOutlines();
  }, [sessionLoaded, idToken]);

  // Auto-save to local storage when story changes (debounced)
  useEffect(() => {
    if (!sessionId || !sessionLoaded) return;
    
    const saveToLocalStorage = () => {
      try {
        const outlines = {};
        story.sections.forEach(section => {
          outlines[section.id] = {
            summary: section.summary,
            speakers: section.speakers || ['Narrator']
          };
        });

        storyStorageService.saveOutline(sessionId, {
          outlines,
          title: story.title
        });

        console.log('📝 Outlines auto-saved to local storage');
      } catch (error) {
        console.error('Failed to auto-save to local storage:', error);
      }
    };
    
    // Debounce the save
    const timeoutId = setTimeout(saveToLocalStorage, 1000);
    return () => clearTimeout(timeoutId);
  }, [story.title, story.sections, sessionId, sessionLoaded]);

  const updateSectionSummary = (sectionId, newSummary) => {
    setStory(prevStory => ({
      ...prevStory,
      sections: prevStory.sections.map(section =>
        section.id === sectionId ? { ...section, summary: newSummary } : section
      )
    }));
  };

  const generateAllSections = async () => {
    if (!idToken) {
      alert('You must be logged in to generate stories');
      return;
    }

    setIsGeneratingAll(true);

    try {
      // Generate a unique job ID
      const jobId = michaelApiService.generateJobId();

      // Prepare outlines for API call
      const outlines = {};
      story.sections.forEach(section => {
        outlines[section.id] = {
          summary: section.summary,
          speakers: section.speakers || ['Narrator']
        };
      });

      // Call Michael's API to generate complete story
      const generatedStory = await michaelApiService.generateCompleteStory({
        title: story.title,
        storyParams: {
          topic: storyData?.topic,
          genre: storyData?.storyType, // 'fiction' or 'non-fiction'
          tone: storyData?.tone,
          length: storyData?.length,
          storyType: storyConfig?.storyType || 'visual',
          numberOfSpeakers: storyConfig?.numberOfSpeakers || 2,
          panels: storyConfig?.numberOfPanels || 6,
          audioLength: storyConfig?.audioLength
        },
        outlines,
        jobId
      }, idToken);

      // Update all sections with generated content
      console.log('Generated story sections:', generatedStory.sections);
      console.log('Current story sections:', story.sections);

      const updatedStory = {
        storyId: generatedStory.story_id,
        sections: story.sections.map(section => {
          const generated = generatedStory.sections.find(s => s.id === section.id);
          console.log('Matching section', section.id, 'found:', generated ? 'yes' : 'no');
          if (generated) {
            console.log('  - segments:', generated.segments?.length || 0);
            console.log('  - word_count:', generated.word_count);
          }
          return {
            ...section,
            segments: generated?.segments || section.segments || [],
            wordCount: generated?.word_count || 0
          };
        })
      };

      setStory(prev => ({
        ...prev,
        ...updatedStory
      }));

      console.log(`Story generated and saved! ID: ${generatedStory.story_id}`);
      
      // Generate story images
      console.log('\n📋 STEP 2: Generate Story Images');
      setIsGeneratingImages(true);
      
      try {
        const imageJobId = `${jobId}-images`;
        
        // Prepare complete_story_parts in the exact format from the API response
        // This version ensures that section_num increments continuously across all sections
        let cumulativeSectionNum = 1;
        const completeStoryParts = generatedStory.sections.map(section => {
          const currentSectionNum = cumulativeSectionNum++;
          return {
            story_part: section.id,
            sections: [{
              section_num: currentSectionNum,
              segments: section.segments.map((seg, idx) => ({
                segment_num: idx + 1,
                segment_content: seg.content,
                speaker: seg.speaker
              }))
            }]
          };
        });

        console.log('📤 Generating images for story...');
        console.log(`📊 Prepared ${completeStoryParts.length} story parts for image generation`);
        console.log('Complete story parts:', JSON.stringify(completeStoryParts, null, 2));
        console.log(`⏳ Note: Image generation may take 30-60 seconds per image...`);

        const imageResult = await michaelApiService.generateStoryImages({
          completeStoryParts,
          artStyle: 'whimsical watercolor illustration',
          numberOfPanels: storyConfig?.numberOfPanels || 6,
          jobId: imageJobId
        }, idToken);

        const segments = imageResult.result?.story_segments || imageResult.segments || [];
        console.log(`🖼️  Generated ${segments.length} images`);

        // Match images to sections by segment number
        const sectionsWithImages = updatedStory.sections.map((section, idx) => {
          const imageSegment = segments.find(
            seg => seg.story_segment_number === idx + 1
          );
          // Use presigned URL directly, or fall back to S3 URL conversion
          const imageUrl = imageSegment?.image_presigned_url || imageSegment?.image_s3_url;
          
          console.log(`  Section ${idx + 1} image:`, { 
            segment_number: imageSegment?.story_segment_number,
            imageUrl 
          });
          
          return {
            ...section,
            imageUrl
          };
        });

        // Update story with images
        setStory(prev => ({
          ...prev,
          sections: sectionsWithImages
        }));

        // Save story with images to local storage
        if (sessionId) {
          storyStorageService.saveStory(sessionId, {
            story_id: generatedStory.story_id,
            title: story.title,
            sections: sectionsWithImages,
            metadata: generatedStory.metadata
          });
        }

        setImageError(false);
        console.log('✅ Story images generated and saved!');
      } catch (imageErr) {
        console.error('❌ Failed to generate images:', imageErr);
        setImageError(true);
        // Don't fail the whole process, just log and continue without images
        console.warn('⚠️  Continuing without images');
        
        // Save story without images to local storage
        if (sessionId) {
          storyStorageService.saveStory(sessionId, {
            story_id: generatedStory.story_id,
            title: story.title,
            sections: updatedStory.sections,
            metadata: generatedStory.metadata
          });
        }
      } finally {
        setIsGeneratingImages(false);
      }

      setGenerationError(false);
    } catch (error) {
      console.error('Failed to generate story:', error);
      setGenerationError(true);
      alert(`Failed to generate story: ${error.message}`);
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const isAllGenerated = story.sections.every(s => s.segments && s.segments.length > 0);

  const regenerateImages = async () => {
    if (!idToken) {
      alert('You must be logged in to generate images');
      return;
    }

    if (!isAllGenerated) {
      alert('Please generate the complete story first before generating images');
      return;
    }

    setIsRegeneratingImages(true);
    setImageError(false);

    try {
      const jobId = `${story.storyId || Date.now()}-images-regen`;
      
      // Prepare complete_story_parts from current story
      let cumulativeSectionNum = 1;
      const completeStoryParts = story.sections.map(section => {
        const currentSectionNum = cumulativeSectionNum++;
        return {
          story_part: section.id,
          sections: [{
            section_num: currentSectionNum,
            segments: section.segments.map((seg, idx) => ({
              segment_num: idx + 1,
              segment_content: seg.content,
              speaker: seg.speaker
            }))
          }]
        };
      });

      console.log('🖼️  Regenerating images...');
      
      const imageResult = await michaelApiService.generateStoryImages({
        completeStoryParts,
        artStyle: 'whimsical watercolor illustration',
        numberOfPanels: storyConfig?.numberOfPanels || 6,
        jobId
      }, idToken);

      const segments = imageResult.result?.story_segments || imageResult.segments || [];
      console.log(`✅ Regenerated ${segments.length} images`);

      // Match images to sections
      const sectionsWithImages = story.sections.map((section, idx) => {
        const imageSegment = segments.find(
          seg => seg.story_segment_number === idx + 1
        );
        // Use presigned URL directly, or fall back to S3 URL
        const imageUrl = imageSegment?.image_presigned_url || imageSegment?.image_s3_url;
        
        console.log(`  Section ${idx + 1} image:`, { 
          segment_number: imageSegment?.story_segment_number,
          imageUrl 
        });
        
        return {
          ...section,
          imageUrl
        };
      });

      // Update story with images
      setStory(prev => ({
        ...prev,
        sections: sectionsWithImages
      }));

      // Save to local storage
      if (sessionId) {
        storyStorageService.saveStory(sessionId, {
          story_id: story.storyId,
          title: story.title,
          sections: sectionsWithImages
        });
      }

      console.log('✅ Images regenerated successfully!');
    } catch (error) {
      console.error('❌ Failed to regenerate images:', error);
      setImageError(true);
      alert(`Failed to regenerate images: ${error.message}`);
    } finally {
      setIsRegeneratingImages(false);
    }
  };

  const handleContinueToVoiceAssignment = () => {
    navigate(`/manual/${sessionId}/assign-voices`, {
      state: {
        storyData,
        storyConfig,
        generatedStory: story
      }
    });
  };

  const handlePlayPreview = async (sectionId) => {
    if (playingSection === sectionId) {
      // Stop current playback
      audioService.stop();
      setPlayingSection(null);
    } else {
      // Get the section content
      const section = story.sections.find(s => s.id === sectionId);
      if (!section || !section.segments || section.segments.length === 0) {
        alert('No content available for this section. Please generate it first.');
        return;
      }

      // Combine segments into text for audio preview
      const content = section.segments
        .map(seg => `${seg.speaker}: ${seg.content}`)
        .join('\n\n');

      setPlayingSection(sectionId);
      console.log(`🎵 Playing preview for section: ${section.title}`);

      try {
        await audioService.streamVoicePreview(
          content,
          'default',
          () => {
            console.log('✅ Section preview complete');
            setPlayingSection(null);
          },
          (error) => {
            console.error('❌ Section preview error:', error);
            alert(`Audio preview error: ${error.message}`);
            setPlayingSection(null);
          }
        );
      } catch (error) {
        console.error('❌ Failed to play preview:', error);
        alert(`Failed to play preview: ${error.message}`);
        setPlayingSection(null);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6">
      {/* Full-screen Loading Overlay */}
      {isGeneratingOutlines && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="w-full max-w-md mx-4 border-2 border-purple-500 shadow-2xl">
            <CardContent className="p-8 text-center">
              <div className="mb-6">
                <div className="relative w-24 h-24 mx-auto mb-4">
                  <Loader2 className="w-24 h-24 text-purple-600 dark:text-purple-400 animate-spin" />
                  <Sparkles className="w-8 h-8 text-purple-600 dark:text-purple-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">AI is Creating Your Story Outlines</h2>
                <p className="text-muted-foreground">
                  Analyzing your story parameters and generating intelligent section summaries...
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                  <span>Analyzing topic and genre</span>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-purple-600 animate-pulse delay-75" />
                  <span>Creating story structure</span>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-purple-600 animate-pulse delay-150" />
                  <span>Generating outlines</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Full-screen Generation Overlay - Only show when generating story text, not images */}
      {isGeneratingAll && !isGeneratingImages && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="w-full max-w-md mx-4 border-2 border-green-500 shadow-2xl">
            <CardContent className="p-8 text-center">
              <div className="mb-6">
                <div className="relative w-24 h-24 mx-auto mb-4">
                  <Loader2 className="w-24 h-24 text-green-600 dark:text-green-400 animate-spin" />
                  <BookOpen className="w-8 h-8 text-green-600 dark:text-green-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Generating Your Complete Story</h2>
                <p className="text-muted-foreground">
                  Writing all three sections with vivid, engaging prose...
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-green-600 animate-pulse" />
                  <span>Writing the Beginning...</span>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-green-600 animate-pulse delay-75" />
                  <span>Developing the Middle...</span>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-green-600 animate-pulse delay-150" />
                  <span>Crafting the End...</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-6">This may take 1-2 minutes</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Image Generation Banner - Less Intrusive */}
      {(isGeneratingImages || isRegeneratingImages) && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-blue-600 dark:bg-blue-500 shadow-lg">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
                <div>
                  <p className="text-white font-semibold">
                    {isRegeneratingImages ? 'Regenerating Story Images' : 'Generating Story Images'}
                  </p>
                  <p className="text-white/80 text-sm">
                    Creating beautiful illustrations... This may take 30-60 seconds per image
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                <Sparkles className="w-3 h-3 mr-1" />
                In Progress
              </Badge>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb at top */}
      <div className={`pt-6 ${(isGeneratingImages || isRegeneratingImages) ? 'mt-20' : ''}`}>
        <Breadcrumb
          steps={[
            { id: 'describe', label: 'Describe Story' },
            { id: 'voice', label: 'Story Configuration' },
            { id: 'generate', label: 'Review & Generate' },
            { id: 'assign', label: 'Assign Voices' }
          ]}
          currentStep={2}
        />
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <Button variant="outline" onClick={() => navigate(`/manual/${sessionId}/voice`, {
              state: { storyData, storyConfig }
            })}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-xs font-mono px-3 py-1">
                Session: {sessionId}
              </Badge>
              {story.storyId && (
                <Button
                  variant="outline"
                  onClick={() => navigate(`/stories/${story.storyId}`)}
                >
                  <BookOpen className="w-4 h-4 mr-2" />
                  View in Library
                </Button>
              )}
            </div>
          </div>
          
          {/* Workflow Instructions */}
          {!isAllGenerated && !isGeneratingAll && !isGeneratingOutlines && (
            <Card className="mb-6 border-2 border-black/20 dark:border-white/20 bg-black/5 dark:bg-white/5">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-black dark:bg-white flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-6 h-6 text-white dark:text-black" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-foreground mb-2">How to Build Your Story</h3>
                    <ol className="space-y-2 text-sm text-foreground/80">
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-black dark:text-white min-w-[20px]">1.</span>
                        <span>Review the AI-generated outlines below for each section (Beginning, Middle, End)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-black dark:text-white min-w-[20px]">2.</span>
                        <span>Edit the outlines to match your vision - be as creative as you want!</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-black dark:text-white min-w-[20px]">3.</span>
                        <span>Click "Generate Complete Story" to create full prose for all sections at once</span>
                      </li>
                    </ol>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Outline Generation Error */}
          {outlineError && !isGeneratingOutlines && (
            <Card className="mb-6 border-2 border-black/20 dark:border-white/20 bg-black/5 dark:bg-white/5">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-black dark:bg-white flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-6 h-6 text-white dark:text-black" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-foreground mb-2">Could Not Generate AI Outlines</h3>
                    <p className="text-sm text-foreground/80 mb-3">
                      The system couldn't create AI-generated outlines. Don't worry - you can still create your story manually!
                    </p>
                    <p className="text-sm text-foreground/70">
                      Edit the default outlines below and click "Generate Complete Story" when ready.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Generation Error */}
          {generationError && !isGeneratingAll && (
            <Card className="mb-6 border-2 border-black/20 dark:border-white/20 bg-black/5 dark:bg-white/5">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-black dark:bg-white flex items-center justify-center flex-shrink-0">
                    <XCircle className="w-6 h-6 text-white dark:text-black" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-foreground mb-2">Story Generation Failed</h3>
                    <p className="text-sm text-foreground/80 mb-3">
                      Something went wrong while generating your story. Please try again.
                    </p>
                    <Button 
                      onClick={() => { setGenerationError(false); generateAllSections(); }}
                      size="sm"
                      variant="outline"
                    >
                      Try Again
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          <Card>
            <CardContent className="p-6">
              <Label htmlFor="story-title" className="text-sm font-medium">Story Title</Label>
              <Input
                id="story-title"
                value={story.title}
                onChange={(e) => setStory({ ...story, title: e.target.value })}
                className="text-3xl font-bold border-none shadow-none focus-visible:ring-0 p-0 h-auto mt-2"
                placeholder="Enter your story title..."
                disabled={isGeneratingAll}
              />
            </CardContent>
          </Card>
        </div>

        {/* Story Parameters Info */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Story Parameters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {storyData?.genre && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Genre</label>
                  <p className="text-sm mt-1 text-foreground font-medium">{storyData.genre}</p>
                </div>
              )}
              {storyData?.tone && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tone</label>
                  <p className="text-sm mt-1 text-foreground font-medium">{storyData.tone}</p>
                </div>
              )}
              {storyData?.setting && (
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Setting</label>
                  <p className="text-sm mt-1 text-foreground font-medium">{storyData.setting}</p>
                </div>
              )}
              {storyData?.protagonist && (
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Protagonist</label>
                  <p className="text-sm mt-1 text-foreground font-medium">{storyData.protagonist}</p>
                </div>
              )}
              {storyData?.conflict && (
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Conflict</label>
                  <p className="text-sm mt-1 text-foreground font-medium">{storyData.conflict}</p>
                </div>
              )}
              {storyConfig?.numberOfSpeakers && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Speakers</label>
                  <p className="text-sm mt-1 text-foreground font-medium">{storyConfig.numberOfSpeakers}</p>
                </div>
              )}
              {storyConfig?.numberOfPanels && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Panels</label>
                  <p className="text-sm mt-1 text-foreground font-medium">{storyConfig.numberOfPanels}</p>
                </div>
              )}
              {storyConfig?.audioLength && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Audio Length</label>
                  <p className="text-sm mt-1 text-foreground font-medium">{storyConfig.audioLength} min</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Generate All Button */}
        <div className="mb-6 space-y-3">
          {!isAllGenerated ? (
            <>
              <Button 
                onClick={generateAllSections} 
                disabled={isGeneratingAll || isGeneratingOutlines}
                size="lg"
                className="w-full h-16 text-lg font-semibold"
              >
                Generate Complete Story (All Sections)
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                This will generate full prose for all three sections based on your outlines
              </p>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Button 
                  onClick={() => {
                    if (confirm('Are you sure you want to regenerate the entire story? This will replace the current content.')) {
                      generateAllSections();
                    }
                  }}
                  disabled={isGeneratingAll || isGeneratingImages || isGeneratingOutlines || isRegeneratingImages}
                  size="lg"
                  variant="outline"
                  className="h-14 text-base font-semibold"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Regenerate Story
                </Button>
                <Button 
                  onClick={regenerateImages}
                  disabled={isGeneratingAll || isGeneratingImages || isGeneratingOutlines || isRegeneratingImages}
                  size="lg"
                  variant="outline"
                  className="h-14 text-base font-semibold"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Regenerate Images
                </Button>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Generate new content or images without losing your story structure
              </p>
            </>
          )}
        </div>

        {/* Sections List */}
        <div className="space-y-4">
          {story.sections.map((section) => {
            const IconComponent = section.icon === 'FileText' ? FileText : section.icon === 'Activity' ? Activity : Flag;

            return (
              <Card key={section.id} className={`transition-all ${section.segments && section.segments.length > 0 ? 'border-green-200 dark:border-green-800' : ''}`}>
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        section.segments && section.segments.length > 0
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}>
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg mb-1">{section.title}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {section.id === 'beginning' && 'Set the scene, introduce characters, and establish the initial situation'}
                          {section.id === 'middle' && 'Develop the conflict, build tension, and create complications'}
                          {section.id === 'end' && 'Resolve the conflict and provide closure to the story'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {section.segments && section.segments.length > 0 && section.wordCount > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {section.wordCount} words
                        </Badge>
                      )}
                      {section.segments && section.segments.length > 0 && (
                        <Badge variant="secondary" className="gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                          <CheckCircle2 className="w-3 h-3" />
                          Complete
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Outline Editor */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`summary-${section.id}`} className="text-sm font-medium">
                        Outline
                      </Label>
                      <Badge variant="outline" className="text-xs">
                        AI-generated, editable
                      </Badge>
                    </div>
                    <Textarea
                      id={`summary-${section.id}`}
                      value={section.summary}
                      onChange={(e) => updateSectionSummary(section.id, e.target.value)}
                      placeholder={`What happens in the ${section.title.toLowerCase()}?`}
                      rows={5}
                      className="resize-none text-sm"
                      disabled={isGeneratingAll}
                    />
                  </div>

                  {/* Generated Content */}
                  {section.segments && section.segments.length > 0 && (
                    <div className="space-y-4">
                      {/* Horizontal Layout: Image on Left, Story on Right */}
                      <div className="flex flex-col lg:flex-row gap-4">
                        {/* Panel/Image Display or Skeleton */}
                        {(section.imageUrl || isGeneratingImages || isRegeneratingImages) && (
                          <div className="lg:w-80 flex-shrink-0">
                            {section.imageUrl ? (
                              <div className="relative rounded-lg overflow-hidden border-2 border-slate-200 dark:border-slate-700 shadow-lg aspect-square">
                                <img 
                                  src={section.imageUrl} 
                                  alt={`${section.title} panel`}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    console.error('Image failed to load:', section.imageUrl);
                                    e.target.style.display = 'none';
                                  }}
                                />
                              </div>
                            ) : (
                              /* Skeleton Loader */
                              <div className="relative rounded-lg overflow-hidden border-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 animate-pulse aspect-square">
                                <div className="w-full h-full flex items-center justify-center">
                                  <div className="text-center space-y-3">
                                    <Loader2 className="w-12 h-12 mx-auto text-slate-400 dark:text-slate-600 animate-spin" />
                                    <div className="space-y-2 px-4">
                                      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mx-auto"></div>
                                      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mx-auto"></div>
                                    </div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                      Generating...
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Story Content */}
                        <div className="flex-1 space-y-2">
                          <div className="space-y-3">
                            {section.segments.map((segment, segIdx) => (
                              <div key={segIdx} className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
                                <div className="flex items-start gap-3">
                                  <Badge variant="outline" className="mt-0.5 shrink-0">
                                    {segment.speaker}
                                  </Badge>
                                  <div className="prose prose-sm max-w-none dark:prose-invert flex-1">
                                    <p className="mb-0 text-foreground/90 leading-relaxed">
                                      {segment.content}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Success Summary */}
        {isAllGenerated && story.storyId && (
          <Card className="mt-8 border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-green-600 dark:bg-green-500 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-foreground mb-1">Story Generated Successfully!</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Your complete story has been generated and saved to your library.
                  </p>

                  <div className="flex items-center gap-4 mb-4 flex-wrap">
                    <div className="px-4 py-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                      <p className="text-2xl font-bold text-foreground">
                        {story.sections.reduce((sum, s) => sum + (s.wordCount || 0), 0)}
                      </p>
                      <p className="text-xs text-muted-foreground">Total Words</p>
                    </div>
                    {story.sections.map((section) => (
                      <div key={section.id} className="px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                        <p className="text-sm font-semibold text-foreground">{section.wordCount}</p>
                        <p className="text-xs text-muted-foreground">{section.title}</p>
                      </div>
                    ))}
                    <div className="px-4 py-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                      <p className="text-2xl font-bold text-foreground">
                        {story.sections.filter(s => s.imageUrl).length}
                      </p>
                      <p className="text-xs text-muted-foreground">Images</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => navigate(`/stories/${story.storyId}`)}
                        size="default"
                      >
                        <BookOpen className="w-4 h-4 mr-2" />
                        View in Library
                      </Button>
                      <Button onClick={handleContinueToVoiceAssignment} size="default">
                        Assign Voices
                        <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default StoryBuilder;
