import { useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Textarea } from './components/ui/textarea';
import { Label } from './components/ui/label';
import { ArrowLeft, Wand2, Download, Play, Pause, Loader2, CheckCircle2, Volume2, Music, Image as ImageIcon, Sparkles, X, FileText, Activity, Flag } from 'lucide-react';

const AudioGenerator = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const sessionId = params.sessionId;
  const storyData = location.state?.storyData;
  const voiceData = location.state?.voiceData;
  const generatedStory = location.state?.generatedStory;
  const [audioSections, setAudioSections] = useState([
    {
      id: 'beginning',
      title: 'Beginning',
      icon: 'FileText',
      audioUrl: null,
      isGenerating: false,
      duration: null,
      status: 'pending', // pending, generating, ready, error
      images: [], // Array of generated images
      imagePrompt: ''
    },
    {
      id: 'middle',
      title: 'Middle',
      icon: 'Activity',
      audioUrl: null,
      isGenerating: false,
      duration: null,
      status: 'pending',
      images: [],
      imagePrompt: ''
    },
    {
      id: 'end',
      title: 'End',
      icon: 'Flag',
      audioUrl: null,
      isGenerating: false,
      duration: null,
      status: 'pending',
      images: [],
      imagePrompt: ''
    }
  ]);

  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
  const [showImageGenerator, setShowImageGenerator] = useState(null); // section ID when modal is open

  const generateAudio = async (sectionId) => {
    // Update section to show it's generating
    setAudioSections(prev => prev.map(section =>
      section.id === sectionId ? { ...section, isGenerating: true, status: 'generating' } : section
    ));

    try {
      // Simulate API call to generate audio (replace with actual API)
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Mock audio URL and duration
      const mockAudioUrl = `#audio-${sectionId}`;
      const mockDuration = '5:30';

      setAudioSections(prev => prev.map(section =>
        section.id === sectionId 
          ? { ...section, isGenerating: false, status: 'ready', audioUrl: mockAudioUrl, duration: mockDuration }
          : section
      ));
    } catch (error) {
      console.error('Error generating audio:', error);
      setAudioSections(prev => prev.map(section =>
        section.id === sectionId 
          ? { ...section, isGenerating: false, status: 'error' }
          : section
      ));
    }
  };

  const generateAllAudio = async () => {
    setIsGeneratingAll(true);
    
    // Get the section IDs at the start to avoid stale closure
    const sectionIds = audioSections.map(s => s.id);
    
    for (const sectionId of sectionIds) {
      await generateAudio(sectionId);
    }
    
    setIsGeneratingAll(false);
  };

  const handlePlayPause = (sectionId) => {
    if (currentlyPlaying === sectionId) {
      setCurrentlyPlaying(null);
    } else {
      setCurrentlyPlaying(sectionId);
    }
  };

  const downloadAudio = (sectionId) => {
    // Download logic here
    alert(`Downloading audio for ${sectionId}`);
  };

  const downloadAll = () => {
    // Download all audio files
    alert('Downloading complete audiobook');
  };

  const updateImagePrompt = (sectionId, prompt) => {
    setAudioSections(prev => prev.map(section =>
      section.id === sectionId ? { ...section, imagePrompt: prompt } : section
    ));
  };

  const generateImage = async (sectionId) => {
    const section = audioSections.find(s => s.id === sectionId);
    
    if (!section.imagePrompt) {
      alert('Please enter an image prompt first');
      return;
    }

    // Mark as generating
    setAudioSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, images: [...s.images, { id: Date.now(), url: null, isGenerating: true, prompt: s.imagePrompt }] } : s
    ));

    try {
      // Simulate API call to generate image (replace with actual API)
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Mock image URL
      const mockImageUrl = `https://picsum.photos/seed/${Date.now()}/800/600`;

      setAudioSections(prev => prev.map(s =>
        s.id === sectionId ? {
          ...s,
          images: s.images.map(img =>
            img.isGenerating ? { ...img, url: mockImageUrl, isGenerating: false } : img
          )
        } : s
      ));
    } catch (error) {
      console.error('Error generating image:', error);
      // Remove failed image
      setAudioSections(prev => prev.map(s =>
        s.id === sectionId ? { ...s, images: s.images.filter(img => !img.isGenerating) } : s
      ));
    }
  };

  const removeImage = (sectionId, imageId) => {
    setAudioSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, images: s.images.filter(img => img.id !== imageId) } : s
    ));
  };

  const autoGenerateImagePrompt = (sectionId) => {
    const sectionContent = generatedStory?.sections?.find(s => s.id === sectionId);
    if (sectionContent) {
      // Extract first 2-3 sentences to create an image prompt
      const firstSentences = sectionContent.generatedContent?.split('.').slice(0, 2).join('.') + '.';
      const prompt = `Create a cinematic illustration: ${firstSentences.substring(0, 200)}`;
      updateImagePrompt(sectionId, prompt);
    }
  };

  const isAllReady = audioSections.every(s => s.status === 'ready');
  const isSomeReady = audioSections.some(s => s.status === 'ready');

  const getStatusColor = (status) => {
    switch (status) {
      case 'ready': return 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700';
      case 'generating': return 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700';
      case 'error': return 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700';
      default: return 'bg-muted border-border';
    }
  };

  const getIconComponent = (iconName) => {
    switch (iconName) {
      case 'FileText': return FileText;
      case 'Activity': return Activity;
      case 'Flag': return Flag;
      default: return FileText;
    }
  };

  return (
    <div className="min-h-screen from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <Button variant="outline" onClick={() => navigate(`/manual/${sessionId}/builder`, {
              state: { storyData, voiceData, generatedStory }
            })}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Story
            </Button>
            <div className="flex gap-2">
              {isAllReady && (
                <Button onClick={downloadAll}>
                  <Download className="w-4 h-4 mr-2" />
                  Download Audiobook
                </Button>
              )}
              <Button onClick={generateAllAudio} disabled={isGeneratingAll || isAllReady}>
                {isGeneratingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating Audio...
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4 mr-2" />
                    Generate All Audio
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Title Section */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-black dark:bg-white flex items-center justify-center">
                  <Music className="w-8 h-8 text-white dark:text-black" />
                </div>
                <div className="flex-1">
                  <h1 className="text-3xl font-bold text-foreground mb-1">{generatedStory?.title || 'Untitled Story'}</h1>
                  <p className="text-muted-foreground">
                    Narrated by {voiceData?.voice?.name || 'Selected Voice'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Progress Overview */}
        {isSomeReady && (
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground mb-1">Audio Generation Progress</h3>
                  <p className="text-sm text-muted-foreground">
                    {audioSections.filter(s => s.status === 'ready').length} of {audioSections.length} sections ready
                  </p>
                </div>
                <div className="flex gap-3">
                  {audioSections.map((section) => {
                    const IconComponent = getIconComponent(section.icon);
                    return (
                      <div
                        key={section.id}
                        className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center border-2 transition-all ${getStatusColor(section.status)}`}
                      >
                        <IconComponent className="w-8 h-8" />
                        {section.status === 'ready' && (
                          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 absolute translate-x-6 -translate-y-6" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Audio Sections */}
        <div className="space-y-6">
          {audioSections.map((section, index) => {
            const sectionContent = generatedStory?.sections?.find(s => s.id === section.id);
            const isPlaying = currentlyPlaying === section.id;
            const IconComponent = getIconComponent(section.icon);

            return (
              <Card key={section.id} className="overflow-hidden">
                <CardHeader className={`border-b transition-all ${getStatusColor(section.status)}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-black dark:bg-white flex items-center justify-center">
                        <IconComponent className="w-6 h-6 text-white dark:text-black" />
                      </div>
                      <div>
                        <CardTitle className="text-foreground">
                          Part {index + 1}: {section.title}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-2">
                          {section.status === 'pending' && (
                            <Badge variant="outline">Pending</Badge>
                          )}
                          {section.status === 'generating' && (
                            <Badge className="gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Generating
                            </Badge>
                          )}
                          {section.status === 'ready' && (
                            <>
                              <Badge variant="secondary" className="gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Ready
                              </Badge>
                              {section.duration && (
                                <Badge variant="outline">{section.duration}</Badge>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setShowImageGenerator(section.id)}
                      >
                        <ImageIcon className="w-4 h-4 mr-2" />
                        Images ({section.images.length})
                      </Button>
                      {section.status === 'ready' ? (
                        <>
                          <Button
                            variant="outline"
                            onClick={() => handlePlayPause(section.id)}
                          >
                            {isPlaying ? (
                              <>
                                <Pause className="w-4 h-4 mr-2" />
                                Pause
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4 mr-2" />
                                Play
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => downloadAudio(section.id)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => generateAudio(section.id)}
                          >
                            <Wand2 className="w-4 h-4 mr-2" />
                            Regenerate
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={() => generateAudio(section.id)}
                          disabled={section.isGenerating}
                        >
                          {section.isGenerating ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-4 h-4 mr-2" />
                              Generate Audio
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {/* Audio Player */}
                  {section.status === 'ready' && (
                    <div className="mb-6 p-4 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10">
                      <div className="flex items-center gap-4 mb-3">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handlePlayPause(section.id)}
                          className="h-12 w-12 rounded-full bg-white dark:bg-slate-800"
                        >
                          {isPlaying ? (
                            <Pause className="w-6 h-6" />
                          ) : (
                            <Play className="w-6 h-6" />
                          )}
                        </Button>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-foreground mb-1">
                            {section.title}
                          </div>
                          <div className="h-2 bg-white dark:bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-black dark:bg-white transition-all"
                              style={{ width: isPlaying ? '45%' : '0%' }}
                            />
                          </div>
                        </div>
                        <div className="text-sm font-medium text-muted-foreground">
                          {isPlaying ? '2:30' : '0:00'} / {section.duration}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Content Preview */}
                  {section.status === 'generating' && (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                        <p className="text-muted-foreground">Generating audio narration...</p>
                        <p className="text-sm text-muted-foreground mt-2">This may take a few minutes</p>
                      </div>
                    </div>
                  )}

                  {section.status === 'pending' && sectionContent && (
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-2">Content Preview</h4>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {sectionContent.generatedContent || sectionContent.summary}
                      </p>
                    </div>
                  )}

                  {section.status === 'ready' && sectionContent && (
                    <>
                      {/* Image Gallery */}
                      {section.images.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-sm font-semibold text-foreground mb-3">Visual Elements</h4>
                          <div className="grid grid-cols-2 gap-3">
                            {section.images.map((image) => (
                              <div key={image.id} className="relative group">
                                <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                                  {image.url ? (
                                    <img 
                                      src={image.url} 
                                      alt="Story scene" 
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div>
                        <h4 className="text-sm font-semibold text-foreground mb-2">Narration Script</h4>
                        <div className="max-h-40 overflow-y-auto">
                          <p className="text-sm text-muted-foreground">
                            {sectionContent.generatedContent || sectionContent.summary}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Final Actions */}
        {isAllReady && (
          <Card className="mt-8 border-2 border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Audiobook Complete!</h3>
                    <p className="text-sm text-muted-foreground">
                      All sections have been generated and are ready for download
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setCurrentlyPlaying(audioSections[0].id)}>
                    <Play className="w-4 h-4 mr-2" />
                    Play Full Story
                  </Button>
                  <Button
                    onClick={() => navigate(`/manual/${sessionId}/final`, {
                      state: { storyData, generatedStory, audioSections }
                    })}
                  >
                    <BookOpen className="w-4 h-4 mr-2" />
                    View Final Story
                  </Button>
                  <Button variant="outline" onClick={downloadAll}>
                    <Download className="w-4 h-4 mr-2" />
                    Download Complete Audiobook
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Image Generator Modal */}
        {showImageGenerator && (
          <div 
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowImageGenerator(null)}
          >
            <Card 
              className="max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ImageIcon className="w-6 h-6" />
                      Generate Visual Images
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create illustrations for {audioSections.find(s => s.id === showImageGenerator)?.title}
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => setShowImageGenerator(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Story Content Reference */}
                <div>
                  <Label className="mb-2 block">Story Content for Reference</Label>
                  <div className="p-4 bg-muted rounded-lg max-h-32 overflow-y-auto">
                    <p className="text-sm text-muted-foreground">
                      {generatedStory?.sections?.find(s => s.id === showImageGenerator)?.generatedContent || 
                       generatedStory?.sections?.find(s => s.id === showImageGenerator)?.summary}
                    </p>
                  </div>
                </div>

                {/* Image Prompt */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="image-prompt">Image Description / Prompt</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => autoGenerateImagePrompt(showImageGenerator)}
                    >
                      <Sparkles className="w-3 h-3 mr-2" />
                      Auto-generate
                    </Button>
                  </div>
                  <Textarea
                    id="image-prompt"
                    value={audioSections.find(s => s.id === showImageGenerator)?.imagePrompt || ''}
                    onChange={(e) => updateImagePrompt(showImageGenerator, e.target.value)}
                    placeholder="Describe the scene you want to visualize (e.g., 'A sunset over a mystical forest with ancient trees')"
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Be specific about mood, setting, characters, and visual style for best results
                  </p>
                </div>

                <Button 
                  onClick={() => generateImage(showImageGenerator)}
                  className="w-full"
                  disabled={!audioSections.find(s => s.id === showImageGenerator)?.imagePrompt}
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate Image
                </Button>

                {/* Generated Images Gallery */}
                {audioSections.find(s => s.id === showImageGenerator)?.images.length > 0 && (
                  <div>
                    <Label className="mb-3 block">Generated Images</Label>
                    <div className="grid grid-cols-2 gap-4">
                      {audioSections.find(s => s.id === showImageGenerator)?.images.map((image) => (
                        <div key={image.id} className="relative group">
                          <div className="aspect-video bg-muted rounded-lg overflow-hidden border-2 border-border">
                            {image.url ? (
                              <>
                                <img 
                                  src={image.url} 
                                  alt="Story illustration" 
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => removeImage(showImageGenerator, image.id)}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                <p className="text-xs text-muted-foreground">Generating...</p>
                              </div>
                            )}
                          </div>
                          {image.url && (
                            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                              {image.prompt}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {audioSections.find(s => s.id === showImageGenerator)?.images.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No images generated yet</p>
                    <p className="text-xs mt-1">Create visual elements to enhance your audiobook</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioGenerator;

