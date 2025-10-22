import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import Hls from 'hls.js';
import { AGENT_API_BASE_URL } from '../config';
import { Button } from './ui/button';
import { Wand2, Play, Pause, RotateCcw, Download, Loader2, Mic } from 'lucide-react';
import { getApiKey } from '../lib/apiKeyUtils';
import VoiceManagerPanel from './VoiceManagerPanel';

const API_BASE = AGENT_API_BASE_URL;

const StreamingAudioPlayer = ({
  sessionId,
  onAudioReady,
  onAudioError,
  onStatusChange,
  speakerOptions = ['Narrator']
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [audioComplete, setAudioComplete] = useState(false);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState('Ready to generate');
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hlsSupported, setHlsSupported] = useState(false);
  const [voiceOptions, setVoiceOptions] = useState([]);
  const [voiceSelections, setVoiceSelections] = useState({});
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [voiceLoadError, setVoiceLoadError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [isResetting, setIsResetting] = useState(false);
  const [showVoiceManager, setShowVoiceManager] = useState(false);

  const audioRef = useRef(null);
  const hlsRef = useRef(null);
  const statusPollInterval = useRef(null);
  const hlsLoadedSuccessRef = useRef(false);
  const audioReadyRef = useRef(false);

  // Check HLS support on mount
  useEffect(() => {
    const supported = Hls.isSupported();
    setHlsSupported(supported);
    if (!supported) {
      console.warn('HLS is not supported in this browser, falling back to native playback');
    }
  }, []);

  const resetState = useCallback(() => {
    setIsGenerating(false);
    setAudioReady(false);
    setAudioComplete(false);
    setError(null);
    setStatusMessage('Ready to generate');
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setProgress(0);
    setIsResetting(false);

    hlsLoadedSuccessRef.current = false;
    audioReadyRef.current = false;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.load();
    }

    if (statusPollInterval.current) {
      clearInterval(statusPollInterval.current);
      statusPollInterval.current = null;
    }
  }, []);

  useEffect(() => {
    const normalizedSpeakers = speakerOptions?.length ? speakerOptions : ['Narrator'];
    setVoiceSelections((prev) => {
      const nextSelections = {};
      normalizedSpeakers.forEach((speaker) => {
        nextSelections[speaker] = prev?.[speaker] ?? '';
      });
      return nextSelections;
    });
  }, [speakerOptions]);

  const buildAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('access_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const tech42TtsKey = getApiKey();
    if (tech42TtsKey) {
      headers['X-Tech42-TTS-Key'] = tech42TtsKey;
    }
    return headers;
  }, []);

  const fetchVoices = useCallback(async (force = false) => {
    try {
      setIsLoadingVoices(true);
      const response = await fetch(`${API_BASE}/api/v1/audio/voices${force ? '?force=1' : ''}`, {
        headers: buildAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error(`Failed to load voice catalog (HTTP ${response.status})`);
      }
      const data = await response.json();
      setVoiceOptions(data.voices || []);
      if (data.key_required) {
        setVoiceLoadError('Provide your Tech42 TTS API key to list available voices.');
      } else if (force) {
        setVoiceLoadError(null);
      }
    } catch (err) {
      console.error('Error fetching voices:', err);
      setVoiceOptions([]);
      setVoiceLoadError('Unable to load available voices. Using defaults.');
    } finally {
      setIsLoadingVoices(false);
    }
  }, [buildAuthHeaders]);

  useEffect(() => {
    fetchVoices();
  }, [fetchVoices]);

  useEffect(() => {
    resetState();
    if (sessionId) {
      checkInitialStatus();
    }
  }, [sessionId, resetState]);

  const checkInitialStatus = async () => {
    try {
      console.log(`🎵 [StreamingAudioPlayer] Checking initial status for session: ${sessionId}`);
      console.log(`🎵 [StreamingAudioPlayer] API_BASE: ${API_BASE}`);
      const statusResponse = await fetch(`${API_BASE}/api/v1/audio/status/${sessionId}`, {
        headers: buildAuthHeaders(),
      });
      console.log(`🎵 [StreamingAudioPlayer] Status response: ${statusResponse.status}`, statusResponse.ok);
      if (statusResponse.ok) {
        const data = await statusResponse.json();
        console.log(`🎵 [StreamingAudioPlayer] Status data:`, data);

        if (data.status === 'ready' || data.status === 'generating') {
          setAudioReady(true);
          setAudioComplete(data.status === 'ready');
          setDuration(data.duration_seconds || 0);
          console.log(`🎵 [StreamingAudioPlayer] Duration set to: ${data.duration_seconds}`);
          setStatusMessage(
            data.status === 'ready'
              ? ''
              : `⏳ Generating... (${formatTime(data.duration_seconds)} so far)`
          );
          setIsGenerating(data.status === 'generating');

          // Note: loadHLSStream() will be called by the useEffect watching audioRef
          console.log(`🎵 [StreamingAudioPlayer] Audio status updated, loadHLSStream will be triggered by useEffect`);

          if (onAudioReady && data.status === 'ready') {
            console.log(`🎵 [StreamingAudioPlayer] Calling onAudioReady callback with duration: ${data.duration_seconds}`);
            onAudioReady(data.url, data.duration_seconds);
          }
        } else {
          console.log(`🎵 [StreamingAudioPlayer] Status is: ${data.status}`);
          setStatusMessage('Ready to generate');
        }
      }
    } catch (err) {
      console.error('🎵 [StreamingAudioPlayer] Error checking initial audio status:', err);
      setError('Failed to load initial audio status.');
      if (onAudioError) onAudioError(err.message);
    }
  };

  const loadHLSStream = useCallback(() => {
    console.log(`🎵 [loadHLSStream] Called - audioRef: ${!!audioRef.current}, sessionId: ${sessionId}`);
    console.log(`🎵 [loadHLSStream] hlsLoadedSuccessRef: ${hlsLoadedSuccessRef.current}`);
    if (!audioRef.current || !sessionId) {
      console.log(`🎵 [loadHLSStream] Early return: missing audioRef or sessionId`);
      return;
    }
    if (hlsLoadedSuccessRef.current) {
      console.log(`🎵 [loadHLSStream] Early return: HLS already loaded`);
      return;
    }

    const hlsUrl = `${API_BASE}/api/v1/audio/hls/${sessionId}/stream.m3u8`;
    console.log(`🎵 [loadHLSStream] HLS URL: ${hlsUrl}`);

    if (Hls.isSupported()) {
      console.log(`🎵 [loadHLSStream] HLS is supported, initializing...`);
      if (hlsRef.current) {
        console.log(`🎵 [loadHLSStream] Destroying existing HLS instance`);
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
        xhrSetup(xhr) {
          const token = localStorage.getItem('access_token');
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }
        },
      });

      console.log(`🎵 [loadHLSStream] Loading source: ${hlsUrl}`);
      hls.loadSource(hlsUrl);
      hls.attachMedia(audioRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log(`🎵 [loadHLSStream] MANIFEST_PARSED event received`);
        setAudioReady(true);
        hlsLoadedSuccessRef.current = true;
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.log(`🎵 [loadHLSStream] HLS ERROR event:`, data);
        if (data.fatal) {
          console.log(`🎵 [loadHLSStream] Fatal error type: ${data.type}, details: ${data.details}`);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (data.details === 'manifestLoadError') {
                console.log('🎵 [loadHLSStream] Playlist not ready yet, will retry on next poll');
              } else {
                console.log('🎵 [loadHLSStream] Network error, calling startLoad()');
                hls.startLoad();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('🎵 [loadHLSStream] Media error, attempting recovery');
              hls.recoverMediaError();
              break;
            default:
              console.error('🎵 [loadHLSStream] Unrecoverable HLS error');
              setError('Failed to load audio stream');
              hls.destroy();
              break;
          }
        }
      });

      hlsRef.current = hls;
    } else if (audioRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      audioRef.current.src = hlsUrl;
      audioRef.current.load();
    } else {
      setError('Your browser does not support HLS streaming');
    }
  }, [sessionId]);

  useEffect(() => {
    if (!isGenerating) return;

    statusPollInterval.current = setInterval(async () => {
      try {
        const statusResponse = await fetch(`${API_BASE}/api/v1/audio/status/${sessionId}`, {
          headers: buildAuthHeaders(),
        });
        if (statusResponse.ok) {
          const data = await statusResponse.json();

          if (data.status === 'ready') {
            clearInterval(statusPollInterval.current);
            statusPollInterval.current = null;
            setIsGenerating(false);
            setAudioComplete(true);
            setDuration(data.duration_seconds || 0);
            setStatusMessage('');

            if (onAudioReady) {
              onAudioReady(data.url, data.duration_seconds);
            }
          } else if (data.status === 'generating') {
            setDuration(data.duration_seconds || 0);
            setStatusMessage(`⏳ Generating... (${formatTime(data.duration_seconds)} so far)`);

            const estimatedTotal = 600;
            setProgress(Math.min(95, (data.duration_seconds / estimatedTotal) * 100));

            if (data.duration_seconds > 0) {
              if (!audioReadyRef.current) {
                setAudioReady(true);
                audioReadyRef.current = true;
              }
              if (!hlsLoadedSuccessRef.current) {
                loadHLSStream();
              }
            }
          }

          if (onStatusChange) {
            onStatusChange(data.status, data.duration_seconds || 0);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);

    return () => {
      if (statusPollInterval.current) {
        clearInterval(statusPollInterval.current);
      }
    };
  }, [isGenerating, sessionId, onAudioReady, onStatusChange, loadHLSStream]);

  // Watch for audioRef becoming available and load HLS if needed
  useEffect(() => {
    console.log(`🎵 [useEffect-audioRef] audioRef.current: ${!!audioRef.current}, audioReady: ${audioReady}, audioComplete: ${audioComplete}, hlsLoadedSuccessRef: ${hlsLoadedSuccessRef.current}`);
    
    if (audioRef.current && (audioReady || audioComplete) && !hlsLoadedSuccessRef.current) {
      console.log(`🎵 [useEffect-audioRef] Conditions met, calling loadHLSStream()...`);
      loadHLSStream();
    }
  }, [audioReady, audioComplete, loadHLSStream]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handleLoadedMetadata = () => {
      if (!isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, []);

  const handleGenerate = async () => {
    if (!sessionId) {
      setError('No story session ID available');
      return;
    }

    resetState();
    setIsGenerating(true);
    setStatusMessage('🎵 Starting generation...');

    try {
      const generateUrl = `${API_BASE}/api/v1/audio/generate/${sessionId}?t=${Date.now()}`;

      const payload = {};
      const overrides = Object.entries(voiceSelections || {})
        .filter(([, value]) => Boolean(value))
        .reduce((acc, [speaker, voiceId]) => {
          acc[speaker] = voiceId;
          return acc;
        }, {});

      if (Object.keys(overrides).length > 0) {
        payload.speaker_voice_overrides = overrides;
      }

      const requestOptions = {
        method: 'POST',
        cache: 'no-store',
        headers: {
          ...buildAuthHeaders(),
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      };

      const response = await fetch(generateUrl, requestOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status === 'ready') {
        setStatusMessage('✅ Audio ready!');
        setIsGenerating(false);
        setAudioReady(true);
        setAudioComplete(true);
        setStatusMessage('');
      } else if (data.status === 'generating' || data.status === 'started') {
        setStatusMessage('⏳ Generating... (you can refresh the page)');
      } else {
        console.warn('Unexpected status:', data.status);
      }
    } catch (err) {
      console.error('Generation error:', err);
      setError(err.message || 'Failed to generate audio');
      setIsGenerating(false);
      if (onAudioError) onAudioError(err.message);
    }
  };

  const handleReset = async () => {
    if (!sessionId) {
      setError('No story session ID available');
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch(`${API_BASE}/api/v1/audio/reset/${sessionId}`, {
        method: 'POST',
        headers: {
          ...buildAuthHeaders(),
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      resetState();
      setStatusMessage('Ready to generate');
      if (onStatusChange) {
        onStatusChange('reset', 0);
      }
    } catch (err) {
      console.error('Reset error:', err);
      setError(err.message || 'Failed to reset audio');
      if (onAudioError) onAudioError(err.message);
    } finally {
      setIsResetting(false);
    }
  };

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (audio) {
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play().catch((e) => console.error('Error playing audio:', e));
      }
    }
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  const showPlayer = audioReady || duration > 0 || audioReadyRef.current;

  return (
    <div className="rounded-xl border border-border/60 bg-white/90 dark:bg-slate-900/80 backdrop-blur p-6 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Audiobook Player (HLS Streaming)</div>
        {statusMessage && <div className="text-xs text-muted-foreground">{statusMessage}</div>}
      </div>

      {!audioReady && error && (
        <div className="rounded-md border border-red-400 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 px-4 py-3 text-sm" role="alert">
          ❌ {error}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {!audioComplete && (
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            variant="primary"
            size="lg"
            className="shadow-sm px-5 gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating…</span>
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                <span>Generate Audiobook</span>
              </>
            )}
          </Button>
        )}

        {audioReady && (
          <Button
            onClick={togglePlayPause}
            variant="secondary"
            size="lg"
            className="px-5 gap-2"
          >
            {isPlaying ? (
              <>
                <Pause className="h-4 w-4" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                <span>Play</span>
              </>
            )}
          </Button>
        )}

        {audioComplete && (
          <Button
            onClick={handleReset}
            disabled={isResetting}
            variant="destructive"
            size="lg"
            className="px-5 gap-2"
          >
            {isResetting ? (
              <>
                <RotateCcw className="h-4 w-4 animate-spin" />
                <span>Resetting…</span>
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4" />
                <span>Regenerate Audio</span>
              </>
            )}
          </Button>
        )}
      </div>

      {/* Only show voice selection if audio hasn't been generated yet or after reset */}
      {speakerOptions?.length > 0 && !audioComplete && !isGenerating && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Voice Selection
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowVoiceManager(true)}
              className="gap-2"
            >
              <Mic className="h-4 w-4" />
              Manage Voices
            </Button>
          </div>
          {isLoadingVoices && (
            <div className="text-xs text-muted-foreground">Loading available voices…</div>
          )}
          {!isLoadingVoices && voiceOptions.length === 0 && (
            <div className="text-xs text-muted-foreground">No additional voices available. Defaults will be used.</div>
          )}
          {voiceLoadError && (
            <div className="text-xs text-amber-600">{voiceLoadError}</div>
          )}
          {speakerOptions.map((speaker) => (
            <div key={speaker} className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground" htmlFor={`voice-${speaker}`}>
                {speaker}
              </label>
              <select
                id={`voice-${speaker}`}
                value={voiceSelections[speaker] || ''}
                onChange={(event) =>
                  setVoiceSelections((prev) => ({
                    ...prev,
                    [speaker]: event.target.value,
                  }))
                }
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={isLoadingVoices || voiceOptions.length === 0}
              >
                <option value="">Default Voice</option>
                {voiceOptions.map((voice) => {
                  const optionValue = voice.voice_id || voice.id || voice.name || voice.label;
                  const optionLabel = voice.display_name || voice.name || voice.voice_id || optionValue;
                  return (
                    <option key={`${speaker}-${optionValue}`} value={optionValue}>
                      {optionLabel}
                    </option>
                  );
                })}
              </select>
              {voiceSelections[speaker] && (
                <div className="text-[10px] text-muted-foreground">
                  Using voice: {voiceSelections[speaker]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showPlayer && (
        <div className="mt-4 space-y-3">
          <audio ref={audioRef} controls className="w-full">
            Your browser does not support the audio element.
          </audio>
          {!hlsSupported && (
            <div className="text-xs text-amber-600 mt-1">
              ⚠️ HLS not supported, using fallback playback
            </div>
          )}

          {/* Download button - only show when audio is complete */}
          {audioComplete && (
            <Button asChild variant="secondary" size="lg" className="gap-2 px-5">
              <a href={`${API_BASE}/api/v1/audio/download/${sessionId}`} download={`story-${sessionId}-audiobook.mp3`}>
                <Download className="h-4 w-4" />
                <span>Download Audiobook</span>
              </a>
            </Button>
          )}
        </div>
      )}
      {showVoiceManager && (
        <VoiceManagerPanel
          onClose={() => setShowVoiceManager(false)}
          onVoicesUpdated={async () => {
            await fetchVoices(true);
            setShowVoiceManager(false);
          }}
        />
      )}
    </div>
  );
};

StreamingAudioPlayer.propTypes = {
  sessionId: PropTypes.string.isRequired,
  onAudioReady: PropTypes.func,
  onAudioError: PropTypes.func,
  onStatusChange: PropTypes.func,
};

export default StreamingAudioPlayer;
