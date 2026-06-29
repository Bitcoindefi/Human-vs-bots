extends Node
class_name Pathfinder

class PathNode:
    extends RefCounted
    var coords: Vector2i
    var g_cost: int = 0; var h_cost: int = 0; var parent: PathNode = null
    var f_cost: int: get: return g_cost + h_cost
    func _init(_coords: Vector2i) -> void: coords = _coords

static func find_path(start: Vector2i, goal: Vector2i, max_range: int = 999) -> Array[Vector2i]:
    var open_list: Array[PathNode] = []
    var closed_set: Dictionary = {}
    var node_map: Dictionary = {}
    
    var start_node = PathNode.new(start)
    start_node.g_cost = 0; start_node.h_cost = HexMath.hex_distance(start, goal)
    open_list.append(start_node); node_map[start] = start_node
    
    while open_list.size() > 0:
        var current = open_list[0]; var current_idx = 0
        for i in range(open_list.size()):
            if open_list[i].f_cost < current.f_cost or (open_list[i].f_cost == current.f_cost and open_list[i].h_cost < current.h_cost):
                current = open_list[i]; current_idx = i
        
        open_list.remove_at(current_idx); closed_set[current.coords] = true
        if current.coords == goal: return _reconstruct_path(current)
        if current.g_cost >= max_range: continue
        
        for neighbor in HexMath.get_neighbors(current.coords):
            if closed_set.has(neighbor): continue
            if not HexMath.is_passable(neighbor): continue
            
            var cell = GameState.map_cells.get(neighbor)
            var move_cost = cell.movement_cost if cell else 1
            var new_g = current.g_cost + move_cost
            
            var neighbor_node = node_map.get(neighbor)
            if not neighbor_node:
                neighbor_node = PathNode.new(neighbor)
                neighbor_node.h_cost = HexMath.hex_distance(neighbor, goal)
                node_map[neighbor] = neighbor_node; open_list.append(neighbor_node)
            elif new_g >= neighbor_node.g_cost: continue
            
            neighbor_node.parent = current; neighbor_node.g_cost = new_g
    
    return []

static func _reconstruct_path(end_node: PathNode) -> Array[Vector2i]:
    var path: Array[Vector2i] = []
    var current = end_node
    while current != null:
        path.append(current.coords); current = current.parent
    path.reverse(); return path

static func get_reachable_cells(unit: Unit, range: int) -> Array[Vector2i]:
    var reachable: Array[Vector2i] = []
    var visited: Dictionary = {unit.coords: 0}
    var queue = [unit.coords]
    
    while queue.size() > 0:
        var current = queue.pop_front()
        var current_cost = visited[current]
        if current_cost >= range: continue
        
        for neighbor in HexMath.get_neighbors(current):
            if visited.has(neighbor): continue
            if not HexMath.is_passable(neighbor): continue
            if HexMath.is_occupied(neighbor) and neighbor != unit.coords: continue
            
            var cell = GameState.map_cells.get(neighbor)
            var move_cost = cell.movement_cost if cell else 1
            var new_cost = current_cost + move_cost
            
            if new_cost <= range:
                visited[neighbor] = new_cost; reachable.append(neighbor); queue.append(neighbor)
    return reachable

static func get_attackable_cells(unit: Unit, range: int) -> Array[Vector2i]:
    var attackable: Array[Vector2i] = []
    for cell in HexMath.get_neighbors_in_range(unit.coords, range):
        if cell == unit.coords: continue
        var target = HexMath.get_unit_at(cell)
        if target and target.team != unit.team and target.is_alive():
            attackable.append(cell)
    return attackable