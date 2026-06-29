/* global HumanVsBotsGodot */

/**
 * Browser adapter for the Godot WebBridge autoload.
 *
 * The host application configures Stellar/ZK implementations with
 * `window.HumanVsBotsBridge.configure(handlers)`. Every handler may return a
 * value or a Promise. Godot sends action payloads as JSON strings and this
 * adapter sends result payloads back as JSON strings.
 */
(function installHumanVsBotsBridge(global) {
  "use strict";

  let handlers = global.HumanVsBotsIntegrations || {};

  function configure(nextHandlers) {
    if (!nextHandlers || typeof nextHandlers !== "object") {
      throw new TypeError("HumanVsBotsBridge.configure expects an object.");
    }
    handlers = nextHandlers;
  }

  function callback(name) {
    const godotCallbacks = global.HumanVsBotsGodot;
    return godotCallbacks && typeof godotCallbacks[name] === "function"
      ? godotCallbacks[name]
      : null;
  }

  function notify(name, ...args) {
    const target = callback(name);
    if (target) {
      target(...args);
      return;
    }
    console.error(`Godot bridge callback "${name}" is not registered.`);
  }

  function errorMessage(error) {
    if (error && typeof error.message === "string") {
      return error.message;
    }
    return String(error);
  }

  function parsePayload(payload) {
    return typeof payload === "string" ? JSON.parse(payload) : payload;
  }

  function serializeResult(result) {
    return JSON.stringify(result === undefined ? null : result);
  }

  function requireHandler(name) {
    if (typeof handlers[name] !== "function") {
      throw new Error(`Bridge handler "${name}" is not configured.`);
    }
    return handlers[name];
  }

  async function run(action, handlerName, successCallback, payload) {
    try {
      const handler = requireHandler(handlerName);
      const result = arguments.length >= 4
        ? await handler(parsePayload(payload))
        : await handler();
      notify(successCallback, serializeResult(result));
      return result;
    } catch (error) {
      notify("bridgeError", action, errorMessage(error));
      return null;
    }
  }

  async function connectWallet() {
    try {
      const result = await requireHandler("connectWallet")();
      const address = typeof result === "string" ? result : result && result.address;
      if (typeof address !== "string" || address.length === 0) {
        throw new Error("connectWallet must return an address string or { address }.");
      }
      notify("walletConnected", address);
      return result;
    } catch (error) {
      const message = errorMessage(error);
      notify("walletConnectionFailed", message);
      notify("bridgeError", "connect_wallet", message);
      return null;
    }
  }

  async function getAddress() {
    try {
      const result = await requireHandler("getAddress")();
      const address = typeof result === "string" ? result : result && result.address;
      if (typeof address !== "string" || address.length === 0) {
        throw new Error("getAddress must return an address string or { address }.");
      }
      notify("addressReceived", address);
      return result;
    } catch (error) {
      notify("bridgeError", "get_address", errorMessage(error));
      return null;
    }
  }

  const bridge = {
    configure,
    connectWallet,
    getAddress,
    commitAction: (payload) =>
      run("commit_action", "commitAction", "commitSubmitted", payload),
    revealAction: (payload) =>
      run("reveal_action", "revealAction", "revealSubmitted", payload),
    generateProof: (payload) =>
      run("generate_proof", "generateProof", "proofGenerated", payload),
    exportProof: (payload) =>
      run("export_proof", "exportProof", "proofExported", payload),
  };

  global.HumanVsBotsBridge = bridge;
})(globalThis);
