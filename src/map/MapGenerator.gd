extends Node
class_name MapGenerator

var map_width: int = GameState.MAP_COLS
var map_height: int = GameState.MAP_ROWS

func generate_map() -> Dictionary:
    GameState.map_cells.clear()
    var center_q = (map_width - 1) / 2.0
    var center_r = (map_height - 1) / 2.0
    var q_radius = 7.1; var r_radius = 5.4
    
    for r in range(map_height):
        for q in range(map_width):
            var world_pos = HexMath.hex_to_pixel(q, r)
            if world_pos.x < 30 or world_pos.y < 30: continue
            if world_pos.x > 1250 or world_pos.y > 690: continue
            
            var norm_q = (q - center_q) / q_radius
            var norm_r = (r - center_r) / r_radius
            var radial = sqrt(norm_q * norm_q + norm_r * norm_r)
            var shoreline_noise = (NoiseGenerator.noise_2d(q * 0.83 + 10, r * 0.91 + 15) - 0.5) * 0.18
            var island_shape = radial + shoreline_noise
            var force_water = q <= 1 or q >= map_width - 2 or r <= 0 or r >= map_height - 1
            
            var terrain: int
            if force_water or island_shape > 0.92:
                terrain = GameState.Terrain.WATER
            else:
                var n = NoiseGenerator.noise_2d(q + 31, r + 17)
                var elevation = 1.0 - island_shape
                if elevation > 0.44 and n > 0.82: terrain = GameState.Terrain.HILL
                elif n < 0.5: terrain = GameState.Terrain.PLAINS
                elif n < 0.82: terrain = GameState.Terrain.FOREST
                else: terrain = GameState.Terrain.DESERT
            
            var owner = GameState.Team.NEUTRAL
            if terrain != GameState.Terrain.WATER:
                if q <= center_q - 3: owner = GameState.Team.HUMAN
                elif q >= center_q + 3: owner = GameState.Team.BOT
            
            var cell = HexCell.new(Vector2i(q, r), terrain)
            cell.owner = owner
            GameState.map_cells[Vector2i(q, r)] = cell
    
    _place_structures()
    return GameState.map_cells

func _place_structures() -> bool:
    for s in GameState.structures.values():
        if is_instance_valid(s): s.queue_free()
    GameState.structures.clear()
    
    var hq = _nearest_passable(Vector2i(2, 6), 0, 5)
    var barracks = _nearest_passable(Vector2i(4, 4), 1, 7)
    var factory = _nearest_passable(Vector2i(4, 8), 1, 8)
    var tech_core = _nearest_passable(Vector2i(14, 6), 11, 17)
    
    if not hq or not barracks or not factory or not tech_core:
        push_error("MapGenerator: Failed to place structures"); return false
    
    GameState.structures["hq"] = Structure.new("hq", GameState.StructureType.HQ, GameState.Team.HUMAN, hq.coords)
    GameState.structures["barracks"] = Structure.new("barracks", GameState.StructureType.BARRACKS, GameState.Team.HUMAN, barracks.coords)
    GameState.structures["factory"] = Structure.new("factory", GameState.StructureType.FACTORY, GameState.Team.HUMAN, factory.coords)
    GameState.structures["tech-core"] = Structure.new("tech-core", GameState.StructureType.TECH_CORE, GameState.Team.BOT, tech_core.coords)
    
    hq.set_owner(GameState.Team.HUMAN)
    barracks.set_owner(GameState.Team.HUMAN)
    factory.set_owner(GameState.Team.HUMAN)
    tech_core.set_owner(GameState.Team.BOT)
    
    for id in GameState.structures.keys():
        var s = GameState.structures[id]
        EventBus.emit_signal("structure_built", id, s.structure_type, s.team)
    return true

func _nearest_passable(target: Vector2i, min_q: int, max_q: int) -> HexCell:
    var candidates = []
    for cell in GameState.map_cells.values():
        if cell.q >= min_q and cell.q <= max_q and cell.is_passable():
            candidates.append({"cell": cell, "dist": HexMath.hex_distance(target, cell.coords)})
    candidates.sort_custom(func(a, b): return a.dist < b.dist)
    if candidates.size() > 0: return candidates[0].cell
    for cell in GameState.map_cells.values():
        if cell.is_passable(): return cell
    return null

func generate_with_retries(max_attempts: int = 8) -> bool:
    for attempt in range(max_attempts):
        NoiseGenerator.set_seed(randi())
        generate_map()
        if GameState.structures.size() >= 4: return true
    return false