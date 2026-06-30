extends Node

## Owns generic turn and phase progression.
## This manager emits EventBus turn notifications and mirrors turn fields into
## GameState. Commit/reveal phases only coordinate state and WebBridge calls;
## gameplay resolution remains outside this manager.

const SETUP: StringName = &"setup"
const START: StringName = &"start"
const MAIN: StringName = &"main"
const END: StringName = &"end"
const COMMIT: StringName = &"commit"
const REVEAL: StringName = &"reveal"
const RESOLVE: StringName = &"resolve"
const FINALIZED: StringName = &"finalized"

var current_turn: int = 0
var active_player_id: StringName = &""
var current_phase: StringName = SETUP


func reset() -> void:
	current_turn = 0
	active_player_id = &""
	current_phase = SETUP
	_sync_game_state()


func begin_turn(player_id: StringName) -> void:
	current_turn += 1
	active_player_id = player_id
	var previous_phase := current_phase
	current_phase = START
	_sync_game_state()

	if has_node("/root/EventBus") and EventBus.has_method("emit_turn_started"):
		EventBus.emit_turn_started(current_turn, active_player_id)
	_emit_turn_phase_changed(previous_phase, current_phase)


func change_phase(next_phase: StringName) -> void:
	if next_phase == current_phase:
		return

	var previous_phase := current_phase
	current_phase = next_phase
	_sync_game_state()

	_emit_turn_phase_changed(previous_phase, current_phase)


func begin_commit(player_id: StringName) -> void:
	begin_turn(player_id)
	change_phase(COMMIT)


## Expected payload shape:
## {
##   "player_id": String, "turn_number": int, "commitment": Variant,
##   "context": Dictionary optional
## }
## The payload is forwarded unchanged to WebBridge.commit_action().
func submit_commit(payload: Dictionary) -> void:
	_set_game_state_metadata("last_commit_payload", payload.duplicate(true))
	_call_web_bridge(&"commit_action", payload)


func begin_reveal() -> void:
	change_phase(REVEAL)


## Expected payload shape:
## {
##   "player_id": String, "turn_number": int, "reveal": Variant,
##   "proof": Variant optional, "context": Dictionary optional
## }
## The payload is forwarded unchanged to WebBridge.reveal_action().
func submit_reveal(payload: Dictionary) -> void:
	_set_game_state_metadata("last_reveal_payload", payload.duplicate(true))
	_call_web_bridge(&"reveal_action", payload)


func resolve_turn(result: Dictionary = {}) -> void:
	_set_game_state_metadata("last_resolution_result", result.duplicate(true))
	change_phase(RESOLVE)


## Expected result shape:
## {
##   "turn_number": int, "status": String,
##   "receipt": Dictionary optional, "state": Dictionary optional
## }
## This records the caller-provided finalisation result without contract details.
func finalise_turn(result: Dictionary = {}) -> void:
	_set_game_state_metadata("last_finalisation_result", result.duplicate(true))
	change_phase(FINALIZED)


func end_turn() -> void:
	var ended_turn := current_turn
	var ended_player_id := active_player_id
	var previous_phase := current_phase
	current_phase = END
	_sync_game_state()

	_emit_turn_phase_changed(previous_phase, current_phase)
	if has_node("/root/EventBus") and EventBus.has_method("emit_turn_ended"):
		EventBus.emit_turn_ended(ended_turn, ended_player_id)


func _sync_game_state() -> void:
	if not has_node("/root/GameState"):
		return
	GameState.current_turn = current_turn
	GameState.active_player_id = active_player_id
	_set_game_state_metadata("current_phase", String(current_phase))


func _set_game_state_metadata(key: String, value) -> void:
	if not has_node("/root/GameState"):
		return
	if typeof(GameState.metadata) != TYPE_DICTIONARY:
		GameState.metadata = {}
	GameState.metadata[key] = value


func _call_web_bridge(method_name: StringName, payload: Dictionary) -> bool:
	if not has_node("/root/WebBridge"):
		_emit_web3_error(
			method_name,
			"WebBridge autoload is unavailable.",
			{"path": "/root/WebBridge"}
		)
		return false

	var bridge := get_node("/root/WebBridge")
	if not bridge.has_method(method_name):
		_emit_web3_error(
			method_name,
			"WebBridge does not implement the requested method.",
			{"method": String(method_name)}
		)
		return false

	if bridge.has_method("is_available") and bridge.call("is_available") != true:
		_emit_web3_error(
			method_name,
			"WebBridge is not available in this runtime.",
			{
				"path": "/root/WebBridge",
				"method": String(method_name),
			}
		)
		return false

	bridge.call(method_name, payload)
	return true


func _emit_turn_phase_changed(previous_phase: StringName, next_phase: StringName) -> void:
	if previous_phase == next_phase:
		return
	if has_node("/root/EventBus") and EventBus.has_method("emit_turn_phase_changed"):
		EventBus.emit_turn_phase_changed(current_turn, previous_phase, next_phase)


func _emit_web3_error(
	action: StringName,
	message: String,
	details: Dictionary = {}
) -> void:
	if has_node("/root/EventBus") and EventBus.has_method("emit_web3_error"):
		EventBus.emit_web3_error(action, message, details)
	else:
		push_warning("%s: %s" % [action, message])
