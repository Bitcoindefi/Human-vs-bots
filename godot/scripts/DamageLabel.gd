class_name DamageLabel
extends Label

func setup(damage: int) -> void:
	if damage > 0:
		text = "+" + str(damage)
		self_modulate = Color(0.2, 0.8, 0.2) # Greenish for healing
	else:
		text = str(damage)
		self_modulate = Color(0.8, 0.2, 0.2) # Reddish for damage
