// Vitalis ICU Web Audio Synthesizer
// Generates authentic ICU telemetry alarms and heart tones without external sound files

class TelemetryAudioEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = localStorage.getItem('icu_audio_muted') === 'true';
    this.lastAlarmTime = 0;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('icu_audio_muted', this.isMuted);
    return this.isMuted;
  }

  playCriticalAlarm() {
    if (this.isMuted) return;
    const now = Date.now();
    if (now - this.lastAlarmTime < 2500) return; // Prevent audio overload
    this.lastAlarmTime = now;

    this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // Play 3 high-urgency urgent pulses (IEC 60601-1-8 medical alarm pattern simulation)
    const tones = [880, 880, 880];
    const startTime = this.ctx.currentTime + 0.05;

    tones.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime + idx * 0.18);

      gain.gain.setValueAtTime(0, startTime + idx * 0.18);
      gain.gain.linearRampToValueAtTime(0.2, startTime + idx * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + idx * 0.18 + 0.14);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime + idx * 0.18);
      osc.stop(startTime + idx * 0.18 + 0.15);
    });
  }

  playWarningChime() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(440, this.ctx.currentTime + 0.25); // A4

    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.36);
  }
}

window.TelemetryAudio = new TelemetryAudioEngine();
