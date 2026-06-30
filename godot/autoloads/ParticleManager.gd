extends Node

const EFFECT_COMBAT_EXPLOSION := &"combat_explosion"
const EFFECT_CITY_BUILD := &"city_build"
const EFFECT_XP_GAIN := &"xp_gain"
const EFFECT_LEVEL_UP := &"level_up"
const EFFECT_RESOURCE_DISCOVERY := &"resource_discovery"
const EFFECT_FLAG_CAPTURE := &"flag_capture"

const DEFAULT_HEX_WIDTH := 72.0
const DEFAULT_HEX_HEIGHT := 62.0
const DEFAULT_HEX_ROW_OFFSET := 36.0

var _unit_positions: Dictionary = {}
var _city_positions: Dictionary = {}
var _hex_positions: Dictionary = {}


func _ready() -> void:
	_connect_events()


func register_unit_position(unit_id: StringName, world_position: Vector2) -> void:
	_unit_positions[unit_id] = world_position


func unregister_unit(unit_id: StringName) -> void:
	_unit_positions.erase(unit_id)


func register_city_position(city_id: StringName, world_position: Vector2) -> void:
	_city_positions[city_id] = world_position


func unregister_city(city_id: StringName) -> void:
	_city_positions.erase(city_id)


func register_hex_position(hex: Vector2i, world_position: Vector2) -> void:
	_hex_positions[hex] = world_position


func clear_registered_positions() -> void:
	_unit_positions.clear()
	_city_positions.clear()
	_hex_positions.clear()


func _connect_events() -> void:
	_connect_event(EventBus.unit_attacked, _on_unit_attacked)
	_connect_event(EventBus.unit_died, _on_unit_died)
	_connect_event(EventBus.unit_promoted, _on_unit_promoted)
	_connect_event(EventBus.unit_xp_gained, _on_unit_xp_gained)
	_connect_event(EventBus.city_built, _on_city_built)
	_connect_event(EventBus.city_captured, _on_city_captured)
	_connect_event(EventBus.production_complete, _on_production_complete)
	_connect_event(EventBus.resource_discovered, _on_resource_discovered)


func _connect_event(event_signal: Signal, callback: Callable) -> void:
	if not event_signal.is_connected(callback):
		event_signal.connect(callback)


func _on_unit_attacked(
	_attacker_id: StringName,
	defender_id: StringName,
	_damage: int,
	_remaining_health: int
) -> void:
	_play(EFFECT_COMBAT_EXPLOSION, _position_for_unit(defender_id))


func _on_unit_died(_unit_id: StringName, _owner_id: StringName, hex: Vector2i) -> void:
	_play(EFFECT_COMBAT_EXPLOSION, _position_for_hex(hex))


func _on_unit_promoted(
	unit_id: StringName,
	_promotion_id: StringName,
	_bonuses: Dictionary
) -> void:
	_play(EFFECT_LEVEL_UP, _position_for_unit(unit_id))


func _on_unit_xp_gained(unit_id: StringName, _amount: int, hex: Vector2i) -> void:
	_play(EFFECT_XP_GAIN, _position_for_unit_or_hex(unit_id, hex))


func _on_city_built(city_id: StringName, _owner_id: StringName, hex: Vector2i) -> void:
	var position := _position_for_hex(hex)
	register_city_position(city_id, position)
	_play(EFFECT_CITY_BUILD, position)


func _on_city_captured(
	city_id: StringName,
	_previous_owner_id: StringName,
	_new_owner_id: StringName
) -> void:
	_play(EFFECT_FLAG_CAPTURE, _position_for_city(city_id))


func _on_production_complete(
	city_id: StringName,
	_production_id: StringName,
	result: Dictionary
) -> void:
	_play(EFFECT_CITY_BUILD, _position_from_result(result, _position_for_city(city_id)))


func _on_resource_discovered(
	_resource_id: StringName,
	hex: Vector2i,
	_metadata: Dictionary
) -> void:
	_play(EFFECT_RESOURCE_DISCOVERY, _position_for_hex(hex))


func _play(effect_type: StringName, world_position: Vector2) -> void:
	ParticlePool.play(effect_type, world_position)


func _position_for_unit(unit_id: StringName) -> Vector2:
	if _unit_positions.has(unit_id):
		return _unit_positions[unit_id]
	return Vector2.ZERO


func _position_for_city(city_id: StringName) -> Vector2:
	if _city_positions.has(city_id):
		return _city_positions[city_id]
	return Vector2.ZERO


func _position_for_unit_or_hex(unit_id: StringName, hex: Vector2i) -> Vector2:
	if _unit_positions.has(unit_id):
		return _unit_positions[unit_id]
	return _position_for_hex(hex)


func _position_for_hex(hex: Vector2i) -> Vector2:
	if _hex_positions.has(hex):
		return _hex_positions[hex]

	var row_offset := DEFAULT_HEX_ROW_OFFSET if abs(hex.y) % 2 == 1 else 0.0
	return Vector2(
		float(hex.x) * DEFAULT_HEX_WIDTH + row_offset,
		float(hex.y) * DEFAULT_HEX_HEIGHT
	)


func _position_from_result(result: Dictionary, fallback: Vector2) -> Vector2:
	if result.has("world_position"):
		return _coerce_world_position(result["world_position"], fallback)
	if result.has("position"):
		return _coerce_world_position(result["position"], fallback)
	if result.has("hex") and result["hex"] is Vector2i:
		return _position_for_hex(result["hex"])
	return fallback


func _coerce_world_position(value: Variant, fallback: Vector2) -> Vector2:
	if value is Vector2:
		return value
	if value is Vector2i:
		return Vector2(value)
	if typeof(value) == TYPE_DICTIONARY and value.has("x") and value.has("y"):
		return Vector2(float(value["x"]), float(value["y"]))
	return fallback
