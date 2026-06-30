class_name UnitAnimator
extends Node2D

const DAMAGE_LABEL_SCENE = preload("res://scenes/DamageLabel.tscn")

## Moves the unit smoothly along the given path of hexagon positions
func move_along_path(path: Array[Vector2]) -> void:
	if path.is_empty():
		return
	
	var tween = create_tween()
	# Chain the tweens so they execute one after another
	tween.set_trans(Tween.TRANS_LINEAR).set_ease(Tween.EASE_IN_OUT)
	for pos in path:
		tween.tween_property(self, "position", pos, 0.2)

## Plays attack animation advancing 30% toward the target and recoiling
func play_attack(target_pos: Vector2) -> void:
	var original_pos = position
	var attack_vector = (target_pos - original_pos) * 0.3
	var advance_pos = original_pos + attack_vector
	
	var tween = create_tween()
	# Advance quickly
	tween.tween_property(self, "position", advance_pos, 0.15).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	# Recoil back to original position
	tween.tween_property(self, "position", original_pos, 0.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)

## Plays hit animation with a shake effect and spawns a floating damage label
func play_hit(damage: int) -> void:
	# Shake effect
	var tween = create_tween()
	var original_pos = position
	
	for i in range(4):
		var offset = Vector2(randf_range(-5.0, 5.0), randf_range(-5.0, 5.0))
		tween.tween_property(self, "position", original_pos + offset, 0.05)
	
	tween.tween_property(self, "position", original_pos, 0.05)
	
	# Spawn floating damage number
	if DAMAGE_LABEL_SCENE:
		var damage_label = DAMAGE_LABEL_SCENE.instantiate()
		damage_label.setup(damage)
		add_child(damage_label)

## Plays death animation fading out and scaling to zero
func play_death() -> void:
	var tween = create_tween().set_parallel(true)
	tween.tween_property(self, "modulate:a", 0.0, 0.5)
	tween.tween_property(self, "scale", Vector2.ZERO, 0.5)
	
	# After parallel tween finishes, queue_free
	tween.chain().tween_callback(self.queue_free)
