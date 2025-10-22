import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight, Play, Pause, RotateCcw, FolderPlus, Share2, BookOpen, X, ArrowLeft } from 'lucide-react';
import Breadcrumb from './Breadcrumb';
import audioService from '../services/audioService';
import storyStorageService from '../services/storyStorageService';
import { getApiKey } from '../lib/apiKeyUtils';

const FinalStory = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const sessionId = params.sessionId;
  
  const [loadedStory, setLoadedStory] = useState(null);
  const [loadedStoryData, setLoadedStoryData] = useState(null);
  
  // Transform story format from segments to generatedContent
  const transformStoryFormat = (story) => {
    if (!story || !story.sections) {
      console.warn('⚠️ Cannot transform null or invalid story');
      return null;
    }
    
    // Check if transformation is needed
    const needsTransformation = story.sections.some(s => s.segments && !s.generatedContent);
    
    if (!needsTransformation) {
      console.log('✅ Story already in correct format');
      return story;
    }
    
    console.log('🔄 Transforming story format from segments to generatedContent');
    console.log('📋 Sections before transformation:', story.sections.length);
    
    const transformedSections = story.sections
      .filter(section => section.segments && section.segments.length > 0)
      .map(section => {
        // Check if we have dialogue with multiple speakers
        const hasMultipleSpeakers = section.segments.some(
          seg => seg.speaker && seg.speaker !== 'Narrator'
        );
        
        // Format content with speaker names for dialogue
        const generatedContent = section.segments
          .filter(seg => seg.content && seg.content.trim())
          .map(seg => {
            if (hasMultipleSpeakers && seg.speaker && seg.speaker !== 'Narrator') {
              return `${seg.speaker}: ${seg.content}`;
            }
            return seg.content;
          })
          .join('\n\n');
        
        console.log(`  ✓ Section ${section.id}: ${generatedContent.length} chars, ${section.segments.length} segments`);
        
        return {
          id: section.id,
          title: section.title || (section.id.charAt(0).toUpperCase() + section.id.slice(1)),
          generatedContent: generatedContent,
          segments: section.segments, // Keep segments for audio generation
          wordCount: section.word_count || section.wordCount || 0,
          imageUrl: section.imageUrl || section.image_url // Preserve image URL from API
        };
      });
    
    console.log('📋 Sections after transformation:', transformedSections.length);
    
    return {
      storyId: story.storyId || story.story_id,
      title: story.title || 'Untitled Story',
      sections: transformedSections
    };
  };

  // Load story from location.state or local storage
  useEffect(() => {
    const loadStory = () => {
      // First, try location.state
      if (location.state?.generatedStory) {
        console.log('✅ Loading story from location.state', location.state.generatedStory);
        const transformedStory = transformStoryFormat(location.state.generatedStory);
        setLoadedStory(transformedStory);
        setLoadedStoryData(location.state.storyData);
        return;
      }
      
      // Fallback to local storage
      if (sessionId) {
        const cachedStory = storyStorageService.loadStory(sessionId);
        if (cachedStory) {
          console.log('✅ Loading story from local storage', cachedStory);
          
          // Check if we have valid sections data
          if (!cachedStory.sections || cachedStory.sections.length === 0) {
            console.warn('⚠️ Cached story has no sections');
            return;
          }
          
          // Transform cached story using the same function
          const transformedStory = transformStoryFormat({
            storyId: cachedStory.story_id || cachedStory.storyId,
            title: cachedStory.title || 'Untitled Story',
            sections: cachedStory.sections
          });
          
          console.log('✅ Transformed story:', transformedStory);
          setLoadedStory(transformedStory);
          setLoadedStoryData(null); // We don't have original storyData in cache
        } else {
          console.warn('⚠️ No story found in location.state or local storage');
        }
      }
    };
    
    loadStory();
  }, [sessionId, location.state]);
  
  const { audioSections, voiceAssignments } = location.state || {};
  const storyData = loadedStoryData;
  const generatedStory = loadedStory;

  const [currentPage, setCurrentPage] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReadingView, setIsReadingView] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState('next'); // 'next' or 'prev'
  const [showControls, setShowControls] = useState(true);
  const [currentAudio, setCurrentAudio] = useState(null);

  // Split story content into pages based on character count
  // Each page should have roughly 800-1200 characters to fit comfortably
  const pages = useMemo(() => {
    console.log('🔍 Generating pages from story:', generatedStory);
    
    if (!generatedStory?.sections) {
      console.warn('⚠️ No generatedStory.sections found');
      return [];
    }

    console.log('📚 Sections available:', generatedStory.sections.length);
    generatedStory.sections.forEach(section => {
      console.log(`  - Section ${section.id}:`, {
        hasGeneratedContent: !!section.generatedContent,
        contentLength: section.generatedContent?.length || 0,
        preview: section.generatedContent?.substring(0, 100)
      });
    });

    const allPages = [];
    const MIN_CHARS_PER_PAGE = 800;  // Minimum characters per page
    const MAX_CHARS_PER_PAGE = 1200; // Maximum characters per page

    generatedStory.sections.forEach((section) => {
      const paragraphs = section.generatedContent?.split('\n\n').filter(p => p.trim()) || [];
      console.log(`📄 Section ${section.id} has ${paragraphs.length} paragraphs`);
      
      // Use imageUrl from section if available, otherwise fallback to audioSections or placeholder
      const sectionImage = section.imageUrl ||
                          audioSections?.find(s => s.id === section.id)?.images?.[0]?.url ||
                          `https://picsum.photos/seed/${section.id}/800/600`;
      
      console.log(`🖼️  Section ${section.id} image:`, sectionImage);

      let pageNumber = 0;
      let i = 0;

      while (i < paragraphs.length) {
        const pageParagraphs = [];
        let currentCharCount = 0;

        // Add paragraphs until we reach the minimum character count
        // or until we would exceed the maximum
        while (i < paragraphs.length) {
          const paragraphLength = paragraphs[i].length;

          // Always add at least one paragraph per page
          if (pageParagraphs.length === 0) {
            pageParagraphs.push(paragraphs[i]);
            currentCharCount += paragraphLength;
            i++;
            continue;
          }

          // Check if adding this paragraph would exceed max characters
          if (currentCharCount + paragraphLength > MAX_CHARS_PER_PAGE) {
            // Only add if we haven't reached minimum yet
            if (currentCharCount < MIN_CHARS_PER_PAGE) {
              pageParagraphs.push(paragraphs[i]);
              currentCharCount += paragraphLength;
              i++;
            }
            break;
          }

          // Add paragraph and continue
          pageParagraphs.push(paragraphs[i]);
          currentCharCount += paragraphLength;
          i++;

          // If we've reached minimum chars, we can optionally stop here
          if (currentCharCount >= MIN_CHARS_PER_PAGE) {
            break;
          }
        }

        allPages.push({
          sectionId: section.id,
          sectionTitle: section.title,
          content: pageParagraphs,
          image: sectionImage,
          isFirstPageOfSection: pageNumber === 0,
          pageWithinSection: pageNumber + 1,
          charCount: currentCharCount
        });

        pageNumber++;
      }
    });

    return allPages;
  }, [generatedStory, audioSections]);

  const totalPages = pages.length;
  const currentPageData = pages[currentPage - 1];

  const handlePrevPage = () => {
    if (currentPage > 1 && !isFlipping) {
      setFlipDirection('prev');
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentPage(currentPage - 1);
        setIsPlaying(false);
        setTimeout(() => setIsFlipping(false), 300);
      }, 300);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages && !isFlipping) {
      setFlipDirection('next');
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentPage(currentPage + 1);
        setIsPlaying(false);
        setTimeout(() => setIsFlipping(false), 300);
      }, 300);
    }
  };

  const handlePlayPause = async () => {
    if (isPlaying) {
      // Stop playback (Web Audio API)
      if (currentAudio?.context) {
        try {
          await currentAudio.context.close();
          console.log('⏹️ Audio context closed');
        } catch (e) {
          console.error('Error closing audio context:', e);
        }
        setCurrentAudio(null);
      }
      setIsPlaying(false);
    } else {
      // Start playback - generate audio from story content
      if (!generatedStory?.sections || generatedStory.sections.length === 0) {
        alert('No story content available for audio generation');
        return;
      }

      if (!voiceAssignments || Object.keys(voiceAssignments).length === 0) {
        alert('No voice assignments found. Please assign voices first.');
        return;
      }

      setIsPlaying(true);
      console.log('🎵 Starting audio playback for story...');

      try {
        // Get all segments from the story
        const allSegments = generatedStory.sections.flatMap(section => 
          section.segments || []
        );

        if (allSegments.length === 0) {
          alert('Story has no segments to convert to audio');
          setIsPlaying(false);
          return;
        }

        // Get unique speakers in order of appearance
        const speakers = [...new Set(allSegments.map(seg => seg.speaker))];
        console.log('📢 Speakers in story:', speakers);
        console.log('🎤 Voice assignments:', voiceAssignments);

        // Map speakers to voice names
        const speakerVoices = speakers.map(speaker => {
          const voice = voiceAssignments[speaker];
          const voiceName = voice?.name || voice?.id || 'default';
          console.log(`  ${speaker} → ${voiceName}`);
          return voiceName;
        });

        // Format script with speaker labels (Speaker 1:, Speaker 2:, etc.)
        const script = allSegments
          .map(seg => {
            const speakerIndex = speakers.indexOf(seg.speaker) + 1;
            return `Speaker ${speakerIndex}: ${seg.content}`;
          })
          .join('\n\n');

        console.log('📝 Formatted script preview:', script.substring(0, 200) + '...');
        console.log('🎤 Speaker voices:', speakerVoices);

        // Call streaming TTS endpoint
        const TTS_BASE_URL = 'http://tech42-tts-gpu-alb-1201907864.us-east-1.elb.amazonaws.com:82';
        
        const requestBody = {
          script: script,
          speaker_voices: speakerVoices,
          cfg_scale: 1.3,
          session_id: sessionId || `story_${Date.now()}`
        };
        
        console.log('📡 Sending TTS request:', {
          url: `${TTS_BASE_URL}/generate/stream`,
          body: requestBody
        });
        
        const response = await fetch(`${TTS_BASE_URL}/generate/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getApiKey()}`,
          },
          body: JSON.stringify(requestBody)
        });

        console.log('📡 TTS Response status:', response.status);
        console.log('📡 TTS Response headers:', {
          contentType: response.headers.get('content-type'),
          contentLength: response.headers.get('content-length')
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ TTS API error response:', errorText);
          throw new Error(`TTS API failed: ${response.status} - ${errorText}`);
        }

        // Handle real-time streaming with Web Audio API
        console.log('🎵 Starting real-time audio streaming...');
        
        const reader = response.body.getReader();
        const pcmChunks = [];
        let totalBytes = 0;
        let audioContext = null;
        let nextStartTime = 0;
        
        try {
          // Initialize Web Audio API for real-time playback
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
          console.log('🎛️ Audio context created:', {
            sampleRate: audioContext.sampleRate,
            state: audioContext.state
          });
          
          // Store context for cleanup
          setCurrentAudio({ context: audioContext });
          
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            pcmChunks.push(value);
            totalBytes += value.length;
            
            console.log(`📦 Received PCM chunk: ${value.length} bytes (Total: ${totalBytes} bytes)`);
            
            // Play this PCM chunk immediately
            try {
              if (value.length >= 1024) { // Minimum chunk size for playback
                // Convert raw PCM bytes to Float32Array
                const pcm16 = new Int16Array(value.buffer);
                const pcmFloat = new Float32Array(pcm16.length);
                for (let i = 0; i < pcm16.length; i++) {
                  pcmFloat[i] = pcm16[i] / 32768.0;
                }
                
                // Create audio buffer from PCM data
                const sampleRate = 24000;
                const audioBuffer = audioContext.createBuffer(1, pcmFloat.length, sampleRate);
                audioBuffer.getChannelData(0).set(pcmFloat);
                
                // Create and schedule audio source
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContext.destination);
                
                const startTime = Math.max(audioContext.currentTime, nextStartTime);
                source.start(startTime);
                nextStartTime = startTime + audioBuffer.duration;
                
                console.log(`🔊 Playing PCM chunk: ${audioBuffer.duration.toFixed(3)}s`);
              }
            } catch (e) {
              console.log(`⚠️ Could not play PCM chunk: ${e.message}`);
            }
            
            // Small delay to prevent overwhelming
            await new Promise(resolve => setTimeout(resolve, 20));
          }
          
          console.log(`✅ Streaming complete! Total: ${totalBytes} bytes, ${pcmChunks.length} chunks`);
          console.log(`⏱️ Total scheduled audio duration: ${nextStartTime.toFixed(2)}s`);
          
          // Wait for all scheduled audio to finish playing
          const remainingTime = Math.max(0, nextStartTime - audioContext.currentTime);
          console.log(`⏳ Waiting ${remainingTime.toFixed(2)}s for audio to finish...`);
          
          setTimeout(() => {
            console.log('✅ Story audio complete');
            if (audioContext && audioContext.state !== 'closed') {
              audioContext.close();
            }
            setCurrentAudio(null);
            setIsPlaying(false);
          }, (remainingTime + 0.5) * 1000);
          
        } catch (streamError) {
          console.error('❌ Streaming error:', streamError);
          throw streamError;
        } finally {
          reader.releaseLock();
        }
      } catch (error) {
        console.error('❌ Failed to start audio:', error);
        alert(`Failed to start audio: ${error.message}`);
        setIsPlaying(false);
      }
    }
  };

  const handleReplay = async () => {
    // Stop current playback if any
    if (isPlaying && currentAudio?.context) {
      try {
        await currentAudio.context.close();
      } catch (e) {
        console.error('Error closing audio context:', e);
      }
      setCurrentAudio(null);
      setIsPlaying(false);
      // Wait a moment before restarting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Start from beginning
    if (!isPlaying) {
      handlePlayPause();
    }
  };

  const handleSaveToPlaylist = () => {
    alert('Saved to playlist!');
  };

  const handleShare = () => {
    alert('Share functionality coming soon!');
  };

  if (!generatedStory || !pages.length) {
    console.error('❌ Cannot display story:', {
      hasGeneratedStory: !!generatedStory,
      pagesLength: pages.length,
      generatedStory: generatedStory
    });
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center max-w-md">
          <p className="text-muted-foreground mb-4">
            {!generatedStory ? 'No story data available' : 'Story has no displayable content'}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            Session: {sessionId}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Check the browser console for more details
          </p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => navigate('/')}>Return Home</Button>
            <Button variant="outline" onClick={() => navigate(`/manual/${sessionId}/builder`)}>
              Back to Builder
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-slate-900"
      onMouseMove={() => isReadingView && setShowControls(true)}
    >
      {/* Breadcrumb at top */}
      {!isReadingView && (
        <div className="pt-6">
          <Breadcrumb
            steps={[
              { id: 'describe', label: 'Describe Story' },
              { id: 'voice', label: 'Select Voice' },
              { id: 'generate', label: 'Review & Generate' }
            ]}
            currentStep={2}
          />
        </div>
      )}

      <div className={`max-w-7xl mx-auto px-6 ${isReadingView ? 'py-0' : 'py-8'}`}>
        {/* Header */}
        {!isReadingView && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => navigate('/')}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Home
                </Button>
                <Button variant="outline" onClick={() => navigate('/stories')}>
                  <BookOpen className="w-4 h-4 mr-2" />
                  Stories
                </Button>
              </div>
              <h1 className="text-4xl font-bold text-foreground">Final Story</h1>
              <button
                onClick={() => setIsReadingView(true)}
                className="p-2 hover:bg-white/50 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                title="Enter Reading View"
              >
                <BookOpen className="w-5 h-5 text-foreground" />
              </button>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-center gap-6 mt-4">
              <button
                onClick={handlePrevPage}
                disabled={currentPage === 1}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
                <span>Prev</span>
              </button>

              <div className="px-6 py-2 bg-white dark:bg-slate-800 rounded-full border border-gray-200 dark:border-slate-700 shadow-sm">
                <span className="text-sm font-medium text-foreground">
                  Page {currentPage} / {totalPages}
                </span>
              </div>

              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span>Next</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Exit Reading View Button */}
        {isReadingView && (
          <button
            onClick={() => setIsReadingView(false)}
            className={`fixed top-6 right-6 z-50 p-3 bg-white/80 dark:bg-slate-700/80 backdrop-blur-md hover:bg-white dark:hover:bg-slate-600 rounded-full shadow-2xl transition-all duration-300 group ${
              showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
            }`}
            title="Exit Reading View"
            onMouseEnter={() => setShowControls(true)}
          >
            <X className="w-5 h-5 text-foreground group-hover:rotate-90 transition-transform duration-300" />
          </button>
        )}

        {/* Floating Pagination in Reading View */}
        {isReadingView && (
          <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 transition-all duration-300 ${
            showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
          onMouseEnter={() => setShowControls(true)}>
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className="p-3 bg-white/80 dark:bg-slate-700/80 backdrop-blur-md hover:bg-white dark:hover:bg-slate-600 rounded-full shadow-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-110 disabled:hover:scale-100"
              title="Previous Page"
            >
              <ChevronLeft className="w-5 h-5 text-foreground" />
            </button>

            <div className="px-6 py-3 bg-white/80 dark:bg-slate-700/80 backdrop-blur-md rounded-full shadow-2xl">
              <span className="text-sm font-semibold text-foreground tracking-wide">
                {currentPage} / {totalPages}
              </span>
            </div>

            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className="p-3 bg-white/80 dark:bg-slate-700/80 backdrop-blur-md hover:bg-white dark:hover:bg-slate-600 rounded-full shadow-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-110 disabled:hover:scale-100"
              title="Next Page"
            >
              <ChevronRight className="w-5 h-5 text-foreground" />
            </button>
          </div>
        )}

        {/* Main Content - Book Layout */}
        <div className={`bg-white dark:bg-slate-800 shadow-2xl relative ${
          isReadingView
            ? 'min-h-screen rounded-none p-4 lg:p-12'
            : 'rounded-2xl p-8 mb-8'
        }`}>
          <div className={`grid grid-cols-1 lg:grid-cols-2 ${isReadingView ? 'gap-8 lg:gap-12' : 'gap-8'} h-full`} style={{ perspective: '2000px' }}>
            {/* Left Column - Image */}
            <div
              className={`relative flex items-center transition-all duration-600 ${
                isFlipping && flipDirection === 'prev'
                  ? 'animate-flip-left'
                  : isFlipping && flipDirection === 'next'
                  ? 'animate-flip-right'
                  : ''
              }`}
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className={`w-full ${
                isReadingView
                  ? 'aspect-square max-h-[calc(100vh-8rem)] rounded-2xl'
                  : 'aspect-square rounded-xl'
              } overflow-hidden bg-black/5 dark:bg-white/5 shadow-2xl ring-1 ring-black/5 dark:ring-white/10`}>
                <img
                  src={currentPageData?.image}
                  alt={`Illustration for ${currentPageData?.sectionTitle}`}
                  className="w-full h-full object-cover"
                />
              </div>
              {!isReadingView && (
                <div className="absolute top-4 left-4 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg z-10">
                  <span className="text-sm font-semibold text-foreground">
                    {currentPageData?.sectionTitle}
                  </span>
                </div>
              )}
            </div>

            {/* Right Column - Text */}
            <div
              className={`flex items-center transition-all duration-600 ${
                isFlipping && flipDirection === 'prev'
                  ? 'animate-flip-left-delayed'
                  : isFlipping && flipDirection === 'next'
                  ? 'animate-flip-right-delayed'
                  : ''
              }`}
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className={`w-full ${
                isReadingView
                  ? 'h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar'
                  : 'h-[600px]'
              } flex flex-col justify-start`}>
                <div className={`prose ${isReadingView ? 'prose-xl' : 'prose-lg'} dark:prose-invert max-w-none`}>
                  {currentPageData?.content?.map((paragraph, idx) => (
                    <p
                      key={idx}
                      className={`mb-8 text-foreground/90 leading-relaxed ${
                        idx === 0 && currentPageData?.isFirstPageOfSection
                          ? 'first-letter:text-6xl first-letter:font-bold first-letter:mr-2 first-letter:float-left first-letter:text-primary first-letter:leading-none'
                          : ''
                      }`}
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Media Controls */}
        {!isReadingView && (
          <>
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between">
                {/* Primary Controls */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePlayPause}
                    className="px-6 py-3 flex items-center justify-center gap-3 font-medium text-sm text-white bg-[#171A1F] hover:bg-[#262A33] active:bg-[#323743] rounded-lg transition-colors shadow-md"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-5 h-5" />
                        <span>Pause Audio</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5" />
                        <span>Play Audio</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleReplay}
                    className="p-3 flex items-center justify-center text-foreground hover:text-primary bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                    title="Replay"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                </div>

                {/* Secondary Actions */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveToPlaylist}
                    className="px-4 py-2.5 flex items-center gap-2 font-medium text-sm text-foreground bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                  >
                    <FolderPlus className="w-4 h-4" />
                    <span>Save to Playlist</span>
                  </button>

                  <button
                    onClick={handleShare}
                    className="px-4 py-2.5 flex items-center gap-2 font-medium text-sm text-foreground bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Share Video</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Story Info Footer */}
            <div className="mt-6 text-center">
              <h2 className="text-2xl font-bold text-foreground mb-2">{generatedStory.title}</h2>
              <p className="text-sm text-muted-foreground">
                {storyData?.genre && `${storyData.genre} • `}
                {generatedStory?.sections?.reduce((sum, section) => sum + (section.wordCount || 0), 0)} words total
              </p>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #475569;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }


        @keyframes flipLeft {
          0% {
            transform: rotateY(0deg);
            opacity: 1;
          }
          50% {
            transform: rotateY(-90deg);
            opacity: 0.3;
          }
          100% {
            transform: rotateY(0deg);
            opacity: 1;
          }
        }

        @keyframes flipRight {
          0% {
            transform: rotateY(0deg);
            opacity: 1;
          }
          50% {
            transform: rotateY(90deg);
            opacity: 0.3;
          }
          100% {
            transform: rotateY(0deg);
            opacity: 1;
          }
        }

        @keyframes fadeSlide {
          0% {
            opacity: 1;
            transform: translateX(0);
          }
          50% {
            opacity: 0;
            transform: translateX(-20px);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes fadeSlideRight {
          0% {
            opacity: 1;
            transform: translateX(0);
          }
          50% {
            opacity: 0;
            transform: translateX(20px);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .animate-flip-left {
          animation: flipLeft 0.6s ease-in-out;
        }

        .animate-flip-right {
          animation: flipRight 0.6s ease-in-out;
        }

        .animate-flip-left-delayed {
          animation: fadeSlide 0.6s ease-in-out;
        }

        .animate-flip-right-delayed {
          animation: fadeSlideRight 0.6s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default FinalStory;
