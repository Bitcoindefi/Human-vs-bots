extends Node

## Stores the minimal global game snapshot shared by managers and bridge code.
## This autoload intentionally avoids gameplay rules; it only normalizes,
## serializes, and restores state in a predictable dictionary format.

var map_seed: int = 0
var current_turn: int = 0
var active_player_id: StringName = &""
var players: Array = []
var units: Array = []
var cities: Array = []
var resources: Dictionary = {}
var metadata: Dictionary = {}


func reset() -> void:
	map_seed = 0
	current_turn = 0
	active_player_id = &""
	players = []
	units = []
	cities = []
	resources = {}
	metadata = {}


func serialize() -> Dictionary:
	return {
		"map_seed": map_seed,
		"current_turn": current_turn,
		"active_player_id": String(active_player_id),
		"players": _normalize_array(players),
		"units": _normalize_array(units),
		"cities": _normalize_array(cities),
		"resources": _normalize_dictionary(resources),
		"metadata": _normalize_dictionary(metadata),
	}


func deserialize(state: Dictionary) -> void:
	map_seed = int(state.get("map_seed", 0))
	current_turn = int(state.get("current_turn", 0))
	active_player_id = StringName(str(state.get("active_player_id", "")))
	players = _normalize_array(_read_array(state, "players"))
	units = _normalize_array(_read_array(state, "units"))
	cities = _normalize_array(_read_array(state, "cities"))
	resources = _normalize_dictionary(_read_dictionary(state, "resources"))
	metadata = _normalize_dictionary(_read_dictionary(state, "metadata"))


func sync_from_chain(on_chain_state: Dictionary) -> void:
	deserialize(on_chain_state)


func _read_array(source: Dictionary, key: String) -> Array:
	var value = source.get(key, [])
	if typeof(value) != TYPE_ARRAY:
		return []
	return value


func _read_dictionary(source: Dictionary, key: String) -> Dictionary:
	var value = source.get(key, {})
	if typeof(value) != TYPE_DICTIONARY:
		return {}
	return value


func _normalize_array(source: Array) -> Array:
	var normalized: Array = []
	for item in source:
		normalized.append(_normalize_value(item))
	return normalized


func _normalize_dictionary(source: Dictionary) -> Dictionary:
	var keys := source.keys()
	keys.sort_custom(func(left, right): return str(left) < str(right))

	var normalized := {}
	for key in keys:
		normalized[str(key)] = _normalize_value(source[key])
	return normalized


func _normalize_value(value):
	match typeof(value):
		TYPE_DICTIONARY:
			return _normalize_dictionary(value)
		TYPE_ARRAY:
			return _normalize_array(value)
		TYPE_STRING_NAME:
			return String(value)
		TYPE_VECTOR2I:
			return {
				"x": value.x,
				"y": value.y,
			}
		TYPE_VECTOR2:
			return {
				"x": value.x,
				"y": value.y,
			}
		TYPE_NIL, TYPE_BOOL, TYPE_INT, TYPE_FLOAT, TYPE_STRING:
			return value
		_:
			return str(value)
