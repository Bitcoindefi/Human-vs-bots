export const AUDIO_STORAGE_KEY = 'civ-lite-audio-settings-v1';

export const DEFAULT_AUDIO_SETTINGS = Object.freeze({
  muted: false,
  musicEnabled: true,
  masterVolume: 0.75,
  musicVolume: 0.55,
  sfxVolume: 0.8,
});

export const AUDIO_EVENTS = Object.freeze({
  click: 'click',
  select: 'select',
  move: 'move',
  attack: 'attack',
  build: 'build',
  endTurn: 'endTurn',
  victory: 'victory',
  defeat: 'defeat',
});

const SOUND_CUES = Object.freeze({
  click: {
    waveform: 'square',
    gain: 0.12,
    notes: [{ frequency: 520, duration: 0.045 }],
  },
  select: {
    waveform: 'sine',
    gain: 0.14,
    notes: [
      { frequency: 420, duration: 0.05 },
      { frequency: 620, duration: 0.07, delay: 0.04 },
    ],
  },
  move: {
    waveform: 'triangle',
    gain: 0.16,
    notes: [
      { frequency: 180, duration: 0.07 },
      { frequency: 240, duration: 0.08, delay: 0.05 },
    ],
  },
  attack: {
    waveform: 'sawtooth',
    gain: 0.18,
    notes: [
      { frequency: 140, duration: 0.12 },
      { frequency: 90, duration: 0.11, delay: 0.05 },
    ],
  },
  build: {
    waveform: 'triangle',
    gain: 0.15,
    notes: [
      { frequency: 260, duration: 0.08 },
      { frequency: 330, duration: 0.08, delay: 0.08 },
      { frequency: 392, duration: 0.12, delay: 0.16 },
    ],
  },
  endTurn: {
    waveform: 'sine',
    gain: 0.12,
    notes: [
      { frequency: 392, duration: 0.08 },
      { frequency: 294, duration: 0.14, delay: 0.08 },
    ],
  },
  victory: {
    waveform: 'triangle',
    gain: 0.16,
    notes: [
      { frequency: 392, duration: 0.1 },
      { frequency: 494, duration: 0.1, delay: 0.1 },
      { frequency: 587, duration: 0.12, delay: 0.2 },
      { frequency: 784, duration: 0.18, delay: 0.32 },
    ],
  },
  defeat: {
    waveform: 'sawtooth',
    gain: 0.14,
    notes: [
      { frequency: 220, duration: 0.14 },
      { frequency: 165, duration: 0.16, delay: 0.12 },
      { frequency: 110, duration: 0.2, delay: 0.28 },
    ],
  },
});

export const MUSIC_THEMES = Object.freeze({
  menu: {
    loop: true,
    beatMs: 1400,
    waveform: 'sine',
    gain: 0.035,
    progression: [
      [196, 246.94, 293.66],
      [174.61, 220, 261.63],
      [207.65, 261.63, 329.63],
      [146.83, 196, 246.94],
    ],
  },
  game: {
    loop: true,
    beatMs: 1800,
    waveform: 'triangle',
    gain: 0.032,
    progression: [
      [130.81, 196, 261.63],
      [146.83, 220, 293.66],
      [164.81, 246.94, 329.63],
      [123.47, 185, 246.94],
    ],
  },
});

function clampVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(Math.max(0, Math.min(1, number)) * 100) / 100;
}

export function normalizeAudioSettings(input = {}) {
  return {
    muted: Boolean(input.muted ?? DEFAULT_AUDIO_SETTINGS.muted),
    musicEnabled: Boolean(input.musicEnabled ?? DEFAULT_AUDIO_SETTINGS.musicEnabled),
    masterVolume: clampVolume(input.masterVolume ?? DEFAULT_AUDIO_SETTINGS.masterVolume),
    musicVolume: clampVolume(input.musicVolume ?? DEFAULT_AUDIO_SETTINGS.musicVolume),
    sfxVolume: clampVolume(input.sfxVolume ?? DEFAULT_AUDIO_SETTINGS.sfxVolume),
  };
}

export function createAudioSettings(overrides = {}) {
  return normalizeAudioSettings({ ...DEFAULT_AUDIO_SETTINGS, ...overrides });
}

export function serializeAudioSettings(settings) {
  return JSON.stringify(normalizeAudioSettings(settings));
}

export function parseAudioSettings(value) {
  if (!value) return createAudioSettings();
  try {
    return normalizeAudioSettings(JSON.parse(value));
  } catch {
    return createAudioSettings();
  }
}

export function describeSoundCue(eventName) {
  return SOUND_CUES[eventName] ?? SOUND_CUES.click;
}

function resolveAudioContextCtor() {
  return globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null;
}

function createGain(context, value = 1) {
  const gain = context.createGain();
  gain.gain.value = value;
  return gain;
}

export function createAudioSystem({
  storage = globalThis.localStorage,
  AudioContextCtor = resolveAudioContextCtor(),
  onSettingsChange = () => {},
} = {}) {
  let settings = parseAudioSettings(storage?.getItem?.(AUDIO_STORAGE_KEY));
  let context = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let musicTimer = null;
  let musicTheme = 'menu';
  let musicStep = 0;
  let unlocked = false;

  function persist() {
    storage?.setItem?.(AUDIO_STORAGE_KEY, serializeAudioSettings(settings));
  }

  function applyVolumes() {
    if (!masterGain || !musicGain || !sfxGain) return;
    masterGain.gain.value = settings.muted ? 0 : settings.masterVolume;
    musicGain.gain.value = settings.musicVolume;
    sfxGain.gain.value = settings.sfxVolume;
  }

  function ensureContext() {
    if (context || !AudioContextCtor) return context;
    context = new AudioContextCtor();
    masterGain = createGain(context, settings.masterVolume);
    musicGain = createGain(context, settings.musicVolume);
    sfxGain = createGain(context, settings.sfxVolume);
    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    masterGain.connect(context.destination);
    applyVolumes();
    return context;
  }

  function stopMusic() {
    if (musicTimer) {
      clearTimeout(musicTimer);
      musicTimer = null;
    }
  }

  function scheduleNote(destination, frequency, duration, delay, waveform, gainValue) {
    if (!context || !destination) return;
    const startAt = context.currentTime + delay;
    const endAt = startAt + duration;
    const oscillator = context.createOscillator();
    const gain = createGain(context, 0);

    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(gainValue, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.03);
  }

  function startMusic(themeName = musicTheme) {
    musicTheme = MUSIC_THEMES[themeName] ? themeName : 'game';
    stopMusic();
    if (!context || !unlocked || settings.muted || !settings.musicEnabled) return false;

    const theme = MUSIC_THEMES[musicTheme];
    const playBar = () => {
      if (!context || settings.muted || !settings.musicEnabled) return;
      const chord = theme.progression[musicStep % theme.progression.length];
      for (const [index, frequency] of chord.entries()) {
        scheduleNote(musicGain, frequency, 0.9, index * 0.035, theme.waveform, theme.gain);
      }
      musicStep += 1;
      musicTimer = setTimeout(playBar, theme.beatMs);
    };

    playBar();
    return true;
  }

  function updateSettings(patch) {
    settings = normalizeAudioSettings({ ...settings, ...patch });
    persist();
    applyVolumes();
    if (!settings.musicEnabled || settings.muted) stopMusic();
    else startMusic(musicTheme);
    onSettingsChange(settings);
    return getSettings();
  }

  function getSettings() {
    return { ...settings };
  }

  return {
    getSettings,
    getMusicTheme: () => musicTheme,
    isUnlocked: () => unlocked,
    async unlock(themeName = musicTheme) {
      if (themeName) musicTheme = MUSIC_THEMES[themeName] ? themeName : musicTheme;
      const ctx = ensureContext();
      if (!ctx) return false;
      if (ctx.state === 'suspended') await ctx.resume();
      unlocked = true;
      startMusic(musicTheme);
      onSettingsChange(settings);
      return true;
    },
    setMusicTheme(themeName) {
      musicTheme = MUSIC_THEMES[themeName] ? themeName : musicTheme;
      if (unlocked) startMusic(musicTheme);
      return musicTheme;
    },
    updateSettings,
    setMuted(muted) {
      return updateSettings({ muted });
    },
    playEvent(eventName) {
      if (!context || !unlocked || settings.muted) return false;
      const cue = describeSoundCue(eventName);
      for (const note of cue.notes) {
        scheduleNote(
          sfxGain,
          note.frequency,
          note.duration,
          note.delay ?? 0,
          cue.waveform,
          cue.gain
        );
      }
      return true;
    },
    destroy() {
      stopMusic();
      context?.close?.();
      context = null;
      unlocked = false;
    },
  };
}
