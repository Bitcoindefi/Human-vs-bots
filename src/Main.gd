extends Node

func _ready() -> void:
    NoiseGenerator.set_seed(randi())
    await _load_assets()
    
    var map_gen = MapGenerator.new()
    if not map_gen.generate_with_retries():
        push_error("Failed to generate map"); return
    
    var hex_map = $Game/HexMap
    if hex_map: hex_map.render_map()
    
    EconomyManager.reset()
    AudioManager.play_music("ambient_strategy")
    EventBus.emit_signal("hud_message", "Ready: produce units, conquer tiles, defeat bot tech-core.", "ok")

func _load_assets() -> void:
    for terrain_file in ["Grassland.png", "Forest.png", "Hill.png", "Coast.png", "Desert.png"]:
        var path = "res://assets/terrain/" + terrain_file
        if ResourceLoader.exists(path): ResourceLoader.load(path)
    for unit_file in ["Warrior.png", "Tank.png", "Infantry.png"]:
        var path = "res://assets/units/" + unit_file
        if ResourceLoader.exists(path): ResourceLoader.load(path)
    await get_tree().create_timer(0.1).timeout