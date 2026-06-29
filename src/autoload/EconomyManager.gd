extends Node

var food: int = 0
var production: int = 0
var science: int = 0
var gold: int = 0

var food_income: int = 0
var production_income: int = 0
var science_income: int = 0
var gold_income: int = 0

const TERRAIN_YIELDS: Dictionary = {
    GameState.Terrain.PLAINS:  {"food": 2, "production": 1, "science": 1, "gold": 1},
    GameState.Terrain.FOREST:  {"food": 1, "production": 2, "science": 1, "gold": 0},
    GameState.Terrain.HILL:    {"food": 0, "production": 3, "science": 0, "gold": 1},
    GameState.Terrain.DESERT:  {"food": 0, "production": 0, "science": 2, "gold": 2},
    GameState.Terrain.WATER:   {"food": 1, "production": 0, "science": 0, "gold": 2}
}

const STRUCTURE_BONUSES: Dictionary = {
    GameState.StructureType.HQ:        {"food": 5, "production": 3, "science": 3, "gold": 3},
    GameState.StructureType.BARRACKS:  {"food": 0, "production": 2, "science": 0, "gold": 0},
    GameState.StructureType.FACTORY:   {"food": 0, "production": 5, "science": 2, "gold": 1},
    GameState.StructureType.TECH_CORE: {"food": 0, "production": 3, "science": 5, "gold": 2}
}

func _ready() -> void:
    EventBus.connect("turn_started", _on_turn_started)
    EventBus.connect("territory_changed", _on_territory_changed)
    EventBus.connect("structure_built", _on_structure_built)

func reset() -> void:
    food = 0; production = 0; science = 0; gold = 0
    _recalculate_income()
    _emit_resources_changed()

func _on_turn_started(_turn: int, _phase: int) -> void:
    food += food_income; production += production_income
    science += science_income; gold += gold_income
    _emit_resources_changed()

func _recalculate_income() -> void:
    food_income = 0; production_income = 0; science_income = 0; gold_income = 0
    
    for cell in GameState.map_cells.values():
        if cell.owner == GameState.Team.HUMAN:
            var yields = TERRAIN_YIELDS.get(cell.terrain, TERRAIN_YIELDS[GameState.Terrain.PLAINS])
            food_income += yields.food; production_income += yields.production
            science_income += yields.science; gold_income += yields.gold
    
    for structure in GameState.structures.values():
        if structure.team == GameState.Team.HUMAN:
            var bonus = STRUCTURE_BONUSES.get(structure.structure_type, {})
            food_income += bonus.get("food", 0)
            production_income += bonus.get("production", 0)
            science_income += bonus.get("science", 0)
            gold_income += bonus.get("gold", 0)
    
    EventBus.emit_signal("income_calculated", food_income, production_income, 
                          science_income, gold_income)

func _on_territory_changed(_coords: Vector2i, _new_owner: int) -> void: _recalculate_income()
func _on_structure_built(_id: String, _type: int, _team: int) -> void: _recalculate_income()

func _emit_resources_changed() -> void:
    EventBus.emit_signal("resources_changed", food, production, science, gold)

func can_afford(costs: Dictionary) -> bool:
    return (food >= costs.get("food", 0) and production >= costs.get("production", 0) and
            science >= costs.get("science", 0) and gold >= costs.get("gold", 0))

func spend(costs: Dictionary) -> bool:
    if not can_afford(costs): return false
    food -= costs.get("food", 0); production -= costs.get("production", 0)
    science -= costs.get("science", 0); gold -= costs.get("gold", 0)
    _emit_resources_changed(); return true

func add_resources(amounts: Dictionary) -> void:
    food += amounts.get("food", 0); production += amounts.get("production", 0)
    science += amounts.get("science", 0); gold += amounts.get("gold", 0)
    _emit_resources_changed()