import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Label } from './components/ui/label';
import { Input } from './components/ui/input';
import { Badge } from './components/ui/badge';
import { ArrowLeft, ArrowRight, Mic, Upload, Loader2, CheckCircle2, AlertCircle, Play, Pause, Trash2 } from 'lucide-react';
import Breadcrumb from './components/Breadcrumb';
import tech42TtsService from './services/tech42TtsService';

/**
 * Apply a gentle fade-in to avoid clicks at the start
 * @param {Float32Array} pcmData - Raw PCM audio samples
 * @param {number} sampleRate - Sample rate
 * @returns {Float32Array} Audio with fade-in applied
 */
const applyFadeIn = (pcmData, sampleRate) => {
  const fadeInDuration = 0.01; // 10ms fade-in
  const fadeInSamples = Math.floor(sampleRate * fadeInDuration);
  const fadedData = new Float32Array(pcmData);
  
  for (let i = 0; i < Math.min(fadeInSamples, pcmData.length); i++) {
    const gain = i / fadeInSamples;
    fadedData[i] = pcmData[i] * gain;
  }
  
  return fadedData;
};

/**
 * Normalize audio to maximize dynamic range without clipping
 * @param {Float32Array} pcmData - Raw PCM audio samples
 * @returns {Float32Array} Normalized audio samples
 */
const normalizeAudio = (pcmData) => {
  let max = 0;
  for (let i = 0; i < pcmData.length; i++) {
    const abs = Math.abs(pcmData[i]);
    if (abs > max) max = abs;
  }
  
  if (max === 0) return pcmData;
  
  // Only normalize if the audio is too quiet (peak < 0.5)
  // This prevents over-amplification of already-loud audio
  if (max > 0.5) {
    console.log(`🔊 Audio level good: peak ${max.toFixed(3)} (no normalization needed)`);
    return pcmData;
  }
  
  const normalized = new Float32Array(pcmData.length);
  const scale = 0.8 / max; // More conservative - target 80% instead of 95%
  
  for (let i = 0; i < pcmData.length; i++) {
    normalized[i] = pcmData[i] * scale;
  }
  
  console.log(`🔊 Audio normalized: peak ${max.toFixed(3)} → 0.8`);
  return normalized;
};

/**
 * Encode raw PCM audio data to WAV format
 * @param {Float32Array} pcmData - Raw PCM audio samples
 * @param {number} sampleRate - Sample rate (typically 48000 or 44100)
 * @returns {Blob} WAV formatted audio blob
 */
const encodeWAV = (pcmData, sampleRate = 48000) => {
  // Apply fade-in to avoid initial click
  const fadedData = applyFadeIn(pcmData, sampleRate);
  
  // Normalize audio for better quality
  const normalizedData = normalizeAudio(fadedData);
  
  const numChannels = 1; // Mono for voice
  const bitsPerSample = 16; // Standard quality
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const wavDataSize = normalizedData.length * bytesPerSample;
  const wavSize = 36 + wavDataSize;
  
  const buffer = new ArrayBuffer(44 + wavDataSize);
  const view = new DataView(buffer);
  
  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  // RIFF chunk descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, wavSize, true);
  writeString(8, 'WAVE');
  
  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // audio format (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  
  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, wavDataSize, true);
  
  // Convert float samples to 16-bit PCM
  const offset = 44;
  for (let i = 0; i < normalizedData.length; i++) {
    const s = Math.max(-1, Math.min(1, normalizedData[i])); // clamp
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(offset + i * 2, val, true);
  }
  
  console.log(`📦 WAV encoded: ${sampleRate}Hz, ${bitsPerSample}-bit, ${numChannels}ch, ${wavDataSize} bytes`);
  
  return new Blob([buffer], { type: 'audio/wav' });
};

const VoiceAssignment = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const sessionId = params.sessionId;
  const generatedStory = location.state?.generatedStory;
  const storyData = location.state?.storyData;
  const storyConfig = location.state?.storyConfig;

  const [availableVoices, setAvailableVoices] = useState([]);
  const [speakerVoiceMap, setSpeakerVoiceMap] = useState({});
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [uploadingVoice, setUploadingVoice] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [previewingVoice, setPreviewingVoice] = useState(null);
  
  // Recording state
  const [isRecording, setIsRecording] = useState(null);
  const [recordedAudio, setRecordedAudio] = useState({});
  const [mediaRecorders, setMediaRecorders] = useState({});
  const [customVoiceNames, setCustomVoiceNames] = useState({});
  
  // Microphone selection state
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [selectedMicId, setSelectedMicId] = useState({});

  // Extract unique speaker names from story
  const speakers = generatedStory?.sections
    ? [...new Set(
        generatedStory.sections.flatMap(section =>
          section.segments?.map(seg => seg.speaker) || []
        )
      )]
    : [];

  // Load available voices and audio devices on mount
  useEffect(() => {
    const loadVoices = async () => {
      try {
        const voices = await tech42TtsService.getVoices();
        setAvailableVoices(voices);

        // Auto-assign first voice to all speakers by default
        if (voices.length > 0 && speakers.length > 0) {
          const defaultMap = {};
          speakers.forEach(speaker => {
            defaultMap[speaker] = voices[0];
          });
          setSpeakerVoiceMap(defaultMap);
        }
      } catch (error) {
        console.error('Failed to load voices:', error);
      } finally {
        setIsLoadingVoices(false);
      }
    };

    const loadAudioDevices = async () => {
      try {
        // Request permission first
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Then enumerate devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        setAudioInputDevices(audioInputs);
        
        console.log(`🎤 Found ${audioInputs.length} audio input devices`);
      } catch (error) {
        console.error('Failed to enumerate audio devices:', error);
      }
    };

    loadVoices();
    loadAudioDevices();
  }, []);

  const handleVoiceSelection = (speaker, voice) => {
    setSpeakerVoiceMap(prev => ({
      ...prev,
      [speaker]: voice
    }));
  };

  const handleStartRecording = async (speaker) => {
    try {
      // Create audio context with high sample rate if supported
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000 // Request 48kHz for high quality
      });
      
      // Build audio constraints with optional device ID
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        // Request high quality audio constraints
        channelCount: 1, // Mono for voice
        sampleRate: 48000, // High quality sample rate
        sampleSize: 16 // 16-bit depth
      };
      
      // Add device ID if a specific microphone is selected
      if (selectedMicId[speaker]) {
        audioConstraints.deviceId = { exact: selectedMicId[speaker] };
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: audioConstraints
      });
      
      const source = audioContext.createMediaStreamSource(stream);
      
      // Use smaller buffer for lower latency and better quality
      const bufferSize = 4096;
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      const pcmData = [];
      let bufferCount = 0;
      const skipInitialBuffers = 3; // Skip first 3 buffers (~85ms) to avoid initialization artifacts
      
      processor.onaudioprocess = (event) => {
        bufferCount++;
        
        // Skip the first few buffers to avoid initialization pops/clicks
        if (bufferCount <= skipInitialBuffers) {
          return;
        }
        
        const inputData = event.inputBuffer.getChannelData(0);
        // Clone the data to preserve it
        pcmData.push(new Float32Array(inputData));
      };
      
      // Create a silent gain node to connect to (prevents feedback but allows processing)
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0; // Silent - no playback
      
      source.connect(processor);
      processor.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      setIsRecording(speaker);
      
      // Store for later stopping
      setMediaRecorders(prev => ({
        ...prev,
        [speaker]: {
          audioContext,
          stream,
          processor,
          source,
          gainNode,
          pcmData,
          sampleRate: audioContext.sampleRate
        }
      }));
      
      console.log(`🎤 Recording started for ${speaker} at ${audioContext.sampleRate}Hz (requested 48kHz)`);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setUploadError(`Could not access microphone for ${speaker}: ${error.message}`);
    }
  };

  const handleStopRecording = (speaker) => {
    const recorder = mediaRecorders[speaker];
    if (!recorder) return;
    
    const { audioContext, stream, processor, source, gainNode, pcmData, sampleRate } = recorder;
    
    // Stop recording
    source.disconnect();
    processor.disconnect();
    if (gainNode) {
      gainNode.disconnect();
    }
    stream.getTracks().forEach(track => track.stop());
    
    // Convert PCM data to single array
    let totalLength = 0;
    for (let i = 0; i < pcmData.length; i++) {
      totalLength += pcmData[i].length;
    }
    
    const pcmArray = new Float32Array(totalLength);
    let offset = 0;
    for (let i = 0; i < pcmData.length; i++) {
      pcmArray.set(pcmData[i], offset);
      offset += pcmData[i].length;
    }
    
    // Encode to WAV
    const wavBlob = encodeWAV(pcmArray, sampleRate);
    const audioUrl = URL.createObjectURL(wavBlob);
    
    setRecordedAudio(prev => ({
      ...prev,
      [speaker]: { blob: wavBlob, url: audioUrl }
    }));
    
    setIsRecording(null);
    
    // Clean up
    setMediaRecorders(prev => {
      const updated = { ...prev };
      delete updated[speaker];
      return updated;
    });
    
    console.log(`✅ Recording stopped for ${speaker}. WAV size: ${wavBlob.size} bytes`);
  };

  const handleUploadRecordedAudio = async (speaker) => {
    const audioData = recordedAudio[speaker];
    if (!audioData) {
      setUploadError(`No recorded audio for ${speaker}`);
      return;
    }

    setUploadingVoice(speaker);
    setUploadError(null);

    try {
      // Create a File from the blob
      const timestamp = Date.now();
      
      // Use custom name if provided, otherwise auto-generate
      const customName = customVoiceNames[speaker]?.trim();
      const voiceName = customName || `${speaker}_recorded_${timestamp}`;
      
      const file = new File(
        [audioData.blob],
        `${voiceName}.wav`,
        { type: 'audio/wav' }
      );

      // Upload with the voice name
      const result = await tech42TtsService.uploadVoice(file, voiceName);

      // Refresh voices list
      const voices = await tech42TtsService.getVoices();
      setAvailableVoices(voices);

      // Auto-assign the new voice to this speaker
      const newVoice = voices.find(v => v.name === voiceName || v.id === result.id);
      if (newVoice) {
        handleVoiceSelection(speaker, newVoice);
      }

      // Clear the recorded audio and custom name
      setRecordedAudio(prev => {
        const updated = { ...prev };
        delete updated[speaker];
        return updated;
      });
      
      setCustomVoiceNames(prev => {
        const updated = { ...prev };
        delete updated[speaker];
        return updated;
      });

      console.log('Voice recorded and uploaded successfully:', result);
    } catch (error) {
      console.error('Failed to upload recorded voice:', error);
      setUploadError(`Failed to upload recorded voice for ${speaker}: ${error.message}`);
    } finally {
      setUploadingVoice(null);
    }
  };

  const handleDiscardRecording = (speaker) => {
    // Stop recording if active
    if (isRecording === speaker) {
      handleStopRecording(speaker);
    }
    
    // Clean up recorded audio
    const audioData = recordedAudio[speaker];
    if (audioData?.url) {
      URL.revokeObjectURL(audioData.url);
    }
    
    setRecordedAudio(prev => {
      const updated = { ...prev };
      delete updated[speaker];
      return updated;
    });
    
    // Clear custom name
    setCustomVoiceNames(prev => {
      const updated = { ...prev };
      delete updated[speaker];
      return updated;
    });
  };

  const handleFileUpload = async (event, speaker) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingVoice(speaker);
    setUploadError(null);

    try {
      // Use custom name if provided, otherwise auto-generate
      const customName = customVoiceNames[speaker]?.trim();
      const voiceName = customName || `${speaker}_${Date.now()}`;
      
      const result = await tech42TtsService.uploadVoice(file, voiceName);

      // Refresh voices list
      const voices = await tech42TtsService.getVoices();
      setAvailableVoices(voices);

      // Auto-assign the new voice to this speaker
      const newVoice = voices.find(v => v.name === voiceName || v.id === result.id);
      if (newVoice) {
        handleVoiceSelection(speaker, newVoice);
      }
      
      // Clear custom name after upload
      setCustomVoiceNames(prev => {
        const updated = { ...prev };
        delete updated[speaker];
        return updated;
      });

      console.log('Voice uploaded successfully:', result);
    } catch (error) {
      console.error('Failed to upload voice:', error);
      setUploadError(`Failed to upload voice for ${speaker}: ${error.message}`);
    } finally {
      setUploadingVoice(null);
    }
  };

  const handlePreviewVoice = async (voiceName) => {
    if (!voiceName) {
      alert('Please select a voice first');
      return;
    }

    setPreviewingVoice(voiceName);
    try {
      await tech42TtsService.previewVoice(voiceName);
    } catch (error) {
      console.error('Failed to preview voice:', error);
      // Show more detailed error message
      const errorMessage = error.message || 'Unknown error occurred while previewing voice';
      setUploadError(`Preview Error: ${errorMessage}\n\nThe voice may not be fully ready yet. Try again in a moment.`);
      
      // Clear error after 8 seconds
      setTimeout(() => {
        setUploadError(null);
      }, 8000);
    } finally {
      setPreviewingVoice(null);
    }
  };

  const handleContinue = () => {
    navigate(`/manual/${sessionId}/final`, {
      state: {
        storyData,
        storyConfig,
        generatedStory,
        voiceAssignments: speakerVoiceMap
      }
    });
  };

  const isAllAssigned = speakers.every(speaker => speakerVoiceMap[speaker]);

  if (!generatedStory) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <Card>
          <CardContent className="p-6">
            <p className="text-foreground">No story data found. Please generate a story first.</p>
            <Button onClick={() => navigate('/')} className="mt-4">
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          currentStep={3}
        />
      </div>

      <div className="max-w-4xl mx-auto px-6 pb-6">
        <div className="mb-8">
          <Button variant="outline" onClick={() => navigate(`/manual/${sessionId}/builder`, {
            state: { storyData, storyConfig }
          })}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-black dark:bg-white flex items-center justify-center">
                <Mic className="w-6 h-6 text-white dark:text-black" />
              </div>
              <div>
                <CardTitle className="text-2xl">Assign Voices to Speakers</CardTitle>
                <CardDescription>
                  Choose a voice for each speaker in your story or record your own
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Practice Sentence</p>
              <p className="mt-1">
                Please read the following sentence clearly before or while recording your voice: “The bronze violin skittered clumsily between the sleek, cold stones. The swift jump of the sleek gazelle vexed the grumpy, old judge. Flimsy copper kettles chattered near the gloomy, silent wharf.”
              </p>
            </div>
            {isLoadingVoices ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-purple-600 dark:text-purple-400" />
                <span className="ml-3 text-muted-foreground">Loading available voices...</span>
              </div>
            ) : availableVoices.length === 0 ? (
              <div className="flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  No voices available. Record or upload custom voices below.
                </p>
              </div>
            ) : (
              <>
                {uploadError && (
                  <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    <p className="text-sm text-red-800 dark:text-red-200">{uploadError}</p>
                  </div>
                )}

                {speakers.map((speaker) => (
                  <div key={speaker} className="space-y-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-base px-3 py-1">
                          {speaker}
                        </Badge>
                        {speakerVoiceMap[speaker] && (
                          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`voice-${speaker}`} className="text-sm font-medium">
                        Select Voice
                      </Label>
                      <div className="flex gap-2">
                        <select
                          id={`voice-${speaker}`}
                          value={speakerVoiceMap[speaker]?.id || speakerVoiceMap[speaker]?.name || ''}
                          onChange={(e) => {
                            const voice = availableVoices.find(v =>
                              v.id === e.target.value || v.name === e.target.value
                            );
                            if (voice) handleVoiceSelection(speaker, voice);
                          }}
                          className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <option value="">Select a voice</option>
                          {availableVoices.map((voice) => (
                            <option key={voice.id || voice.name} value={voice.id || voice.name}>
                              {voice.name || voice.id}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreviewVoice(speakerVoiceMap[speaker]?.name || speakerVoiceMap[speaker]?.id)}
                          disabled={!speakerVoiceMap[speaker] || previewingVoice === (speakerVoiceMap[speaker]?.name || speakerVoiceMap[speaker]?.id)}
                          className="h-10 px-3"
                          title="Preview Voice"
                        >
                          {previewingVoice === (speakerVoiceMap[speaker]?.name || speakerVoiceMap[speaker]?.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Recording Section */}
                    <div className="space-y-2 border-t pt-3 mt-3">
                      <Label className="text-sm font-medium">
                        Or Record Your Own Voice
                      </Label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Click to record and upload a custom voice for {speaker}
                      </p>
                      
                      <Input
                        type="text"
                        placeholder={`Voice name (optional, e.g., "Friendly ${speaker}")`}
                        value={customVoiceNames[speaker] || ''}
                        onChange={(e) => setCustomVoiceNames(prev => ({
                          ...prev,
                          [speaker]: e.target.value
                        }))}
                        disabled={uploadingVoice === speaker}
                        className="text-sm"
                      />
                      
                      {audioInputDevices.length > 0 && (
                        <div className="space-y-1">
                          <Label htmlFor={`mic-${speaker}`} className="text-xs text-muted-foreground">
                            Select Microphone
                          </Label>
                          <select
                            id={`mic-${speaker}`}
                            value={selectedMicId[speaker] || ''}
                            onChange={(e) => setSelectedMicId(prev => ({
                              ...prev,
                              [speaker]: e.target.value
                            }))}
                            disabled={isRecording === speaker || uploadingVoice === speaker}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <option value="">Default Microphone</option>
                            {audioInputDevices.map((device) => (
                              <option key={device.deviceId} value={device.deviceId}>
                                {device.label || `Microphone ${device.deviceId.substring(0, 8)}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      
                      {!recordedAudio[speaker] ? (
                        <div className="flex items-center gap-2">
                          {isRecording === speaker ? (
                            <>
                              <Button
                                onClick={() => handleStopRecording(speaker)}
                                variant="destructive"
                                size="sm"
                                className="flex-1"
                              >
                                <Pause className="w-4 h-4 mr-2" />
                                Stop Recording
                              </Button>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                                Recording...
                              </div>
                            </>
                          ) : (
                            <Button
                              onClick={() => handleStartRecording(speaker)}
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              disabled={uploadingVoice === speaker}
                            >
                              <Mic className="w-4 h-4 mr-2" />
                              Start Recording
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="p-3 bg-muted rounded-lg space-y-2 border border-border">
                          <p className="text-sm font-medium">✓ Recording captured</p>
                          <audio 
                            controls 
                            src={recordedAudio[speaker].url} 
                            className="w-full h-8"
                          />
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleUploadRecordedAudio(speaker)}
                              size="sm"
                              disabled={uploadingVoice === speaker}
                              className="flex-1"
                            >
                              {uploadingVoice === speaker ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Upload className="w-4 h-4 mr-2" />
                                  Upload Recording
                                </>
                              )}
                            </Button>
                            <Button
                              onClick={() => handleDiscardRecording(speaker)}
                              variant="outline"
                              size="sm"
                              disabled={uploadingVoice === speaker}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* File Upload Section */}
                    <div className="space-y-2 border-t pt-3">
                      <Label className="text-sm font-medium">
                        Or Upload Voice File
                      </Label>
                      
                      <Input
                        type="text"
                        placeholder={`Voice name (optional, e.g., "Dramatic ${speaker}")`}
                        value={customVoiceNames[speaker] || ''}
                        onChange={(e) => setCustomVoiceNames(prev => ({
                          ...prev,
                          [speaker]: e.target.value
                        }))}
                        disabled={uploadingVoice === speaker}
                        className="text-sm"
                      />
                      
                      <div className="flex items-center gap-2">
                        <Input
                          type="file"
                          accept="audio/*"
                          onChange={(e) => handleFileUpload(e, speaker)}
                          disabled={uploadingVoice === speaker}
                          className="flex-1"
                        />
                        {uploadingVoice === speaker && (
                          <Loader2 className="w-5 h-5 animate-spin text-purple-600 dark:text-purple-400" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Upload an audio file to create a custom voice for {speaker}
                      </p>
                    </div>
                  </div>
                ))}
              </>
            )}

            <div className="pt-4 border-t">
              <Button
                onClick={handleContinue}
                disabled={!isAllAssigned || isLoadingVoices}
                size="lg"
                className="w-full"
              >
                Continue to Final Story
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              {!isAllAssigned && !isLoadingVoices && (
                <p className="text-center text-xs text-muted-foreground mt-2">
                  Please assign voices to all speakers
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VoiceAssignment;
