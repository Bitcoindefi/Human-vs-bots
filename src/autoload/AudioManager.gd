extends Node

const BUS_MASTER: String = "Master"
const BUS_MUSIC: String = "Music"
const BUS_SFX: String = "SFX"

var music_player: AudioStreamPlayer
var sfx_players: Array = []
var max_sfx_players: int = 8
var music_tracks: Dictionary = {}
var sfx_clips: Dictionary = {}
var current_music: String = ""
var music_volume: float = 0.7; var sfx_volume: float = 0.8; var master_volume: float = 1.0

func _ready() -> void:
    _setup_audio_buses(); _setup_players(); _connect_events()

func _setup_audio_buses() -> void:
    if AudioServer.get_bus_index(BUS_MUSIC) == -1:
        AudioServer.add_bus(AudioServer.bus_count)
        AudioServer.set_bus_name(AudioServer.bus_count - 1, BUS_MUSIC)
    if AudioServer.get_bus_index(BUS_SFX) == -1:
        AudioServer.add_bus(AudioServer.bus_count)
        AudioServer.set_bus_name(AudioServer.bus_count - 1, BUS_SFX)
    AudioServer.set_bus_send(AudioServer.get_bus_index(BUS_MUSIC), BUS_MASTER)
    AudioServer.set_bus_send(AudioServer.get_bus_index(BUS_SFX), BUS_MASTER)

func _setup_players() -> void:
    music_player = AudioStreamPlayer.new()
    music_player.bus = BUS_MUSIC; music_player.name = "MusicPlayer"
    add_child(music_player)
    for i in range(max_sfx_players):
        var player = AudioStreamPlayer.new()
        player.bus = BUS_SFX; player.name = "SFXPlayer_%d" % i
        add_child(player); sfx_players.append(player)

func _connect_events() -> void:
    EventBus.connect("play_sfx", _on_play_sfx)
    EventBus.connect("play_music", _on_play_music)
    EventBus.connect("stop_music", _on_stop_music)

func _on_play_sfx(sfx_name: String) -> void: play_sfx(sfx_name)
func _on_play_music(track_name: String) -> void: play_music(track_name)
func _on_stop_music() -> void: stop_music()

func play_music(track_name: String, fade_duration: float = 1.0) -> void:
    if track_name == current_music and music_player.playing: return
    var track = _load_music_track(track_name)
    if not track: push_warning("AudioManager: Track not found: " + track_name); return
    if music_player.playing and fade_duration > 0:
        var tween = create_tween(); tween.tween_property(music_player, "volume_db", -80.0, fade_duration / 2.0)
        await tween.finished; music_player.stop()
    music_player.stream = track; music_player.volume_db = -80.0; music_player.play(); current_music = track_name
    if fade_duration > 0:
        var target_db = linear_to_db(music_volume * master_volume)
        var tween = create_tween(); tween.tween_property(music_player, "volume_db", target_db, fade_duration / 2.0)

func stop_music(fade_duration: float = 0.5) -> void:
    if not music_player.playing: return
    if fade_duration > 0:
        var tween = create_tween(); tween.tween_property(music_player, "volume_db", -80.0, fade_duration)
        await tween.finished
    music_player.stop(); current_music = ""

func play_sfx(sfx_name: String, pitch_variation: float = 0.0) -> void:
    var clip = _load_sfx_clip(sfx_name)
    if not clip: push_warning("AudioManager: SFX not found: " + sfx_name); return
    for player in sfx_players:
        if not player.playing:
            player.stream = clip; player.pitch_scale = 1.0 + randf_range(-pitch_variation, pitch_variation)
            player.volume_db = linear_to_db(sfx_volume * master_volume); player.play(); return
    sfx_players[0].stop(); sfx_players[0].stream = clip; sfx_players[0].play()

func set_master_volume(volume: float) -> void:
    master_volume = clampf(volume, 0.0, 1.0)
    AudioServer.set_bus_volume_db(AudioServer.get_bus_index(BUS_MASTER), linear_to_db(master_volume))

func set_music_volume(volume: float) -> void:
    music_volume = clampf(volume, 0.0, 1.0)
    var target_db = linear_to_db(music_volume * master_volume)
    if music_player.playing:
        var tween = create_tween(); tween.tween_property(music_player, "volume_db", target_db, 0.3)
    else: music_player.volume_db = target_db

func _load_music_track(track_name: String) -> AudioStream:
    if music_tracks.has(track_name): return music_tracks[track_name]
    var path = "res://assets/audio/music/%s.ogg" % track_name
    if ResourceLoader.exists(path):
        var track = load(path); music_tracks[track_name] = track; return track
    return null

func _load_sfx_clip(sfx_name: String) -> AudioStream:
    if sfx_clips.has(sfx_name): return sfx_clips[sfx_name]
    for ext in [".wav", ".ogg", ".mp3"]:
        var path = "res://assets/audio/sfx/%s%s" % [sfx_name, ext]
        if ResourceLoader.exists(path):
            var clip = load(path); sfx_clips[sfx_name] = clip; return clip
    return null

# Shortcuts
func play_ui_click() -> void: play_sfx("ui_click", 0.1)
func play_unit_move() -> void: play_sfx("unit_move", 0.15)
func play_unit_attack() -> void: play_sfx("unit_attack", 0.2)
func play_unit_die() -> void: play_sfx("unit_die", 0.1)
func play_conquer_tile() -> void: play_sfx("conquer_tile", 0.1)
func play_turn_end() -> void: play_sfx("turn_end")
func play_victory() -> void: play_sfx("victory")
func play_defeat() -> void: play_sfx("defeat")