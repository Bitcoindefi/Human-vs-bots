extends Node

enum TurnPhase { COMMIT, REVEAL, RESOLVE, END }

var current_phase: TurnPhase = TurnPhase.COMMIT
var is_processing: bool = false
var commit_actions: Dictionary = {}
var reveal_queue: Array = []
var turn_timer: Timer

func _ready() -> void:
    turn_timer = Timer.new()
    turn_timer.one_shot = true
    add_child(turn_timer)
    EventBus.connect("turn_ended", _on_turn_ended)

func start_turn(turn_number: int) -> void:
    current_phase = TurnPhase.COMMIT
    commit_actions.clear()
    reveal_queue.clear()
    is_processing = false
    
    for unit in GameState.units.values():
        unit.acted = false
        unit.selected = false
    
    for structure in GameState.structures.values():
        structure.acted = false
    
    GameState.selected_unit_id = -1
    GameState.capture_mode = false
    
    EventBus.emit_signal("turn_started", turn_number, GameState.current_phase)
    EventBus.emit_signal("hud_message", "Turn %d started" % turn_number, "info")

func commit_action(unit_id: int, action_type: String, target: Variant) -> bool:
    if current_phase != TurnPhase.COMMIT:
        return false
    
    var unit = GameState.units.get(unit_id)
    if not unit or unit.acted: return false
    
    commit_actions[unit_id] = {
        "type": action_type,
        "target": target,
        "timestamp": Time.get_ticks_msec()
    }
    unit.acted = true
    
    _check_all_committed()
    return true

func _check_all_committed() -> void:
    var living_units = GameState.get_units_by_team(GameState.Team.HUMAN)
    var all_committed = true
    for unit in living_units:
        if not unit.acted: all_committed = false; break
    
    if all_committed and living_units.size() > 0:
        _advance_to_reveal()

func _advance_to_reveal() -> void:
    current_phase = TurnPhase.REVEAL
    EventBus.emit_signal("phase_changed", GameState.Phase.BOT)
    
    _process_bot_turn()
    turn_timer.start(0.5)
    await turn_timer.timeout
    _process_reveal()

func _process_bot_turn() -> void:
    var bot_units = GameState.get_units_by_team(GameState.Team.BOT)
    for bot in bot_units:
        if not bot.is_alive(): continue
        var action = bot.decide_ai_action()
        if action: commit_actions[bot.id] = action

func _process_reveal() -> void:
    current_phase = TurnPhase.RESOLVE
    reveal_queue = commit_actions.keys()
    reveal_queue.sort_custom(func(a, b): 
        return commit_actions[a].timestamp < commit_actions[b].timestamp)
    
    for unit_id in reveal_queue:
        var action = commit_actions[unit_id]
        await _resolve_action(unit_id, action)
        await get_tree().create_timer(0.15).timeout
    
    _end_turn()

func _resolve_action(unit_id: int, action: Dictionary) -> void:
    var unit = GameState.units.get(unit_id)
    if not unit or not unit.is_alive(): return
    
    match action.type:
        "move":
            var target_coords = action.target
            if HexMath.is_passable(target_coords) and not HexMath.is_occupied(target_coords):
                var old_coords = Vector2i(unit.q, unit.r)
                unit.move_to(target_coords.x, target_coords.y)
                EventBus.emit_signal("unit_moved", unit_id, old_coords, target_coords)
        "attack":
            var target_id = action.target
            var target_unit = GameState.units.get(target_id)
            if target_unit and target_unit.is_alive():
                CombatSystem.resolve_combat(unit, target_unit)
        "conquer":
            var cell_coords = action.target
            var cell = GameState.map_cells.get(cell_coords)
            if cell and cell.terrain != GameState.Terrain.WATER:
                cell.owner = unit.team
                EventBus.emit_signal("tile_conquered", cell_coords, unit.team)
        "produce":
            var structure_id = action.target
            var structure = GameState.structures.get(structure_id)
            if structure: structure.produce_unit()

func _end_turn() -> void:
    current_phase = TurnPhase.END
    if _check_victory(): return
    
    GameState.build_proof_snapshot("turn")
    EventBus.emit_signal("turn_ended", GameState.turn_number)
    GameState.turn_number += 1
    
    if GameState.match_mode == GameState.MatchMode.HUMAN_VS_LLM:
        GameState.current_phase = GameState.Phase.PLAYER
    else:
        GameState.current_phase = GameState.Phase.SIMULATION
    
    EventBus.emit_signal("phase_changed", GameState.current_phase)
    start_turn(GameState.turn_number)

func _check_victory() -> bool:
    var humans_alive = GameState.count_living_units(GameState.Team.HUMAN)
    var bots_alive = GameState.count_living_units(GameState.Team.BOT)
    var total_land = 0
    var human_land = GameState.count_territory(GameState.Team.HUMAN)
    var bot_land = GameState.count_territory(GameState.Team.BOT)
    
    for cell in GameState.map_cells.values():
        if cell.terrain != GameState.Terrain.WATER: total_land += 1
    
    var human_win = "LLM A Wins" if GameState.match_mode == GameState.MatchMode.LLM_VS_LLM else "Humans Win"
    var bot_win = "Opponent LLM Wins" if GameState.match_mode == GameState.MatchMode.LLM_VS_LLM else "Bots Win"
    
    if bots_alive == 0:
        GameState.end_match(human_win); return true
    if humans_alive == 0:
        GameState.end_match(bot_win); return true
    
    if total_land > 0:
        if human_land >= total_land * 0.65:
            GameState.end_match("%s by Territory" % human_win); return true
        if bot_land >= total_land * 0.65:
            GameState.end_match("%s by Territory" % bot_win); return true
    
    return false

func force_end_turn() -> void:
    if current_phase == TurnPhase.COMMIT:
        _advance_to_reveal()

func _on_turn_ended(_turn_number: int) -> void: pass