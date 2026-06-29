extends RefCounted
class_name HexCell

var coords: Vector2i
var q: int: get: return coords.x
var r: int: get: return coords.y
var terrain: int = GameState.Terrain.PLAINS
var owner: int = GameState.Team.NEUTRAL
var elevation: float = 0.0
var moisture: float = 0.0
var movement_cost: int = 1
var defense_bonus: float = 1.0

func _init(_coords: Vector2i, _terrain: int = GameState.Terrain.PLAINS) -> void:
    coords = _coords; terrain = _terrain
    _update_derived_properties()

func _update_derived_properties() -> void:
    match terrain:
        GameState.Terrain.PLAINS:  movement_cost = 1; defense_bonus = 1.0
        GameState.Terrain.FOREST:  movement_cost = 2; defense_bonus = 1.14
        GameState.Terrain.HILL:    movement_cost = 2; defense_bonus = 1.22
        GameState.Terrain.DESERT:  movement_cost = 1; defense_bonus = 1.0
        GameState.Terrain.WATER:   movement_cost = 999; defense_bonus = 1.0

func set_owner(new_owner: int) -> void:
    if owner != new_owner:
        owner = new_owner
        EventBus.emit_signal("territory_changed", coords, new_owner)

func is_passable() -> bool: return terrain != GameState.Terrain.WATER