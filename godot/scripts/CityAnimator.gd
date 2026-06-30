class_name CityAnimator
extends Node2D

@export var flag_sprite: Sprite2D
@export var city_sprite: Sprite2D

## Plays the city capture animation: color flash on the city and an animated flag reveal
func play_capture(new_color: Color) -> void:
	if city_sprite:
		var city_tween = create_tween()
		# Flash white
		city_tween.tween_property(city_sprite, "modulate", Color(2, 2, 2, 1), 0.15).set_trans(Tween.TRANS_SINE)
		# Settle into the new capture color
		city_tween.tween_property(city_sprite, "modulate", new_color, 0.35).set_trans(Tween.TRANS_SINE)
		
	if flag_sprite:
		flag_sprite.modulate = new_color
		var original_pos = flag_sprite.position
		
		# Start from below and scaled down
		flag_sprite.position = original_pos + Vector2(0, 20)
		flag_sprite.scale = Vector2.ZERO
		
		var flag_tween = create_tween().set_parallel(true)
		flag_tween.tween_property(flag_sprite, "position", original_pos, 0.6).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		flag_tween.tween_property(flag_sprite, "scale", Vector2.ONE, 0.6).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
