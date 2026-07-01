extends Node

## WebBridge — Godot ↔ Browser JavaScript Bridge
##
## Autoload that exchanges asynchronous Stellar/ZK requests with browser
## JavaScript via Godot's JavaScriptBridge. Active only in Web exports.
## Native/editor calls emit bridge_error instead of touching JS.
##
## All responses are routed through EventBus so UI and game logic can
## subscribe to a single signal bus.

signal wallet_connected(address: String)
signal wallet_connection_failed(error: String)
signal address_received(address: String)
signal commit_submitted(result)
signal reveal_submitted(result)
signal proof_generated(result)
signal proof_exported(result)
signal bridge_error(action: String, error: String)

const CALLBACK_NAMESPACE := "HumanVsBotsGodot"
const BRIDGE_INTERFACE := "HumanVsBotsBridge"

var _bridge = null
var _callback_interface = null
var _callback_references: Array = []

func _ready() -> void:
    if not OS.has_feature("web"):
        return

    # Create the global callback namespace
    JavaScriptBridge.eval(
        "globalThis.%s = globalThis.%s || {};" % [CALLBACK_NAMESPACE, CALLBACK_NAMESPACE]
    )
    _callback_interface = JavaScriptBridge.get_interface(CALLBACK_NAMESPACE)
    _bridge = JavaScriptBridge.get_interface(BRIDGE_INTERFACE)

    if _callback_interface == null:
        return

    _register_callback("walletConnected", _on_wallet_connected)
    _register_callback("walletConnectionFailed", _on_wallet_connection_failed)
    _register_callback("addressReceived", _on_address_received)
    _register_callback("commitSubmitted", _on_commit_submitted)
    _register_callback("revealSubmitted", _on_reveal_submitted)
    _register_callback("proofGenerated", _on_proof_generated)
    _register_callback("proofExported", _on_proof_exported)
    _register_callback("bridgeError", _on_bridge_error)

func is_available() -> bool:
    return OS.has_feature("web") and _bridge != null and _callback_interface != null

## ─── Public API ────────────────────────────────────────────────────────────

## Connect the user's Stellar wallet.
## Emits EventBus.wallet_connected(address) on success.
## Emits EventBus.web3_error(action, message, {}) on failure.
func connect_wallet() -> void:
    if _ensure_available("connect_wallet"):
        _bridge.connectWallet()

## Get the currently connected wallet address.
## Emits EventBus.wallet_connected(address, "") on success.
func get_wallet_address() -> void:
    if _ensure_available("get_wallet_address"):
        _bridge.getAddress()

## Commit a hidden action (commit-reveal pattern).
## @param hash: hex commitment hash
## Emits EventBus.tx_confirmed(tx_hash, receipt) on success.
## Emits EventBus.web3_error("commit_action", message, {}) on failure.
func commit_action(hash: String) -> void:
    if _ensure_available("commit_action"):
        _bridge.commitAction(JSON.stringify({"hash": hash}))

## Reveal a previously committed action.
## @param key: reveal key / preimage
## Emits EventBus.tx_confirmed(tx_hash, receipt) on success.
## Emits EventBus.web3_error("reveal_action", message, {}) on failure.
func reveal_action(key: String) -> void:
    if _ensure_available("reveal_action"):
        _bridge.revealAction(JSON.stringify({"key": key}))

## Generate a ZK proof from game state.
## @param state: Dictionary with proof inputs
## Emits EventBus.proof_generated(proof_id, proof_dict) on success.
## Emits EventBus.web3_error("generate_proof", message, {}) on failure.
func export_proof(state: Dictionary) -> void:
    if _ensure_available("export_proof"):
        _bridge.generateProof(JSON.stringify(state))

## ─── Internal helpers ──────────────────────────────────────────────────────

func _register_callback(callback_name: String, callable: Callable) -> void:
    var callback = JavaScriptBridge.create_callback(callable)
    _callback_references.append(callback)
    _callback_interface.set(callback_name, callback)

func _ensure_available(action: String) -> bool:
    if not OS.has_feature("web"):
        _report_error(action, "WebBridge is only available in Godot Web exports.")
        return false
    if _callback_interface == null:
        _report_error(action, "Could not register the browser callback interface.")
        return false
    if _bridge == null:
        _report_error(
            action,
            "window.%s is unavailable; load stellar_bridge.js before Godot starts." % BRIDGE_INTERFACE
        )
        return false
    return true

## ─── Callback handlers ─────────────────────────────────────────────────────

func _on_wallet_connected(arguments: Array) -> void:
    var address := _read_string_argument("connect_wallet", arguments)
    if not address.is_empty():
        wallet_connected.emit(address)
        EventBus.emit_wallet_connected(address, &"stellar")

func _on_wallet_connection_failed(arguments: Array) -> void:
    var error := _read_string_argument("connect_wallet", arguments)
    if not error.is_empty():
        wallet_connection_failed.emit(error)
        EventBus.emit_web3_error(&"connect_wallet", error, {})

func _on_address_received(arguments: Array) -> void:
    var address := _read_string_argument("get_wallet_address", arguments)
    if not address.is_empty():
        address_received.emit(address)
        EventBus.emit_wallet_connected(address, &"stellar")

func _on_commit_submitted(arguments: Array) -> void:
    var result = _parse_json_result("commit_action", arguments)
    if result != null:
        commit_submitted.emit(result)
        var tx_hash = result.get("txHash", "")
        if not tx_hash.is_empty():
            EventBus.emit_tx_confirmed(tx_hash, result)

func _on_reveal_submitted(arguments: Array) -> void:
    var result = _parse_json_result("reveal_action", arguments)
    if result != null:
        reveal_submitted.emit(result)
        var tx_hash = result.get("txHash", "")
        if not tx_hash.is_empty():
            EventBus.emit_tx_confirmed(tx_hash, result)

func _on_proof_generated(arguments: Array) -> void:
    var result = _parse_json_result("generate_proof", arguments)
    if result != null:
        proof_generated.emit(result)
        var proof_id = result.get("proofId", "proof_" + str(Time.get_unix_time_from_system()))
        EventBus.emit_proof_generated(StringName(proof_id), result)

func _on_proof_exported(arguments: Array) -> void:
    var result = _parse_json_result("export_proof", arguments)
    if result != null:
        proof_exported.emit(result)

func _on_bridge_error(arguments: Array) -> void:
    if arguments.size() < 2:
        _report_error("unknown", "Browser bridge returned an incomplete error callback.")
        return
    var action := str(arguments[0])
    var error := str(arguments[1])
    bridge_error.emit(action, error)
    EventBus.emit_web3_error(StringName(action), error, {})

## ─── Argument parsing ────────────────────────────────────────────────────────

func _read_string_argument(action: String, arguments: Array) -> String:
    if arguments.is_empty():
        _report_error(action, "Browser bridge callback did not include a value.")
        return ""
    var value := str(arguments[0])
    if value.is_empty():
        _report_error(action, "Browser bridge callback returned an empty value.")
        return value

func _parse_json_result(action: String, arguments: Array) -> Variant:
    if arguments.is_empty() or typeof(arguments[0]) != TYPE_STRING:
        _report_error(action, "Browser bridge callback must include a JSON string.")
        return null

    var json := JSON.new()
    var parse_error := json.parse(arguments[0])
    if parse_error != OK:
        _report_error(
            action,
            "Browser bridge returned invalid JSON: %s" % json.get_error_message()
        )
        return null
    return json.data

func _report_error(action: String, error: String) -> void:
    push_warning("%s: %s" % [action, error])
    bridge_error.emit(action, error)
    EventBus.emit_web3_error(StringName(action), error, {})