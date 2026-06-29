extends CharacterBody2D
class_name Unit

var id: int = -1
var team: int = GameState.Team.HUMAN
var unit_type: int = GameState.UnitType.WARRIOR
var q: int = 0; var r: int = 0
var coords: Vector2i:
    get: return Vector2i(q, r)
    set(v): q = v.x; r = v.y

var hp: int = 100; var hp_max: int = 100
var atk: int = 10
var movement_range: int = 1; var attack_range: int = 1; var vision_range: int = 2
var acted: bool = false; var selected: bool = false; var alive: bool = true

var sprite: Sprite2D
var selection_indicator: Sprite2D

signal unit_died(unit: Unit)
signal unit_moved(unit: Unit, from_pos: Vector2i, to_pos: Vector2i)

func _ready() -> void:
    _setup_visuals(); _update_position()

func _setup_visuals() -> void:
    sprite = Sprite2D.new()
    sprite.texture = _load_unit_texture()
    sprite.scale = Vector2(0.5, 0.5)
    add_child(sprite)
    
    selection_indicator = Sprite2D.new()
    selection_indicator.texture = load("res://assets/ui/Crosshair.png")
    selection_indicator.scale = Vector2(0.8, 0.8)
    selection_indicator.visible = false
    selection_indicator.modulate = Color(1, 1, 1, 0.5)
    add_child(selection_indicator)
    
    # HP bar
    var hp_bg = ColorRect.new()
    hp_bg.color = Color(0, 0, 0, 0.58)
    hp_bg.size = Vector2(32, 5); hp_bg.position = Vector2(-16, -22)
    add_child(hp_bg)
    
    var hp_fg = ColorRect.new()
    hp_fg.name = "HPForeground"; hp_fg.size = Vector2(32, 5)
    hp_fg.position = Vector2(-16, -22); hp_fg.color = Color(0.133, 0.765, 0.22)
    add_child(hp_fg)

func _load_unit_texture() -> Texture2D:
    var stats = GameState.get_unit_stats(unit_type)
    var path = "res://assets/units/" + stats.sprite
    return load(path) if ResourceLoader.exists(path) else load("res://assets/units/Warrior.png")

func _update_position() -> void:
    position = HexMath.hex_to_pixel(q, r)

func _update_hp_bar() -> void:
    var hp_fg = get_node_or_null("HPForeground")
    if hp_fg:
        var hp_pct = float(max(0, hp)) / hp_max
        hp_fg.size.x = 32 * hp_pct
        hp_fg.color = Color(0.133, 0.765, 0.22) if hp_pct > 0.55 else Color(0.961, 0.62, 0.043) if hp_pct > 0.3 else Color(0.937, 0.267, 0.267)

func set_selected(value: bool) -> void:
    selected = value; selection_indicator.visible = value
    if value: EventBus.emit_signal("unit_selected", id)
    else: EventBus.emit_signal("unit_deselected")

func move_to(new_q: int, new_r: int) -> void:
    var old_coords = Vector2i(q, r)
    var target_pos = HexMath.hex_to_pixel(new_q, new_r)
    var tween = create_tween()
    tween.tween_property(self, "position", target_pos, 0.3)
    tween.set_ease(Tween.EASE_OUT); tween.set_trans(Tween.TRANS_QUAD)
    q = new_q; r = new_r; acted = true
    await tween.finished
    EventBus.emit_signal("play_sfx", "unit_move")
    unit_moved.emit(self, old_coords, Vector2i(new_q, new_r))

func take_damage(damage: int) -> void:
    hp -= damage; _update_hp_bar()
    var tween = create_tween()
    tween.tween_property(sprite, "modulate", Color.RED, 0.1)
    tween.tween_property(sprite, "modulate", Color.WHITE, 0.1)
    if hp <= 0: die()

func die() -> void:
    alive = false
    var tween = create_tween()
    tween.tween_property(self, "modulate", Color(1, 1, 1, 0), 0.5)
    tween.tween_property(self, "scale", Vector2.ZERO, 0.5)
    EventBus.emit_signal("play_sfx", "unit_die")
    EventBus.emit_signal("unit_died", id)
    unit_died.emit(self)
    await tween.finished; queue_free()

func heal(amount: int) -> void:
    hp = min(hp + amount, hp_max); _update_hp_bar()

func is_alive() -> bool: return alive and hp > 0

func decide_ai_action() -> Dictionary:
    var profile = GameState.get_opponent_profile() if team == GameState.Team.BOT else GameState.get_human_side_profile()
    var style = profile.get("style", "balanced")
    var enemies = GameState.get_units_by_team(GameState.Team.HUMAN if team == GameState.Team.BOT else GameState.Team.BOT)
    if enemies.is_empty(): return {}
    
    var neighbors = HexMath.get_neighbors(coords)
    for n in neighbors:
        var unit = HexMath.get_unit_at(n)
        if unit and unit.team != team and unit.is_alive():
            return {"type": "attack", "target": unit.id}
    
    var conquer_options = []
    for n in neighbors:
        var cell = GameState.map_cells.get(n)
        if cell and cell.is_passable() and cell.owner != team and not HexMath.is_occupied(n):
            conquer_options.append(n)
    
    var should_conquer = false
    match style:
        "defensive": should_conquer = randf() < 0.7
        "swarm": should_conquer = randf() < 0.55
        _: should_conquer = randf() < 0.4
    
    if conquer_options.size() > 0 and should_conquer:
        return {"type": "conquer", "target": conquer_options[0]}
    
    var nearest = _find_nearest_enemy(enemies)
    if nearest:
        var move_options = HexMath.get_neighbors(coords)
        move_options = move_options.filter(func(n): return HexMath.is_passable(n) and not HexMath.is_occupied(n))
        if move_options.size() > 0:
            move_options.sort_custom(func(a, b):
                var da = HexMath.hex_distance(a, nearest.coords)
                var db = HexMath.hex_distance(b, nearest.coords)
                return da > db if style == "defensive" else da < db)
            return {"type": "move", "target": move_options[0]}
    return {}

func _find_nearest_enemy(enemies: Array) -> Unit:
    var best = null; var best_dist = 999
    for enemy in enemies:
        if not enemy.is_alive(): continue
        var dist = HexMath.hex_distance(coords, enemy.coords)
        if dist < best_dist: best = enemy; best_dist = dist
    return best