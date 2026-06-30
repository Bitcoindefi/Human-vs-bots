import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, relativePath), "utf8");
}

function numberProperty(source, name) {
  const match = source.match(new RegExp(`^${name} = ([0-9.]+)$`, "m"));
  assert.ok(match, `expected ${name} in scene`);
  return Number(match[1]);
}

test("particle system is registered as Godot autoloads", () => {
  const project = read("project.godot");

  assert.match(project, /^ParticlePool="\*res:\/\/autoloads\/ParticlePool\.gd"$/m);
  assert.match(project, /^ParticleManager="\*res:\/\/autoloads\/ParticleManager\.gd"$/m);
});

test("EventBus exposes gameplay events used by particle effects", () => {
  const eventBus = read("autoloads/EventBus.gd");

  assert.match(eventBus, /^signal unit_xp_gained\(/m);
  assert.match(eventBus, /^signal resource_discovered\(/m);
  assert.match(eventBus, /func emit_unit_xp_gained\(/);
  assert.match(eventBus, /func emit_resource_discovered\(/);
});

test("particle pool exposes fixed-size get and release operations", () => {
  const pool = read("autoloads/ParticlePool.gd");

  assert.match(pool, /^const POOL_SIZE := 8$/m);
  assert.match(pool, /func get\(effect_type: StringName\) -> GPUParticles2D:/);
  assert.match(pool, /func release\(effect: GPUParticles2D\) -> void:/);
  assert.match(pool, /func play\(/);
});

test("particle manager subscribes to EventBus instead of direct callers", () => {
  const manager = read("autoloads/ParticleManager.gd");

  for (const signalName of [
    "unit_attacked",
    "unit_died",
    "unit_promoted",
    "unit_xp_gained",
    "city_built",
    "city_captured",
    "production_complete",
    "resource_discovered",
  ]) {
    assert.match(manager, new RegExp(`EventBus\\.${signalName}`));
  }

  for (const effectName of [
    "combat_explosion",
    "city_build",
    "xp_gain",
    "level_up",
    "resource_discovery",
    "flag_capture",
  ]) {
    assert.match(manager, new RegExp(`&"${effectName}"`));
  }
});

test("all particle scenes stay inside the web performance budget", () => {
  const scenes = [
    ["scenes/fx_combat_explosion.tscn", 150, 0.6],
    ["scenes/fx_city_build.tscn", 100, 1.0],
    ["scenes/fx_xp_gain.tscn", 50, 0.8],
    ["scenes/fx_level_up.tscn", 200, 1.0],
    ["scenes/fx_resource_discovery.tscn", 80, 0.9],
    ["scenes/fx_flag_capture.tscn", 120, 0.9],
  ];

  for (const [scenePath, expectedAmount, expectedLifetime] of scenes) {
    const scene = read(scenePath);

    assert.match(scene, /type="GPUParticles2D"/, `${scenePath} uses GPUParticles2D`);
    assert.equal(numberProperty(scene, "amount"), expectedAmount, `${scenePath} amount`);
    assert.equal(numberProperty(scene, "lifetime"), expectedLifetime, `${scenePath} lifetime`);
    assert.ok(expectedAmount <= 200, `${scenePath} particle budget`);
    assert.ok(expectedLifetime <= 1, `${scenePath} lifetime budget`);
    assert.match(scene, /^one_shot = true$/m, `${scenePath} is one-shot`);
    assert.match(scene, /^emitting = false$/m, `${scenePath} starts inactive`);
  }
});
