import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  AUDIO_EVENTS,
  MUSIC_THEMES,
  createAudioSettings,
  describeSoundCue,
  normalizeAudioSettings,
  parseAudioSettings,
  serializeAudioSettings,
} from './audio-model.js';

test('creates safe persisted audio defaults', () => {
  const settings = createAudioSettings();

  assert.equal(settings.muted, false);
  assert.equal(settings.musicEnabled, true);
  assert.equal(settings.masterVolume, 0.75);
  assert.equal(settings.musicVolume, 0.55);
  assert.equal(settings.sfxVolume, 0.8);
});

test('normalizes stored settings before applying them', () => {
  const settings = normalizeAudioSettings({
    muted: 'yes',
    musicEnabled: false,
    masterVolume: 4,
    musicVolume: -2,
    sfxVolume: 0.333,
  });

  assert.equal(settings.muted, true);
  assert.equal(settings.musicEnabled, false);
  assert.equal(settings.masterVolume, 1);
  assert.equal(settings.musicVolume, 0);
  assert.equal(settings.sfxVolume, 0.33);
});

test('round trips settings through localStorage strings', () => {
  const source = normalizeAudioSettings({
    muted: true,
    masterVolume: 0.6,
    musicVolume: 0.25,
    sfxVolume: 0.5,
  });

  const stored = serializeAudioSettings(source);
  assert.deepEqual(parseAudioSettings(stored), source);
  assert.deepEqual(parseAudioSettings('{bad json'), createAudioSettings());
});

test('maps gameplay events to distinct sound cues', () => {
  assert.deepEqual(Object.keys(AUDIO_EVENTS).sort(), [
    'attack',
    'build',
    'click',
    'defeat',
    'endTurn',
    'move',
    'select',
    'victory',
  ]);

  assert.equal(describeSoundCue('move').waveform, 'triangle');
  assert.equal(describeSoundCue('attack').waveform, 'sawtooth');
  assert.ok(describeSoundCue('victory').notes.length > describeSoundCue('click').notes.length);
});

test('defines separate menu and gameplay music themes', () => {
  assert.equal(MUSIC_THEMES.menu.loop, true);
  assert.equal(MUSIC_THEMES.game.loop, true);
  assert.notDeepEqual(MUSIC_THEMES.menu.progression, MUSIC_THEMES.game.progression);
});

test('renders audio controls in the sidebar', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');

  for (const id of [
    'audioPanel',
    'btnMute',
    'audioTheme',
    'masterVolume',
    'musicVolume',
    'sfxVolume',
    'audioState',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});
