// All sound is synthesised with WebAudio: filtered noise bursts for gunfire, short
// oscillator blips for UI and the charge, a swept rumble for the detonation. There
// are no audio files. The context is created lazily on the first user gesture
// (the Play button), which is the only moment a browser allows it to start.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.42;
    master.connect(ctx.destination);
    const length = Math.floor(ctx.sampleRate * 0.6);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  // A noise burst through a band filter: the body of every gunshot and explosion.
  function noise({ at = 0, dur = 0.12, freq = 1800, q = 0.8, gain = 0.5, type = 'bandpass', sweepTo = null }) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t0 + dur);
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(env).connect(master);
    src.start(t0, Math.random() * 0.3);
    src.stop(t0 + dur + 0.05);
  }

  // A short oscillator tone: beeps, clicks, stingers.
  function tone({ at = 0, dur = 0.09, freq = 880, type = 'square', gain = 0.16, sweepTo = null }) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(env).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function shot(kind, distance = 0) {
    // Your own gun is loud and close; a bot's gun thins out with distance.
    const near = Math.max(0, 1 - distance / 42);
    if (kind === 'longshot') {
      noise({ dur: 0.34, freq: 900 + near * 700, gain: 0.28 + near * 0.5, sweepTo: 120 });
      tone({ dur: 0.1, freq: 160, type: 'triangle', gain: 0.2 * near + 0.05 });
    } else if (kind === 'p9') {
      noise({ dur: 0.13, freq: 2100, gain: 0.2 + near * 0.38, sweepTo: 500 });
    } else {
      noise({ dur: 0.17, freq: 1600 + near * 500, gain: 0.2 + near * 0.4, sweepTo: 300 });
    }
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.42;
      return muted;
    },
    isMuted() {
      return muted;
    },
    shot,
    dryFire() {
      tone({ dur: 0.05, freq: 1400, type: 'square', gain: 0.1 });
    },
    reloadStart() {
      tone({ dur: 0.06, freq: 500, type: 'square', gain: 0.12 });
      tone({ at: 0.14, dur: 0.05, freq: 320, type: 'square', gain: 0.1 });
    },
    reloadEnd() {
      tone({ dur: 0.05, freq: 760, type: 'square', gain: 0.13 });
      tone({ at: 0.07, dur: 0.07, freq: 980, type: 'square', gain: 0.12 });
    },
    hit(kill) {
      tone({ dur: kill ? 0.16 : 0.07, freq: kill ? 1560 : 1180, type: 'sine', gain: 0.2 });
      if (kill) tone({ at: 0.07, dur: 0.14, freq: 2080, type: 'sine', gain: 0.16 });
    },
    hurt() {
      noise({ dur: 0.1, freq: 500, type: 'lowpass', gain: 0.3 });
      tone({ dur: 0.09, freq: 140, type: 'triangle', gain: 0.18 });
    },
    footstep(run) {
      noise({ dur: 0.055, freq: run ? 700 : 500, type: 'lowpass', gain: run ? 0.07 : 0.035 });
    },
    buy() {
      tone({ dur: 0.06, freq: 990, type: 'sine', gain: 0.16 });
      tone({ at: 0.06, dur: 0.09, freq: 1320, type: 'sine', gain: 0.14 });
    },
    denied() {
      tone({ dur: 0.11, freq: 220, type: 'square', gain: 0.12 });
    },
    plantBeep(final) {
      tone({ dur: final ? 0.22 : 0.08, freq: final ? 1760 : 1174, type: 'sine', gain: 0.2 });
    },
    channelTick() {
      tone({ dur: 0.04, freq: 1560, type: 'sine', gain: 0.08 });
    },
    explosion() {
      noise({ dur: 1.1, freq: 3000, type: 'lowpass', gain: 0.95, sweepTo: 60 });
      tone({ dur: 0.8, freq: 90, type: 'sine', gain: 0.5, sweepTo: 34 });
      noise({ at: 0.05, dur: 0.3, freq: 1200, gain: 0.4, sweepTo: 200 });
    },
    grenadeBoom(distance = 0) {
      const near = Math.max(0, 1 - distance / 30);
      noise({ dur: 0.5, freq: 1600, type: 'lowpass', gain: 0.25 + near * 0.55, sweepTo: 90 });
    },
    roundWin() {
      tone({ dur: 0.12, freq: 660, type: 'triangle', gain: 0.18 });
      tone({ at: 0.11, dur: 0.12, freq: 880, type: 'triangle', gain: 0.18 });
      tone({ at: 0.22, dur: 0.24, freq: 1320, type: 'triangle', gain: 0.18 });
    },
    roundLose() {
      tone({ dur: 0.14, freq: 520, type: 'triangle', gain: 0.16 });
      tone({ at: 0.13, dur: 0.14, freq: 392, type: 'triangle', gain: 0.16 });
      tone({ at: 0.26, dur: 0.28, freq: 262, type: 'triangle', gain: 0.16 });
    },
    throwWhoosh() {
      noise({ dur: 0.16, freq: 900, gain: 0.1, sweepTo: 2400 });
    },
  };
}
