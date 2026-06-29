class_name FogReveal
extends Node

## Tweens the alpha of the given fog nodes to 0 and removes them
static func reveal_fog_nodes(fog_nodes: Array[Node2D], duration: float = 0.5) -> void:
	if fog_nodes.is_empty():
		return
		
	for node in fog_nodes:
		if is_instance_valid(node):
			var tween = node.create_tween()
			tween.tween_property(node, "modulate:a", 0.0, duration)
			tween.chain().tween_callback(node.queue_free)

