extends Node

const DIRECTIONS: Array[Vector2i] = [
    Vector2i(1, 0), Vector2i(1, -1), Vector2i(0, -1),
    Vector2i(-1, 0), Vector2i(-1, 1), Vector2i(0, 1)
]

func hex_to_pixel(q: int, r: int, hex_size: float = GameState.HEX_SIZE) -> Vector2:
    var x = hex_size * sqrt(3.0) * (q + r / 2.0)
    var y = hex_size * 1.5 * r
    return Vector2(x, y)

func hex_to_pixelv(coords: Vector2i, hex_size: float = GameState.HEX_SIZE) -> Vector2:
    return hex_to_pixel(coords.x, coords.y, hex_size)

func pixel_to_hex(x: float, y: float, hex_size: float = GameState.HEX_SIZE) -> Vector2i:
    var q = (sqrt(3.0) / 3.0 * x - 1.0 / 3.0 * y) / hex_size
    var r = (2.0 / 3.0 * y) / hex_size
    return hex_round(q, r)

func hex_round(q: float, r: float) -> Vector2i:
    var s = -q - r
    var rq = round(q); var rr = round(r); var rs = round(s)
    var dq = abs(rq - q); var dr = abs(rr - r); var ds = abs(rs - s)
    if dq > dr and dq > ds: rq = -rr - rs
    elif dr > ds: rr = -rq - rs
    return Vector2i(int(rq), int(rr))

func hex_distance(a: Vector2i, b: Vector2i) -> int:
    return (abs(a.x - b.x) + abs(a.y - b.y) + abs((-a.x - a.y) - (-b.x - b.y))) / 2

func get_neighbors(coords: Vector2i) -> Array[Vector2i]:
    var neighbors: Array[Vector2i] = []
    for dir in DIRECTIONS: neighbors.append(coords + dir)
    return neighbors

func get_neighbors_in_range(coords: Vector2i, range_dist: int) -> Array[Vector2i]:
    var results: Array[Vector2i] = []
    for q in range(-range_dist, range_dist + 1):
        for r in range(max(-range_dist, -q - range_dist), min(range_dist, -q + range_dist) + 1):
            results.append(coords + Vector2i(q, r))
    return results

func is_passable(coords: Vector2i) -> bool:
    var cell = GameState.map_cells.get(coords)
    if not cell: return false
    return cell.terrain != GameState.Terrain.WATER

func is_occupied(coords: Vector2i) -> bool:
    for unit in GameState.units.values():
        if unit.is_alive() and unit.q == coords.x and unit.r == coords.y:
            return true
    return false

func get_unit_at(coords: Vector2i) -> Unit:
    for unit in GameState.units.values():
        if unit.is_alive() and unit.q == coords.x and unit.r == coords.y:
            return unit
    return null