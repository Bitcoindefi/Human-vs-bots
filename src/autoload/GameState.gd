extends Node

enum Team { HUMAN, BOT, NEUTRAL }
enum Phase { SETUP, PLAYER, BOT, SIMULATION, ENDED }
enum Terrain { PLAINS, FOREST, HILL, WATER, DESERT }
enum UnitType { WARRIOR, CAR, ROBOT }
enum StructureType { HQ, BARRACKS, FACTORY, TECH_CORE }
enum MatchMode { HUMAN_VS_LLM, LLM_VS_LLM }
enum Difficulty { EASY, NORMAL, HARD }

const HEX_SIZE: float = 34.0
const MAP_COLS: int = 18
const MAP_ROWS: int = 13

var match_mode: MatchMode = MatchMode.HUMAN_VS_LLM
var selected_ai: String = "claude-3-5-sonnet"
var selected_human_model: String = "claude-3-5-sonnet"
var selected_difficulty: Difficulty = Difficulty.NORMAL

var current_phase: Phase = Phase.SETUP
var turn_number: int = 0
var in_match: bool = false
var wallet_connected: bool = false
var wallet_address: String = ""

var map_cells: Dictionary = {}
var units: Dictionary = {}
var structures: Dictionary = {}
var proofs: Array = []
var next_unit_id: int = 1

var selected_unit_id: int = -1
var capture_mode: bool = false

const LLM_PROFILES: Dictionary = {
    "claude-3-5-sonnet": {"name": "Claude 3.5 Sonnet", "difficulty": "Hard", "atk_mul": 1.08, "hp_mul": 1.05, "style": "balanced"},
    "claude-3-opus": {"name": "Claude 3 Opus", "difficulty": "Very Hard", "atk_mul": 1.14, "hp_mul": 1.10, "style": "aggressive"},
    "clawbot-v2": {"name": "Clawbot v2", "difficulty": "Medium", "atk_mul": 1.0, "hp_mul": 1.0, "style": "swarm"},
    "gpt-4o": {"name": "OpenAI GPT-4o", "difficulty": "Hard", "atk_mul": 1.10, "hp_mul": 1.04, "style": "balanced"},
    "gpt-4.1-mini": {"name": "OpenAI GPT-4.1 mini", "difficulty": "Medium", "atk_mul": 0.98, "hp_mul": 1.03, "style": "defensive"},
    "o1-mini": {"name": "OpenAI o1-mini", "difficulty": "Very Hard", "atk_mul": 1.12, "hp_mul": 1.08, "style": "aggressive"}
}

const UNIT_STATS: Dictionary = {
    UnitType.WARRIOR: {"hp": 95, "atk": 16, "sprite": "Warrior.png", "label": "W"},
    UnitType.CAR:     {"hp": 130, "atk": 23, "sprite": "Tank.png", "label": "C"},
    UnitType.ROBOT:   {"hp": 120, "atk": 20, "sprite": "Infantry.png", "label": "R"}
}

const STRUCTURE_PRODUCTION: Dictionary = {
    StructureType.BARRACKS: [UnitType.WARRIOR],
    StructureType.FACTORY:  [UnitType.CAR],
    StructureType.TECH_CORE: [UnitType.ROBOT]
}

signal state_changed
signal unit_selected(unit_id: int)
signal match_started
signal match_ended(result: String)
signal wallet_status_changed(connected: bool)
signal turn_changed(turn: int)
signal phase_changed(phase: Phase)

func _ready() -> void:
    EventBus.connect("wallet_connected", _on_wallet_connected)
    EventBus.connect("wallet_disconnected", _on_wallet_disconnected)

func reset_game() -> void:
    current_phase = Phase.SETUP
    turn_number = 0
    in_match = false
    proofs.clear()
    selected_unit_id = -1
    capture_mode = false
    next_unit_id = 1
    
    for unit in units.values():
        if is_instance_valid(unit): unit.queue_free()
    units.clear()
    
    for structure in structures.values():
        if is_instance_valid(structure): structure.queue_free()
    structures.clear()
    
    map_cells.clear()
    state_changed.emit()

func start_match() -> void:
    in_match = true
    turn_number = 1
    current_phase = Phase.PLAYER if match_mode == MatchMode.HUMAN_VS_LLM else Phase.SIMULATION
    proofs.clear()
    match_started.emit()
    turn_changed.emit(turn_number)
    phase_changed.emit(current_phase)
    state_changed.emit()

func end_match(result: String) -> void:
    in_match = false
    current_phase = Phase.ENDED
    match_ended.emit(result)
    phase_changed.emit(current_phase)
    state_changed.emit()

func get_selected_unit() -> Unit:
    if selected_unit_id == -1: return null
    return units.get(selected_unit_id)

func get_units_by_team(team: Team) -> Array:
    var result = []
    for unit in units.values():
        if unit.team == team and unit.is_alive():
            result.append(unit)
    return result

func get_llm_profile(model_id: String) -> Dictionary:
    return LLM_PROFILES.get(model_id, LLM_PROFILES["claude-3-5-sonnet"])

func get_opponent_profile() -> Dictionary:
    return get_llm_profile(selected_ai)

func get_human_side_profile() -> Dictionary:
    if match_mode != MatchMode.LLM_VS_LLM: return {}
    return get_llm_profile(selected_human_model)

func get_unit_stats(unit_type: UnitType) -> Dictionary:
    return UNIT_STATS[unit_type]

func get_difficulty_multiplier(for_team: Team) -> float:
    match selected_difficulty:
        Difficulty.HARD: return 1.12 if for_team == Team.BOT else 0.95
        Difficulty.EASY: return 0.90 if for_team == Team.BOT else 1.06
        _: return 1.0

func count_territory(owner: Team) -> int:
    var count = 0
    for cell in map_cells.values():
        if cell.owner == owner: count += 1
    return count

func count_living_units(team: Team) -> int:
    var count = 0
    for unit in units.values():
        if unit.team == team and unit.is_alive(): count += 1
    return count

func build_proof_snapshot(tag: String = "turn") -> Dictionary:
    var payload = {
        "tag": tag,
        "turn": turn_number,
        "ai": selected_ai,
        "difficulty": _difficulty_to_string(),
        "humans_alive": count_living_units(Team.HUMAN),
        "bots_alive": count_living_units(Team.BOT),
        "human_territory": count_territory(Team.HUMAN),
        "bot_territory": count_territory(Team.BOT),
        "timestamp": Time.get_datetime_string_from_system(true),
        "proof_input_hash": _hash_proof_input()
    }
    proofs.append(payload)
    EventBus.emit_signal("proof_generated", payload)
    return payload

func _hash_proof_input() -> String:
    var input = "%d|%d|%d|%s" % [turn_number, count_territory(Team.HUMAN), 
                                    count_territory(Team.BOT), selected_ai]
    return Marshalls.utf8_to_base64(input)

func export_proofs() -> String:
    var data = {
        "game": "human-vs-bots",
        "mode": "turn-based-buildings",
        "ai": selected_ai,
        "difficulty": _difficulty_to_string(),
        "proofs": proofs
    }
    return JSON.stringify(data, "\t")

func _difficulty_to_string() -> String:
    match selected_difficulty:
        Difficulty.EASY: return "easy"
        Difficulty.HARD: return "hard"
        _: return "normal"

func _on_wallet_connected(address: String) -> void:
    wallet_connected = true
    wallet_address = address
    wallet_status_changed.emit(true)

func _on_wallet_disconnected() -> void:
    wallet_connected = false
    wallet_address = ""
    wallet_status_changed.emit(false)