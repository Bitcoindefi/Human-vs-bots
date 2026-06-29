class_name FogReveal
extends Node

## Tweens the alpha of the given fog nodes to 0 and removes them
static func reveal_fog_nodes(fog_nodes: Array[Node2D], duration: float = 0.5) -> void:
	if fog_nodes.is_empty():
		return
		
	var tree = fog_nodes[0].get_tree()
	if not tree:
		return
		
	var tween = tree.create_tween().set_parallel(true)
	
	for node in fog_nodes:
		if is_instance_valid(node):
			tween.tween_property(node, "modulate:a", 0.0, duration)
			
	tween.chain().tween_callback(func():
		for node in fog_nodes:
			if is_instance_valid(node):
				node.queue_free()
	)
