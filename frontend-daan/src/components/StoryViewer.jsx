import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ChevronLeft, ChevronRight, BookOpen, X, ArrowLeft, Download } from 'lucide-react';
import { fetchWithAuth } from '../lib/api';
import StreamingAudioPlayer from './StreamingAudioPlayer';
import storyStorageService from '../services/storyStorageService';

const PLACEHOLDER_DELAY_MS = 1500;

const StoryViewer = ({ storyId: storyIdProp }) => {
  const navigate = useNavigate();
  const params = useParams();
  const storyId = storyIdProp || params.storyId;
  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isReadingView, setIsReadingView] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState('next');
  const [showControls, setShowControls] = useState(true);
  const [audioError, setAudioError] = useState(null);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioComplete, setAudioComplete] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [storyImages, setStoryImages] = useState([]);
  const [imageLoadState, setImageLoadState] = useState({});
  const [imagesFetchComplete, setImagesFetchComplete] = useState(false);
  const [canShowFallbackImages, setCanShowFallbackImages] = useState(false);

  useEffect(() => {
    if (storyId) {
      fetchStory(storyId);
      fetchStoryImages(storyId);
    }
  }, [storyId]);

  useEffect(() => {
    setImageLoadState((prev) => {
      const next = {};
      storyImages.forEach((url) => {
        next[url] = prev[url] ?? false;
      });
      return next;
    });
  }, [storyImages]);

  const markImageLoaded = (url) => {
    if (!url) return;
    setImageLoadState((prev) => ({
      ...prev,
      [url]: true,
    }));
  };

  useEffect(() => {
    if (!imagesFetchComplete) {
      setCanShowFallbackImages(false);
      return;
    }

    if (storyImages.length > 0) {
      setCanShowFallbackImages(true);
      return;
    }

    let timeoutId = setTimeout(() => {
      setCanShowFallbackImages(true);
    }, PLACEHOLDER_DELAY_MS);

    return () => clearTimeout(timeoutId);
  }, [imagesFetchComplete, storyImages]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      // No audioService.stop() here as it's no longer used
    };
  }, []);

  const fetchStory = async (id) => {
    try {
      setLoading(true);
      const response = await fetchWithAuth(`/api/v1/stories/${id}`);
      const data = await response.json();
      setStory(data);
      setSessionId(data?.session_id || data?.story_id || id);

      const audioState = storyStorageService.loadAudioState(id);
      if (audioState?.status === 'ready') {
        setIsAudioReady(true);
        setAudioComplete(true);
        setAudioDuration(audioState.duration || 0);
      } else {
        setIsAudioReady(data?.audio_status === 'ready');
        setAudioComplete(data?.audio_status === 'ready');
        setAudioDuration(data?.audio_duration || 0);
      }

      if (data?.audio_status === 'ready') {
        storyStorageService.saveAudioState(id, {
          status: 'ready',
          duration: data.audio_duration || 0
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStoryImages = async (id) => {
    try {
      setImagesFetchComplete(false);
      const response = await fetchWithAuth(`/api/v1/stories/${id}/images`);
      const data = await response.json();
      const images = data.images || [];
      setStoryImages(images);
    } catch (err) {
      console.warn('Failed to fetch story images:', err);
      // Don't fail the whole page if images can't be loaded
    } finally {
      setImagesFetchComplete(true);
    }
  };

  // Split story content into pages based on character count
  const pages = useMemo(() => {
    if (!story) return [];

    // Handle AI-generated stories (S3-based, with structured_story)
    const structuredStory = story.structured_story || story.story?.structured_story;
    const isAiStory = !!structuredStory;
    
    // Handle manual builder stories (old format with story.sections)
    const storyContent = story.story || story;
    const storyMode = story.source_mode
      ?? story.metadata?.source_mode
      ?? storyContent?.metadata?.source_mode
      ?? (storyContent?.metadata?.type === 'manual' ? 'manual' : 'ai');
    const isManual = storyMode === 'manual';
    
    const allPages = [];
    const MIN_CHARS_PER_PAGE = 800;
    const MAX_CHARS_PER_PAGE = 1200;

    // Determine content source based on story type
    let content;
    if (isAiStory && structuredStory?.chapters) {
      // AI-generated story with structured data
      content = structuredStory.chapters;
    } else if (isManual) {
      // Manual builder story
      content = storyContent.sections;
    } else if (storyContent?.chapters) {
      // Fallback: legacy format with chapters at story.story.chapters
      content = storyContent.chapters;
    } else {
      // No valid content found
      return [];
    }

    if (!content) return [];

    content.forEach((item) => {
      // Extract text content based on story type
      let textContent = '';
      if (isAiStory && item.lines) {
        // AI-generated story: format lines with speaker names
        textContent = item.lines.map(line => {
          const text = line.text.trim();
          
          if (line.speaker === 'Narrator') {
            // Narrator lines without speaker prefix
            return text;
          } else {
            // Character dialogue: show speaker name before their dialogue
            // Remove existing quotes if present
            const cleanText = text.startsWith('"') && text.endsWith('"') 
              ? text.slice(1, -1) 
              : text;
            
            return `**${line.speaker}:** "${cleanText}"`;
          }
        }).join('\n\n');
      } else {
        // Manual builder story: use polished_content or content
        textContent = item.polished_content || item.content || '';
      }
      
      const paragraphs = textContent.split('\n\n').filter(p => p.trim());
      
      // Get image for this chapter
      const chapterIndex = item.chapter_number - 1;
      const actualImage = storyImages[chapterIndex] || (storyImages.length > 0 ? storyImages[chapterIndex % storyImages.length] : undefined);
      const placeholderImage = `https://picsum.photos/seed/${item.id || item.chapter_number}/800/600`;
      const shouldUsePlaceholder = !actualImage && canShowFallbackImages && imagesFetchComplete;
      const resolvedImage = actualImage || (shouldUsePlaceholder ? placeholderImage : null);

      // SIMPLIFIED: Each chapter = 1 page (no pagination within chapters)
      // Since we always have 3 chapters, we'll always have 3 pages
      allPages.push({
        itemId: item.id || item.chapter_number,
        itemTitle: item.title || `Chapter ${item.chapter_number}`,
        content: paragraphs,  // All paragraphs from this chapter
        image: resolvedImage,
        placeholderUrl: placeholderImage,
        hasActualImage: Boolean(actualImage),
        isFirstPageOfItem: true,
        pageWithinItem: 1,
        charCount: textContent.length
      });
    });

    console.log('📖 StoryViewer: Generated pages:', {
      totalPages: allPages.length,
      hasStory: !!story,
      hasStructuredStory: !!(story?.structured_story),
      hasImages: storyImages.length,
      contentType: story?.structured_story ? 'AI' : story?.story ? 'Manual' : 'Unknown'
    });
    
    return allPages;
  }, [story, storyImages, canShowFallbackImages, imagesFetchComplete]);

  const totalPages = pages.length;
  const currentPageData = pages[currentPage - 1];

  const speakerOptions = useMemo(() => {
    if (!story) {
      return ['Narrator'];
    }

    const structured = story.structured_story || story.story?.structured_story;
    if (!structured || !Array.isArray(structured.chapters)) {
      return ['Narrator'];
    }

    const speakers = new Set(structured.characters ?? []);
    structured.chapters.forEach((chapter) => {
      chapter.lines?.forEach((line) => {
        if (line?.speaker) {
          speakers.add(line.speaker);
        }
      });
    });

    // narrator voice is always available; ensure human-friendly ordering
    return ['Narrator', ...Array.from(speakers).filter((speaker) => speaker && speaker !== 'Narrator')];
  }, [story]);

  const handlePrevPage = () => {
    if (currentPage > 1 && !isFlipping) {
      setFlipDirection('prev');
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentPage(currentPage - 1);
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
        setTimeout(() => setIsFlipping(false), 300);
      }, 300);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black dark:border-white"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div>
          <p className="text-red-600 mb-4">Error: {error}</p>
          <Button onClick={() => navigate('/stories')}>Back to Stories</Button>
        </div>
      </div>
    );
  }

  // Check if we have valid content to display
  if (!story) {
    return (
      <div className="p-8 text-center min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div>
          <p className="text-muted-foreground mb-4">Story not found</p>
          <Button onClick={() => navigate('/stories')}>Back to Stories</Button>
        </div>
      </div>
    );
  }

  // If we have no pages (couldn't parse structured content), show raw text fallback
  if (!pages.length) {
    const rawText = story?.story_text || story?.story?.paragraphs || story?.story?.content;
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-12">
        <div className="max-w-4xl mx-auto space-y-8 px-6">
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold text-foreground">{story?.title || 'Story'}</h1>
            <p className="text-muted-foreground">
              Structured chapters are not available for this story. Showing raw text output instead.
            </p>
            <Button onClick={() => navigate('/stories')} variant="outline">
              Back to Stories
            </Button>
          </div>

          {rawText ? (
            <Card className="bg-white dark:bg-slate-800 shadow-xl">
              <CardHeader>
                <CardTitle>Story Text</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap">
                  {rawText}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center text-muted-foreground">
              <p>No textual content found for this story.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Extract title and metadata (handles both AI and manual story formats)
  const storyContent = story.story || story;
  const title = story.title || storyContent.title || 'Untitled Story';
  const metadata = story.metadata || storyContent.metadata || {};
  const storyMode = story.source_mode
    ?? story.metadata?.source_mode
    ?? metadata?.source_mode
    ?? (story.structured_story ? 'ai' : metadata?.type === 'manual' ? 'manual' : 'ai');
  const isManual = storyMode === 'manual';

  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-slate-900"
      onMouseMove={() => isReadingView && setShowControls(true)}
    >
      <div className={`max-w-7xl mx-auto px-6 ${isReadingView ? 'py-0' : 'py-8'}`}>
        {/* Header */}
        {!isReadingView && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <Button variant="outline" onClick={() => navigate('/stories')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Stories
              </Button>
              <div className="text-center">
                <h1 className="text-4xl font-bold text-foreground">{title}</h1>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <Badge variant={isManual ? "secondary" : "default"}>
                    {isManual ? "Manual" : "AI-Powered"}
                  </Badge>
                  {metadata?.genre && <Badge variant="outline">{metadata.genre}</Badge>}
                </div>
              </div>
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
              <div className={`relative w-full ${
                isReadingView
                  ? 'h-[calc(100vh-8rem)] rounded-2xl'
                  : 'aspect-[4/5] rounded-xl'
              } overflow-hidden bg-black/5 dark:bg-white/5 shadow-2xl ring-1 ring-black/5 dark:ring-white/10`}>
                {currentPageData?.image && (
                  <img
                    key={currentPageData?.image}
                    src={currentPageData?.image}
                    alt={`Illustration for ${currentPageData?.itemTitle}`}
                    onLoad={() => markImageLoaded(currentPageData?.image)}
                    onError={() => markImageLoaded(currentPageData?.image)}
                    className={`w-full h-full object-cover transition-opacity duration-500 ${
                      imageLoadState[currentPageData?.image] ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                )}
                {(!currentPageData?.image || !imageLoadState[currentPageData?.image]) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/10 dark:bg-black/40 backdrop-blur-sm">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-white/80">Loading illustration…</span>
                  </div>
                )}
              </div>
              {!isReadingView && (
                <div className="absolute top-4 left-4 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg z-10">
                  <span className="text-sm font-semibold text-foreground">
                    {currentPageData?.itemTitle}
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
              <div className={`relative w-full ${
                isReadingView
                  ? 'h-[calc(100vh-8rem)]'
                  : 'h-[600px]'
              } overflow-y-auto custom-scrollbar flex flex-col justify-start`}>
                <div className={`prose ${isReadingView ? 'prose-xl' : 'prose-lg'} dark:prose-invert max-w-none break-words`}>
                  {currentPageData?.content?.map((paragraph, idx) => {
                    // Parse speaker names in format: **SpeakerName:** "dialogue"
                    const speakerMatch = paragraph.match(/^\*\*(.+?):\*\*\s*(.+)$/);
                    
                    if (speakerMatch) {
                      const [, speakerName, dialogue] = speakerMatch;
                      return (
                        <p
                          key={idx}
                          className="mb-8 text-foreground/90 leading-relaxed break-words"
                        >
                          <span className="font-bold text-primary">{speakerName}:</span> {dialogue}
                        </p>
                      );
                    }
                    
                    return (
                      <p
                        key={idx}
                        className={`mb-8 text-foreground/90 leading-relaxed break-words ${
                          idx === 0 && currentPageData?.isFirstPageOfItem
                            ? 'first-letter:text-6xl first-letter:font-bold first-letter:mr-2 first-letter:float-left first-letter:text-primary first-letter:leading-none'
                            : ''
                        }`}
                      >
                        {paragraph}
                      </p>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Story Info Footer */}
        {!isReadingView && (
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              {metadata?.genre && `${metadata.genre} • `}
              {metadata?.total_word_count && `${metadata.total_word_count} words`}
              {metadata?.execution_time_ms && ` • Generated in ${(metadata.execution_time_ms / 1000).toFixed(1)}s`}
              {storyMode && ` • ${storyMode === 'manual' ? 'Manual' : 'AI'} mode`}
            </p>
          </div>
        )}

        {/* Audio Controls - Fixed at Bottom */}
        {!isReadingView && sessionId && (
          <div className="mt-8">
            <Card className="bg-black/5 dark:bg-white/5 border-2 border-black/10 dark:border-white/10">
              <div className="p-6 space-y-4">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Audio Player
                </h3>
                <StreamingAudioPlayer
                  sessionId={storyId}
                  onAudioReady={(url, duration) => {
                    setIsAudioReady(true);
                    setAudioDuration(duration);
                    setAudioComplete(true);
                    storyStorageService.saveAudioState(storyId, {
                      status: 'ready',
                      duration
                    });
                  }}
                  onStatusChange={(status) => {
                    if (status === 'reset') {
                      setIsAudioReady(false);
                      setAudioDuration(0);
                      setAudioComplete(false);
                      storyStorageService.saveAudioState(storyId, {
                        status: 'not_generated',
                        duration: 0
                      });
                    }
                  }}
                  speakerOptions={speakerOptions}
                />
                {audioError && (
                  <p className="text-sm text-center text-red-600 dark:text-red-400">⚠️ {audioError}</p>
                )}
              </div>
            </Card>
          </div>
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

export default StoryViewer;
