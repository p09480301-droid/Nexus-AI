// Audio utilities for Gemini Live Audio-to-Audio streaming

export function downsampleBuffer(
  buffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array {
  if (inputSampleRate === outputSampleRate) {
    return buffer;
  }
  if (inputSampleRate < outputSampleRate) {
    console.warn("Downsampling rate is higher than input rate, returning buffer untouched");
    return buffer;
  }
  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

export function float32ToInt16(buffer: Float32Array): Int16Array {
  let l = buffer.length;
  const buf = new Int16Array(l);
  while (l--) {
    const s = Math.max(-1, Math.min(1, buffer[l]));
    buf[l] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return buf;
}

export function int16ToBase64(buffer: Int16Array): string {
  let binary = "";
  const bytes = new Uint8Array(buffer.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToFloat32(base64: string): Float32Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private nextStartTime: number = 0;
  private gainNode: GainNode | null = null;
  private activeSources: AudioBufferSourceNode[] = [];
  private onPlaybackStateChange: (isPlaying: boolean) => void;
  private checkPlayingInterval: any = null;

  constructor(onPlaybackStateChange: (isPlaying: boolean) => void) {
    this.onPlaybackStateChange = onPlaybackStateChange;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      this.gainNode = this.ctx.createGain();
      this.gainNode.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    this.startCheckingPlaybackState();
  }

  playChunk(base64Data: string) {
    if (!this.ctx || !this.gainNode) this.init();
    const ctx = this.ctx!;
    const gainNode = this.gainNode!;

    const float32Data = base64ToFloat32(base64Data);
    if (float32Data.length === 0) return;

    const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
    audioBuffer.getChannelData(0).set(float32Data);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNode);

    const currentTime = ctx.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + 0.05;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
    this.activeSources.push(source);

    source.onended = () => {
      const idx = this.activeSources.indexOf(source);
      if (idx > -1) {
        this.activeSources.splice(idx, 1);
      }
    };
  }

  private startCheckingPlaybackState() {
    if (this.checkPlayingInterval) clearInterval(this.checkPlayingInterval);
    this.checkPlayingInterval = setInterval(() => {
      if (this.activeSources.length > 0) {
        this.onPlaybackStateChange(true);
      } else {
        this.onPlaybackStateChange(false);
      }
    }, 100);
  }

  stop() {
    if (this.checkPlayingInterval) {
      clearInterval(this.checkPlayingInterval);
      this.checkPlayingInterval = null;
    }
    this.activeSources.forEach(src => {
      try {
        src.stop();
      } catch (e) {}
    });
    this.activeSources = [];
    this.nextStartTime = 0;
    this.onPlaybackStateChange(false);
  }

  setVolume(volume: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = volume;
    }
  }

  destroy() {
    this.stop();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}

export class AudioRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onAudio: (base64PCM: string) => void;
  private onRMSChange: (rms: number) => void;

  constructor(onAudio: (base64PCM: string) => void, onRMSChange: (rms: number) => void) {
    this.onAudio = onAudio;
    this.onRMSChange = onRMSChange;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = this.ctx.createMediaStreamSource(this.stream);

    const bufferSize = 2048; // smaller buffer size for lower latency
    this.processor = this.ctx.createScriptProcessor(bufferSize, 1, 1);

    const inputSampleRate = this.ctx.sampleRate;
    const targetSampleRate = 16000;

    this.processor.onaudioprocess = (e) => {
      const inputBuffer = e.inputBuffer.getChannelData(0);

      // Calculate RMS (Root Mean Square) for visual waveform/indicator
      let sum = 0;
      for (let i = 0; i < inputBuffer.length; i++) {
        sum += inputBuffer[i] * inputBuffer[i];
      }
      const rms = Math.sqrt(sum / inputBuffer.length);
      this.onRMSChange(rms);

      // Downsample to 16kHz
      const resampled = downsampleBuffer(inputBuffer, inputSampleRate, targetSampleRate);
      // Convert to Int16
      const int16 = float32ToInt16(resampled);
      // Convert to base64
      const base64 = int16ToBase64(int16);
      this.onAudio(base64);
    };

    source.connect(this.processor);
    this.processor.connect(this.ctx.destination);
  }

  stop() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.onRMSChange(0);
  }
}
