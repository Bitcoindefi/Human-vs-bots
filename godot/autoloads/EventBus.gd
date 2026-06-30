extends Node

## Centralized game-wide signal bus.
##
## Use EventBus wrapper methods for cross-scene notifications so scenes,
## managers, UI, and Web3 bridge code do not need direct node-to-node
## dependencies. Signals are grouped by domain and document their expected
## parameters next to the declaration.


# Unit events

## unit_moved(unit_id: StringName, from_hex: Vector2i, to_hex: Vector2i)
## Emitted after a unit finishes moving from one hex to another.
signal unit_moved(unit_id: StringName, from_hex: Vector2i, to_hex: Vector2i)

## unit_attacked(attacker_id: StringName, defender_id: StringName, damage: int, remaining_health: int)
## Emitted after a unit attack resolves.
signal unit_attacked(
	attacker_id: StringName,
	defender_id: StringName,
	damage: int,
	remaining_health: int
)

## unit_died(unit_id: StringName, owner_id: StringName, hex: Vector2i)
## Emitted when a unit is removed from the board.
signal unit_died(unit_id: StringName, owner_id: StringName, hex: Vector2i)

## unit_promoted(unit_id: StringName, promotion_id: StringName, bonuses: Dictionary)
## Emitted when a unit receives a promotion or upgrade.
signal unit_promoted(unit_id: StringName, promotion_id: StringName, bonuses: Dictionary)


# City events

## city_built(city_id: StringName, owner_id: StringName, hex: Vector2i)
## Emitted when a new city is founded or placed on the board.
signal city_built(city_id: StringName, owner_id: StringName, hex: Vector2i)

## city_captured(city_id: StringName, previous_owner_id: StringName, new_owner_id: StringName)
## Emitted when ownership of an existing city changes.
signal city_captured(
	city_id: StringName,
	previous_owner_id: StringName,
	new_owner_id: StringName
)

## production_complete(city_id: StringName, production_id: StringName, result: Dictionary)
## Emitted when a city's production queue completes an item.
signal production_complete(city_id: StringName, production_id: StringName, result: Dictionary)


# Turn events

## turn_started(turn_number: int, player_id: StringName)
## Emitted when a player turn begins.
signal turn_started(turn_number: int, player_id: StringName)

## turn_phase_changed(turn_number: int, previous_phase: StringName, new_phase: StringName)
## Emitted when the current turn moves from one phase label to another.
signal turn_phase_changed(
	turn_number: int,
	previous_phase: StringName,
	new_phase: StringName
)

## turn_ended(turn_number: int, player_id: StringName)
## Emitted when a player turn ends.
signal turn_ended(turn_number: int, player_id: StringName)


# Web3 events

## wallet_connected(address: String, provider: StringName)
## Emitted after a wallet connection succeeds.
signal wallet_connected(address: String, provider: StringName)

## proof_generated(proof_id: StringName, proof: Dictionary)
## Emitted after a zero-knowledge proof or proof payload is generated.
signal proof_generated(proof_id: StringName, proof: Dictionary)

## tx_confirmed(tx_hash: String, receipt: Dictionary)
## Emitted after an on-chain transaction is confirmed.
signal tx_confirmed(tx_hash: String, receipt: Dictionary)

## web3_error(action: StringName, message: String, details: Dictionary)
## Emitted when a Web3 action fails or returns an invalid result.
signal web3_error(action: StringName, message: String, details: Dictionary)


# UI events

## hex_hovered(hex: Vector2i, world_position: Vector2)
## Emitted when the pointer hover target changes to a board hex.
signal hex_hovered(hex: Vector2i, world_position: Vector2)

## unit_selected(unit_id: StringName)
## Emitted when the active UI selection changes to a unit.
signal unit_selected(unit_id: StringName)

## city_selected(city_id: StringName)
## Emitted when the active UI selection changes to a city.
signal city_selected(city_id: StringName)

## panel_opened(panel_id: StringName, context: Dictionary)
## Emitted when a UI panel is opened with optional context data.
signal panel_opened(panel_id: StringName, context: Dictionary)


func emit_unit_moved(unit_id: StringName, from_hex: Vector2i, to_hex: Vector2i) -> void:
	_log_event("unit_moved", [unit_id, from_hex, to_hex])
	unit_moved.emit(unit_id, from_hex, to_hex)


func emit_unit_attacked(
	attacker_id: StringName,
	defender_id: StringName,
	damage: int,
	remaining_health: int
) -> void:
	_log_event("unit_attacked", [attacker_id, defender_id, damage, remaining_health])
	unit_attacked.emit(attacker_id, defender_id, damage, remaining_health)


func emit_unit_died(unit_id: StringName, owner_id: StringName, hex: Vector2i) -> void:
	_log_event("unit_died", [unit_id, owner_id, hex])
	unit_died.emit(unit_id, owner_id, hex)


func emit_unit_promoted(
	unit_id: StringName,
	promotion_id: StringName,
	bonuses: Dictionary = {}
) -> void:
	_log_event("unit_promoted", [unit_id, promotion_id, bonuses])
	unit_promoted.emit(unit_id, promotion_id, bonuses)


func emit_city_built(city_id: StringName, owner_id: StringName, hex: Vector2i) -> void:
	_log_event("city_built", [city_id, owner_id, hex])
	city_built.emit(city_id, owner_id, hex)


func emit_city_captured(
	city_id: StringName,
	previous_owner_id: StringName,
	new_owner_id: StringName
) -> void:
	_log_event("city_captured", [city_id, previous_owner_id, new_owner_id])
	city_captured.emit(city_id, previous_owner_id, new_owner_id)


func emit_production_complete(
	city_id: StringName,
	production_id: StringName,
	result: Dictionary = {}
) -> void:
	_log_event("production_complete", [city_id, production_id, result])
	production_complete.emit(city_id, production_id, result)


func emit_turn_started(turn_number: int, player_id: StringName) -> void:
	_log_event("turn_started", [turn_number, player_id])
	turn_started.emit(turn_number, player_id)


func emit_turn_phase_changed(
	turn_number: int,
	previous_phase: StringName,
	new_phase: StringName
) -> void:
	_log_event("turn_phase_changed", [turn_number, previous_phase, new_phase])
	turn_phase_changed.emit(turn_number, previous_phase, new_phase)


func emit_turn_ended(turn_number: int, player_id: StringName) -> void:
	_log_event("turn_ended", [turn_number, player_id])
	turn_ended.emit(turn_number, player_id)


func emit_wallet_connected(address: String, provider: StringName = &"") -> void:
	_log_event("wallet_connected", [address, provider])
	wallet_connected.emit(address, provider)


func emit_proof_generated(proof_id: StringName, proof: Dictionary = {}) -> void:
	_log_event("proof_generated", [proof_id, proof])
	proof_generated.emit(proof_id, proof)


func emit_tx_confirmed(tx_hash: String, receipt: Dictionary = {}) -> void:
	_log_event("tx_confirmed", [tx_hash, receipt])
	tx_confirmed.emit(tx_hash, receipt)


func emit_web3_error(
	action: StringName,
	message: String,
	details: Dictionary = {}
) -> void:
	_log_event("web3_error", [action, message, details])
	web3_error.emit(action, message, details)


func emit_hex_hovered(hex: Vector2i, world_position: Vector2 = Vector2.ZERO) -> void:
	_log_event("hex_hovered", [hex, world_position])
	hex_hovered.emit(hex, world_position)


func emit_unit_selected(unit_id: StringName) -> void:
	_log_event("unit_selected", [unit_id])
	unit_selected.emit(unit_id)


func emit_city_selected(city_id: StringName) -> void:
	_log_event("city_selected", [city_id])
	city_selected.emit(city_id)


func emit_panel_opened(panel_id: StringName, context: Dictionary = {}) -> void:
	_log_event("panel_opened", [panel_id, context])
	panel_opened.emit(panel_id, context)


func _log_event(event_name: StringName, args: Array) -> void:
	if not OS.is_debug_build():
		return
	print_debug("[EventBus] %s %s" % [event_name, args])
