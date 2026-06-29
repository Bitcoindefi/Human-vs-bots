extends Camera2D
class_name GameCamera

@export var min_zoom: float = 0.75
@export var max_zoom: float = 1.8
@export var zoom_speed: float = 0.08
@export var pan_speed: float = 1.0
@export var edge_scroll_margin: int = 30
@export var edge_scroll_speed: float = 400.0

var is_panning: bool = false
var last_mouse_pos: Vector2 = Vector2.ZERO
var target_zoom: float = 1.0

func _ready() -> void:
    target_zoom = zoom.x; make_current()

func _process(delta: float) -> void:
    _handle_edge_scroll(delta); _smooth_zoom(delta)

func _input(event: InputEvent) -> void:
    if event is InputEventMouseButton:
        if event.button_index == MOUSE_BUTTON_WHEEL_UP: _zoom_in()
        elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN: _zoom_out()
        elif event.button_index == MOUSE_BUTTON_MIDDLE:
            is_panning = event.pressed
            if event.pressed: last_mouse_pos = event.position
    if event is InputEventMouseMotion and is_panning:
        position -= (event.position - last_mouse_pos) / zoom.x
        last_mouse_pos = event.position

func _handle_edge_scroll(delta: float) -> void:
    var viewport_size = get_viewport().size
    var mouse_pos = get_viewport().get_mouse_position()
    var move_dir = Vector2.ZERO
    if mouse_pos.x < edge_scroll_margin: move_dir.x = -1
    elif mouse_pos.x > viewport_size.x - edge_scroll_margin: move_dir.x = 1
    if mouse_pos.y < edge_scroll_margin: move_dir.y = -1
    elif mouse_pos.y > viewport_size.y - edge_scroll_margin: move_dir.y = 1
    if move_dir != Vector2.ZERO:
        position += move_dir * edge_scroll_speed * delta / zoom.x

func _zoom_in() -> void: target_zoom = min(target_zoom + zoom_speed, max_zoom)
func _zoom_out() -> void: target_zoom = max(target_zoom - zoom_speed, min_zoom)

func _smooth_zoom(delta: float) -> void:
    var current_zoom = zoom.x
    if abs(current_zoom - target_zoom) > 0.001:
        var new_zoom = lerp(current_zoom, target_zoom, 10.0 * delta)
        zoom = Vector2(new_zoom, new_zoom)
        EventBus.emit_signal("zoom_changed", new_zoom)

func set_zoom_level(level: float) -> void: target_zoom = clampf(level, min_zoom, max_zoom)
func reset_zoom() -> void: target_zoom = 1.0

func focus_on_position(world_pos: Vector2) -> void:
    var tween = create_tween()
    tween.set_ease(Tween.EASE_OUT); tween.set_trans(Tween.TRANS_QUAD)
    tween.tween_property(self, "position", world_pos, 0.5)

func focus_on_unit(unit: Unit) -> void:
    if unit: focus_on_position(unit.position)

func shake(intensity: float = 5.0, duration: float = 0.3) -> void:
    var original_pos = position; var tween = create_tween()
    for i in range(10):
        var offset = Vector2(randf_range(-intensity, intensity), randf_range(-intensity, intensity))
        tween.tween_property(self, "position", original_pos + offset, duration / 20)
    tween.tween_property(self, "position", original_pos, duration / 20)