import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  TECH_TREE,
  advanceResearch,
  chooseBotResearch,
  createResearchState,
  getAvailableTechs,
  getTechStatus,
  getUnlockedContent,
  selectResearch,
} from './tech-model.js';

test('tech tree defines prerequisites, costs, and concrete gameplay unlocks', () => {
  assert.ok(TECH_TREE.length >= 6);

  const mining = TECH_TREE.find((tech) => tech.id === 'mining');
  const bronze = TECH_TREE.find((tech) => tech.id === 'bronze_working');
  const writing = TECH_TREE.find((tech) => tech.id === 'writing');

  assert.equal(mining.cost, 10);
  assert.deepEqual(mining.prereqs, []);
  assert.ok(mining.unlocks.improvements.includes('mine'));
  assert.deepEqual(bronze.prereqs, ['mining']);
  assert.ok(bronze.unlocks.units.includes('swordsman'));
  assert.ok(writing.unlocks.buildings.includes('library'));
});

test('research state exposes available, blocked, in-progress, and researched statuses', () => {
  let state = createResearchState();

  assert.deepEqual(getAvailableTechs(state).map((tech) => tech.id).sort(), ['archery', 'mining', 'writing']);
  assert.equal(getTechStatus(state, 'bronze_working'), 'blocked');

  state = selectResearch(state, 'mining');
  assert.equal(getTechStatus(state, 'mining'), 'in-progress');

  const result = advanceResearch(state, 10);
  assert.deepEqual(result.completed, ['mining']);
  assert.equal(getTechStatus(result.state, 'mining'), 'researched');
  assert.equal(getTechStatus(result.state, 'bronze_working'), 'available');
});

test('research progress accumulates science per turn without losing overflow', () => {
  let state = selectResearch(createResearchState(), 'archery');

  let result = advanceResearch(state, 4);
  assert.equal(result.state.current, 'archery');
  assert.equal(result.state.progress, 4);
  assert.deepEqual(result.completed, []);

  result = advanceResearch(result.state, 9);
  assert.deepEqual(result.completed, ['archery']);
  assert.equal(result.state.current, null);
  assert.equal(result.state.progress, 1);
});

test('unlocks and bot choice support the opponent research path', () => {
  let player = selectResearch(createResearchState(), 'mining');
  player = advanceResearch(player, 10).state;
  player = selectResearch(player, 'bronze_working');
  player = advanceResearch(player, 16).state;

  const unlocks = getUnlockedContent(player);
  assert.ok(unlocks.units.includes('swordsman'));
  assert.ok(unlocks.improvements.includes('mine'));

  const botChoice = chooseBotResearch(createResearchState(), 'military');
  assert.equal(botChoice, 'archery');
});

test('Civ Lite markup includes a technology panel for selectable research', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');

  assert.match(html, /id="technology"/);
  assert.match(html, /id="currentTech"/);
  assert.match(html, /id="techList"/);
});
