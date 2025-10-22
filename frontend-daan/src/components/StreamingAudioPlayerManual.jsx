import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import Hls from 'hls.js';
import { AGENT_API_BASE_URL } from '../config';

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

  useEffect(() => {
    const fetchVoices = async () => {
      try {
        setIsLoadingVoices(true);
        const response = await fetch(`${API_BASE}/api/v1/audio/voices`, {
          headers: buildAuthHeaders(),
        });
        if (!response.ok) {
          throw new Error(`Failed to load voice catalog (HTTP ${response.status})`);
        }
        const data = await response.json();
        setVoiceOptions(data.voices || []);
        setVoiceLoadError(null);
      } catch (err) {
        console.error('Error fetching voices:', err);
        setVoiceOptions([]);
        setVoiceLoadError('Unable to load available voices. Using defaults.');
      } finally {
        setIsLoadingVoices(false);
      }
    };

    fetchVoices();
  }, []);

  useEffect(() => {
    resetState();
    if (sessionId) {
      checkInitialStatus();
    }
  }, [sessionId, resetState]);

  const buildAuthHeaders = () => {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const checkInitialStatus = async () => {
    try {
      const statusResponse = await fetch(`${API_BASE}/api/v1/audio/status/${sessionId}`, {
        headers: buildAuthHeaders(),
      });
      if (statusResponse.ok) {
        const data = await statusResponse.json();

        if (data.status === 'ready' || data.status === 'generating') {
          setAudioReady(true);
          setAudioComplete(data.status === 'ready');
          setDuration(data.duration_seconds || 0);
          setStatusMessage(
            data.status === 'ready'
              ? `✅ Audiobook ready! (${formatTime(data.duration_seconds)})`
              : `⏳ Generating... (${formatTime(data.duration_seconds)} so far)`
          );
          setIsGenerating(data.status === 'generating');

          loadHLSStream();

          if (onAudioReady && data.status === 'ready') {
            onAudioReady(data.url, data.duration_seconds);
          }
        } else {
          setStatusMessage('Ready to generate');
        }
      }
    } catch (err) {
      console.error('Error checking initial audio status:', err);
      setError('Failed to load initial audio status.');
      if (onAudioError) onAudioError(err.message);
    }
  };

  const loadHLSStream = useCallback(() => {
    if (!audioRef.current || !sessionId) return;
    if (hlsLoadedSuccessRef.current) return;

    const hlsUrl = `${API_BASE}/api/v1/audio/hls/${sessionId}/stream.m3u8`;

    if (Hls.isSupported()) {
      if (hlsRef.current) {
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

      hls.loadSource(hlsUrl);
      hls.attachMedia(audioRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setAudioReady(true);
        hlsLoadedSuccessRef.current = true;
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (data.details === 'manifestLoadError') {
                console.log('Playlist not ready yet, will retry on next poll');
              } else {
                hls.startLoad();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              console.error('Unrecoverable HLS error');
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
            setStatusMessage(`✅ Audiobook ready! (${formatTime(data.duration_seconds)})`);

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
        <div className="text-xs text-muted-foreground">{statusMessage}</div>
      </div>

      {!audioReady && error && (
        <div className="rounded-md border border-red-400 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 px-4 py-3 text-sm" role="alert">
          ❌ {error}
        </div>
      )}

      <div className="flex items-center space-x-4 mb-4">
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={`px-4 py-2 rounded-md text-white font-medium ${
            isGenerating ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isGenerating ? '⏳ Generating...' : '🎵 Generate Audiobook'}
        </button>

        {audioReady && (
          <button
            onClick={togglePlayPause}
            className="px-4 py-2 rounded-md bg-green-600 text-white font-medium hover:bg-green-700"
          >
            {isPlaying ? '⏸️ Pause' : '▶️ Play'}
          </button>
        )}
      </div>

      {/* Only show voice selection if audio hasn't been generated yet */}
      {speakerOptions?.length > 0 && !audioReady && !isGenerating && (
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Voice Selection
          </div>
          {isLoadingVoices && (
        <div className="text-xs text-muted-foreground">Loading available voices…</div>
          )}
          {!isLoadingVoices && voiceOptions.length === 0 && (
            <div className="text-xs text-muted-foreground">No additional voices available. Defaults will be used.</div>
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
            <a
              href={`${API_BASE}/api/v1/audio/download/${sessionId}`}
              download={`story-${sessionId}-audiobook.mp3`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download Audiobook
            </a>
          )}
        </div>
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
