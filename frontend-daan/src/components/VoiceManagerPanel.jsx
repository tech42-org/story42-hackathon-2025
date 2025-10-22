import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Loader2, Mic, StopCircle, Upload, X, Trash2 } from 'lucide-react';
import tech42TtsService from '../services/tech42TtsService';

const DEFAULT_SAMPLE_RATE = 48000;
const BUFFER_SIZE = 4096;
const SILENT_GAIN = 0;
const SKIP_INITIAL_BUFFERS = 3;

const VoiceManagerPanel = ({ onClose, onVoicesUpdated }) => {
  const [recordingSpeaker, setRecordingSpeaker] = useState(null);
  const [recordings, setRecordings] = useState({});
  const [customName, setCustomName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [microphones, setMicrophones] = useState([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const gainNodeRef = useRef(null);
  const streamRef = useRef(null);
  const pcmChunksRef = useRef([]);
  const bufferCounterRef = useRef(0);

  useEffect(() => {
    const loadDevices = async () => {
      try {
        setIsLoadingDevices(true);
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((device) => device.kind === 'audioinput');
        setMicrophones(audioInputs);
      } catch (err) {
        console.error('Failed to enumerate audio devices:', err);
        setError('Unable to access microphones. Check browser permissions.');
      } finally {
        setIsLoadingDevices(false);
      }
    };

    loadDevices();
    return () => {
      stopRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext({ sampleRate: DEFAULT_SAMPLE_RATE });
      audioContextRef.current = audioContext;

      const constraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: DEFAULT_SAMPLE_RATE,
      };

      if (selectedMic) {
        constraints.deviceId = { exact: selectedMic };
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
      streamRef.current = stream;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
      processorRef.current = processor;

      const gainNode = audioContext.createGain();
      gainNode.gain.value = SILENT_GAIN;
      gainNodeRef.current = gainNode;

      pcmChunksRef.current = [];
      bufferCounterRef.current = 0;

      processor.onaudioprocess = (event) => {
        bufferCounterRef.current += 1;
        if (bufferCounterRef.current <= SKIP_INITIAL_BUFFERS) {
          return;
        }
        const inputData = event.inputBuffer.getChannelData(0);
        pcmChunksRef.current.push(new Float32Array(inputData));
      };

      source.connect(processor);
      processor.connect(gainNode);
      gainNode.connect(audioContext.destination);
      setRecordingSpeaker('custom');
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError(`Could not access microphone: ${err.message}`);
      stopRecording();
    }
  };

  const stopRecording = () => {
    const processor = processorRef.current;
    const source = sourceRef.current;
    const gainNode = gainNodeRef.current;

    if (source) {
      source.disconnect();
    }
    if (processor) {
      processor.disconnect();
    }
    if (gainNode) {
      gainNode.disconnect();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const audioContext = audioContextRef.current;
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (!pcmChunksRef.current.length) {
      setRecordingSpeaker(null);
      return;
    }

    const totalLength = pcmChunksRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
    const pcmData = new Float32Array(totalLength);
    let offset = 0;
    pcmChunksRef.current.forEach((chunk) => {
      pcmData.set(chunk, offset);
      offset += chunk.length;
    });

    const wavBlob = encodeWAV(pcmData, DEFAULT_SAMPLE_RATE);
    const audioUrl = URL.createObjectURL(wavBlob);

    setRecordings((prev) => ({
      ...prev,
      custom: { blob: wavBlob, url: audioUrl },
    }));

    setRecordingSpeaker(null);
  };

  const encodeWAV = (pcmData, sampleRate) => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const wavDataSize = pcmData.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + wavDataSize);
    const view = new DataView(buffer);

    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + wavDataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, wavDataSize, true);

    let offset = 44;
    for (let i = 0; i < pcmData.length; i++) {
      const sample = Math.max(-1, Math.min(1, pcmData[i]));
      view.setInt16(offset + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  };

  const uploadRecording = async () => {
    const entry = recordings.custom;
    if (!entry?.blob) {
      setError('No recording available to upload.');
      return;
    }

    const name = customName.trim() || `custom_voice_${Date.now()}`;

    try {
      setIsUploading(true);
      setError(null);
      const file = new File([entry.blob], `${name}.wav`, { type: 'audio/wav' });
      await tech42TtsService.uploadVoice(file, name);
      await onVoicesUpdated?.();
      URL.revokeObjectURL(entry.url);
      setRecordings((prev) => {
        const next = { ...prev };
        delete next.custom;
        return next;
      });
      setCustomName('');
    } catch (err) {
      console.error('Failed to upload voice:', err);
      setError(err.message || 'Failed to upload recording.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const name = customName.trim() || `${file.name.replace(/\.[^/.]+$/, '')}_${Date.now()}`;

    try {
      setIsUploading(true);
      setError(null);
      await tech42TtsService.uploadVoice(file, name);
      await onVoicesUpdated?.();
      setCustomName('');
    } catch (err) {
      console.error('Failed to upload file:', err);
      setError(err.message || 'Voice upload failed.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const discardRecording = () => {
    const entry = recordings.custom;
    if (entry?.url) {
      URL.revokeObjectURL(entry.url);
    }
    setRecordings((prev) => {
      const next = { ...prev };
      delete next.custom;
      return next;
    });
    setCustomName('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200/70 bg-background shadow-[0_30px_60px_-25px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Manage Voices</h2>
            <p className="text-xs text-muted-foreground">
              Record or upload custom voices and assign them in the player.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <div className="space-y-2">
            <Label>Custom Voice Name (optional)</Label>
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g., Friendly Narrator"
              disabled={isUploading}
            />
          </div>

          <div className="space-y-2">
            <Label>Select Microphone</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedMic}
              onChange={(e) => setSelectedMic(e.target.value)}
              disabled={isLoadingDevices || recordingSpeaker === 'custom'}
            >
              <option value="">Default Microphone</option>
              {microphones.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
            {isLoadingDevices && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Detecting microphones…
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Practice Sentence</p>
              <p className="mt-1">
                Please read this sentence clearly before or while recording your voice: “The bronze violin skittered clumsily between the sleek, cold stones. The swift jump of the sleek gazelle vexed the grumpy, old judge. Flimsy copper kettles chattered near the gloomy, silent wharf.”
              </p>
            </div>
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Record a new voice</span>
                <div className="flex items-center gap-2">
                  {recordingSpeaker === 'custom' ? (
                    <Button variant="destructive" size="sm" onClick={stopRecording}>
                      <StopCircle className="mr-2 h-4 w-4" />
                      Stop
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={startRecording} disabled={isUploading}>
                      <Mic className="mr-2 h-4 w-4" />
                      Start Recording
                    </Button>
                  )}
                </div>
              </div>

              {recordings.custom && (
                <div className="rounded-lg border border-border bg-background p-3 space-y-2">
                  <audio controls src={recordings.custom.url} className="w-full" />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={uploadRecording}
                      disabled={isUploading}
                      className="flex-1"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Uploading…
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Upload Recording
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={discardRecording}
                      disabled={isUploading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
              <span className="text-sm font-medium">Upload voice file</span>
              <Input type="file" accept="audio/*" onChange={handleFileUpload} disabled={isUploading} />
              <p className="text-xs text-muted-foreground">
                Upload an existing audio sample (WAV/MP3). A custom name is optional.
              </p>
            </div>

            {error && (
              <div className="rounded-md border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

VoiceManagerPanel.propTypes = {
  onClose: PropTypes.func.isRequired,
  onVoicesUpdated: PropTypes.func,
};

export default VoiceManagerPanel;
