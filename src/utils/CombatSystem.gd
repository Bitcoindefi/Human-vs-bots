extends Node
class_name CombatSystem

static func resolve_combat(attacker: Unit, defender: Unit) -> Dictionary:
    var result = {"attacker_id": attacker.id, "defender_id": defender.id, 
                  "damage_dealt": 0, "defender_died": false, "attacker_died": false}
    
    if not attacker.is_alive() or not defender.is_alive(): return result
    if attacker.acted:
        EventBus.emit_signal("hud_message", "Unit already acted", "warn")
        return result
    
    var cell = GameState.map_cells.get(defender.coords)
    var terrain_def = cell.defense_bonus if cell else 1.0
    var damage = max(6, int(attacker.atk / terrain_def))
    result.damage_dealt = damage
    
    defender.take_damage(damage); attacker.acted = true
    
    EventBus.emit_signal("combat_started", attacker.id, defender.id)
    EventBus.emit_signal("play_sfx", "unit_attack")
    
    if not defender.is_alive():
        result.defender_died = true
        EventBus.emit_signal("combat_ended", attacker.id, defender.id, true)
        var cell_defender = GameState.map_cells.get(defender.coords)
        if cell_defender: cell_defender.set_owner(attacker.team)
    else:
        if HexMath.hex_distance(attacker.coords, defender.coords) == 1:
            var counter_damage = max(3, int(defender.atk * 0.5))
            attacker.take_damage(counter_damage)
            if not attacker.is_alive():
                result.attacker_died = true
                EventBus.emit_signal("combat_ended", attacker.id, defender.id, false)
            else:
                EventBus.emit_signal("combat_ended", attacker.id, defender.id, true)
        else:
            EventBus.emit_signal("combat_ended", attacker.id, defender.id, true)
    
    EventBus.emit_signal("unit_attacked", attacker.id, defender.id, damage)
    return result

static func can_attack(attacker: Unit, defender: Unit) -> bool:
    if not attacker.is_alive() or not defender.is_alive(): return false
    if attacker.team == defender.team: return false
    if attacker.acted: return false
    return HexMath.hex_distance(attacker.coords, defender.coords) <= attacker.attack_range

static func get_combat_preview(attacker: Unit, defender: Unit) -> Dictionary:
    var cell = GameState.map_cells.get(defender.coords)
    var terrain_def = cell.defense_bonus if cell else 1.0
    var damage = max(6, int(attacker.atk / terrain_def))
    var defender_hp_after = max(0, defender.hp - damage)
    var defender_survives = defender_hp_after > 0
    var counter_damage = 0
    if defender_survives and HexMath.hex_distance(attacker.coords, defender.coords) == 1:
        counter_damage = max(3, int(defender.atk * 0.5))
    return {
        "estimated_damage": damage,
        "defender_hp_after": defender_hp_after,
        "defender_will_die": not defender_survives,
        "counter_damage": counter_damage,
        "attacker_hp_after": max(0, attacker.hp - counter_damage),
        "attacker_will_die": max(0, attacker.hp - counter_damage) <= 0
    }