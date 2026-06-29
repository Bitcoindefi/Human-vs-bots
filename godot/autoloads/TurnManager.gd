extends Node

## Owns generic turn and phase progression.
## This manager emits EventBus turn notifications and mirrors turn fields into
## GameState, but does not implement commit/reveal or gameplay-specific phases.

const SETUP: StringName = &"setup"
const START: StringName = &"start"
const MAIN: StringName = &"main"
const END: StringName = &"end"

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
	current_phase = START
	_sync_game_state()

	if has_node("/root/EventBus") and EventBus.has_method("emit_turn_started"):
		EventBus.emit_turn_started(current_turn, active_player_id)


func change_phase(next_phase: StringName) -> void:
	if next_phase == current_phase:
		return

	var previous_phase := current_phase
	current_phase = next_phase

	if has_node("/root/EventBus") and EventBus.has_method("emit_turn_phase_changed"):
		EventBus.emit_turn_phase_changed(current_turn, previous_phase, current_phase)


func end_turn() -> void:
	var ended_turn := current_turn
	var ended_player_id := active_player_id
	var previous_phase := current_phase
	current_phase = END

	if has_node("/root/EventBus") and EventBus.has_method("emit_turn_phase_changed"):
		EventBus.emit_turn_phase_changed(ended_turn, previous_phase, current_phase)
	if has_node("/root/EventBus") and EventBus.has_method("emit_turn_ended"):
		EventBus.emit_turn_ended(ended_turn, ended_player_id)


func _sync_game_state() -> void:
	if not has_node("/root/GameState"):
		return
	GameState.current_turn = current_turn
	GameState.active_player_id = active_player_id
