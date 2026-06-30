extends Node

const POOL_SIZE := 8

const EFFECT_SCENES := {
	&"combat_explosion": preload("res://scenes/fx_combat_explosion.tscn"),
	&"city_build": preload("res://scenes/fx_city_build.tscn"),
	&"xp_gain": preload("res://scenes/fx_xp_gain.tscn"),
	&"level_up": preload("res://scenes/fx_level_up.tscn"),
	&"resource_discovery": preload("res://scenes/fx_resource_discovery.tscn"),
	&"flag_capture": preload("res://scenes/fx_flag_capture.tscn"),
}

var _available: Dictionary = {}
var _active: Dictionary = {}


func _ready() -> void:
	_warm_pools()


func get(effect_type: StringName) -> GPUParticles2D:
	if not EFFECT_SCENES.has(effect_type):
		push_warning("Unknown particle effect type: %s" % effect_type)
		return null

	var available: Array = _available[effect_type]
	if available.is_empty():
		_reclaim_oldest(effect_type)

	if available.is_empty():
		return null

	var effect: GPUParticles2D = available.pop_back()
	_active[effect_type].append(effect)
	return effect


func release(effect: GPUParticles2D) -> void:
	if effect == null or not is_instance_valid(effect):
		return

	var effect_type: StringName = effect.get_meta("particle_pool_type", &"")
	if not EFFECT_SCENES.has(effect_type):
		effect.queue_free()
		return

	_active[effect_type].erase(effect)
	if _available[effect_type].has(effect):
		return

	effect.emitting = false
	effect.visible = false
	effect.position = Vector2.ZERO

	var parent := effect.get_parent()
	if parent != null and parent != self:
		parent.remove_child(effect)
	if effect.get_parent() == null:
		add_child(effect)

	_available[effect_type].append(effect)


func play(
	effect_type: StringName,
	world_position: Vector2,
	target_parent: Node = null
) -> GPUParticles2D:
	var effect := get(effect_type)
	if effect == null:
		return null

	var parent: Node = target_parent
	if parent == null:
		parent = get_tree().current_scene
	if parent == null:
		parent = get_tree().root

	var current_parent := effect.get_parent()
	if current_parent != parent:
		if current_parent != null:
			current_parent.remove_child(effect)
		parent.add_child(effect)

	effect.global_position = world_position
	effect.visible = true
	effect.restart()
	effect.emitting = true
	return effect


func _warm_pools() -> void:
	for effect_type in EFFECT_SCENES.keys():
		_available[effect_type] = []
		_active[effect_type] = []
		for index in range(POOL_SIZE):
			var effect := _create_effect(effect_type, index)
			add_child(effect)
			_available[effect_type].append(effect)


func _create_effect(effect_type: StringName, index: int) -> GPUParticles2D:
	var effect: GPUParticles2D = EFFECT_SCENES[effect_type].instantiate()
	effect.name = "%s_%02d" % [String(effect_type), index]
	effect.visible = false
	effect.emitting = false
	effect.set_meta("particle_pool_type", effect_type)
	effect.finished.connect(_on_effect_finished.bind(effect))
	return effect


func _reclaim_oldest(effect_type: StringName) -> void:
	var active: Array = _active[effect_type]
	if active.is_empty():
		return

	var effect: GPUParticles2D = active.pop_front()
	release(effect)


func _on_effect_finished(effect: GPUParticles2D) -> void:
	release(effect)
