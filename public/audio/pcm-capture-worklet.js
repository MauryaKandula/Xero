class XeroPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.chunkSamples = 1600; // 100 ms @ 16 kHz
    this.buffer = new Int16Array(this.chunkSamples);
    this.offset = 0;
    this.resamplePhase = 0;
    this.active = true;

    this.port.onmessage = (event) => {
      if (event?.data?.type === 'stop') {
        this.active = false;
        if (this.offset > 0) {
          this.flush();
        }
      }
    };
  }

  flush() {
    if (this.offset === 0) return;
    const out = this.buffer.slice(0, this.offset);
    let sumSq = 0;
    for (let i = 0; i < out.length; i += 1) {
      const norm = out[i] / 32768;
      sumSq += norm * norm;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, out.length));
    this.port.postMessage({ pcm16: out.buffer, rms }, [out.buffer]);
    this.offset = 0;
  }

  process(inputs) {
    if (!this.active) return false;
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) return true;

    const srcRate = sampleRate || 48000;
    if (srcRate === this.targetRate) {
      for (let i = 0; i < input.length; i += 1) {
        const clamped = Math.max(-1, Math.min(1, input[i]));
        this.buffer[this.offset] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        this.offset += 1;
        if (this.offset >= this.chunkSamples) {
          this.flush();
        }
      }
      return true;
    }

    const ratio = srcRate / this.targetRate;
    let pos = this.resamplePhase;
    while (pos < input.length) {
      const idx0 = Math.floor(pos);
      const idx1 = Math.min(input.length - 1, idx0 + 1);
      const frac = pos - idx0;
      const sample = input[idx0] * (1 - frac) + input[idx1] * frac;
      const clamped = Math.max(-1, Math.min(1, sample));
      this.buffer[this.offset] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      this.offset += 1;
      if (this.offset >= this.chunkSamples) {
        this.flush();
      }
      pos += ratio;
    }
    this.resamplePhase = pos - input.length;
    return true;
  }
}

registerProcessor('xero-pcm-capture', XeroPcmCaptureProcessor);
