const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadBridge() {
  const callbacks = [];
  const context = {
    console,
    HumanVsBotsGodot: {
      walletConnected: (address) => callbacks.push(["walletConnected", address]),
      walletConnectionFailed: (error) => callbacks.push(["walletConnectionFailed", error]),
      addressReceived: (address) => callbacks.push(["addressReceived", address]),
      commitSubmitted: (result) => callbacks.push(["commitSubmitted", result]),
      revealSubmitted: (result) => callbacks.push(["revealSubmitted", result]),
      proofGenerated: (result) => callbacks.push(["proofGenerated", result]),
      proofExported: (result) => callbacks.push(["proofExported", result]),
      bridgeError: (action, error) => callbacks.push(["bridgeError", action, error]),
    },
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "stellar_bridge.js"), "utf8");
  vm.runInContext(source, context);
  return { bridge: context.HumanVsBotsBridge, callbacks };
}

test("routes wallet and address results to Godot callbacks", async () => {
  const { bridge, callbacks } = loadBridge();
  bridge.configure({
    connectWallet: async () => ({ address: "GCONNECTED" }),
    getAddress: async () => "GADDRESS",
  });

  await bridge.connectWallet();
  await bridge.getAddress();

  assert.deepEqual(callbacks, [
    ["walletConnected", "GCONNECTED"],
    ["addressReceived", "GADDRESS"],
  ]);
});

test("parses action payloads and serializes async results", async () => {
  const { bridge, callbacks } = loadBridge();
  bridge.configure({
    commitAction: async (payload) => ({ txHash: `commit-${payload.turn}` }),
    revealAction: async (payload) => ({ txHash: `reveal-${payload.turn}` }),
    generateProof: async (payload) => ({ proof: payload.state }),
    exportProof: async (payload) => ({ filename: `${payload.turn}.json` }),
  });

  await bridge.commitAction('{"turn":7}');
  await bridge.revealAction('{"turn":7}');
  await bridge.generateProof('{"state":"state-hash"}');
  await bridge.exportProof('{"turn":7}');

  assert.deepEqual(callbacks, [
    ["commitSubmitted", '{"txHash":"commit-7"}'],
    ["revealSubmitted", '{"txHash":"reveal-7"}'],
    ["proofGenerated", '{"proof":"state-hash"}'],
    ["proofExported", '{"filename":"7.json"}'],
  ]);
});

test("reports missing handlers without rejecting into the browser", async () => {
  const { bridge, callbacks } = loadBridge();

  await bridge.connectWallet();
  await bridge.commitAction("{}");

  assert.deepEqual(callbacks, [
    ["walletConnectionFailed", 'Bridge handler "connectWallet" is not configured.'],
    ["bridgeError", "connect_wallet", 'Bridge handler "connectWallet" is not configured.'],
    ["bridgeError", "commit_action", 'Bridge handler "commitAction" is not configured.'],
  ]);
});
