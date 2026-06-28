extends Node

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


func connect_wallet() -> void:
	if _ensure_available("connect_wallet"):
		_bridge.connectWallet()


func get_address() -> void:
	if _ensure_available("get_address"):
		_bridge.getAddress()


func commit_action(payload: Dictionary) -> void:
	if _ensure_available("commit_action"):
		_bridge.commitAction(JSON.stringify(payload))


func reveal_action(payload: Dictionary) -> void:
	if _ensure_available("reveal_action"):
		_bridge.revealAction(JSON.stringify(payload))


func generate_proof(payload: Dictionary) -> void:
	if _ensure_available("generate_proof"):
		_bridge.generateProof(JSON.stringify(payload))


func export_proof(payload: Dictionary) -> void:
	if _ensure_available("export_proof"):
		_bridge.exportProof(JSON.stringify(payload))


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


func _on_wallet_connected(arguments: Array) -> void:
	var address := _read_string_argument("connect_wallet", arguments)
	if not address.is_empty():
		wallet_connected.emit(address)


func _on_wallet_connection_failed(arguments: Array) -> void:
	var error := _read_string_argument("connect_wallet", arguments)
	if not error.is_empty():
		wallet_connection_failed.emit(error)


func _on_address_received(arguments: Array) -> void:
	var address := _read_string_argument("get_address", arguments)
	if not address.is_empty():
		address_received.emit(address)


func _on_commit_submitted(arguments: Array) -> void:
	_emit_json_result("commit_action", commit_submitted, arguments)


func _on_reveal_submitted(arguments: Array) -> void:
	_emit_json_result("reveal_action", reveal_submitted, arguments)


func _on_proof_generated(arguments: Array) -> void:
	_emit_json_result("generate_proof", proof_generated, arguments)


func _on_proof_exported(arguments: Array) -> void:
	_emit_json_result("export_proof", proof_exported, arguments)


func _on_bridge_error(arguments: Array) -> void:
	if arguments.size() < 2:
		_report_error("unknown", "Browser bridge returned an incomplete error callback.")
		return
	bridge_error.emit(str(arguments[0]), str(arguments[1]))


func _read_string_argument(action: String, arguments: Array) -> String:
	if arguments.is_empty():
		_report_error(action, "Browser bridge callback did not include a value.")
		return ""
	var value := str(arguments[0])
	if value.is_empty():
		_report_error(action, "Browser bridge callback returned an empty value.")
	return value


func _emit_json_result(action: String, target_signal: Signal, arguments: Array) -> void:
	if arguments.is_empty() or typeof(arguments[0]) != TYPE_STRING:
		_report_error(action, "Browser bridge callback must include a JSON string.")
		return

	var json := JSON.new()
	var parse_error := json.parse(arguments[0])
	if parse_error != OK:
		_report_error(
			action,
			"Browser bridge returned invalid JSON: %s" % json.get_error_message()
		)
		return
	target_signal.emit(json.data)


func _report_error(action: String, error: String) -> void:
	push_warning("%s: %s" % [action, error])
	bridge_error.emit(action, error)
