extends Node

signal cell_clicked(cell_coords: Vector2i)
signal cell_hovered(cell_coords: Vector2i)
signal territory_changed(coords: Vector2i, new_owner: int)
signal unit_moved(unit_id: int, from_coords: Vector2i, to_coords: Vector2i)
signal unit_attacked(attacker_id: int, defender_id: int, damage: int)
signal unit_died(unit_id: int)
signal unit_spawned(unit_id: int, unit_type: int, team: int)
signal unit_selected(unit_id: int)
signal unit_deselected
signal turn_started(turn_number: int, phase: int)
signal turn_ended(turn_number: int)
signal phase_changed(new_phase: int)
signal structure_built(structure_id: String, structure_type: int, team: int)
signal structure_acted(structure_id: String)
signal unit_produced(structure_id: String, unit_id: int)
signal resources_changed(food: int, production: int, science: int, gold: int)
signal income_calculated(food_income: int, production_income: int, 
                          science_income: int, gold_income: int)
signal wallet_connected(address: String)
signal wallet_disconnected
signal game_started_on_chain(tx_hash: String)
signal proof_submitted(proof_id: String)
signal game_ended_on_chain(tx_hash: String)
signal zk_proof_generated(proof_data: Dictionary)
signal zk_proof_verified(result: bool)
signal hud_message(message: String, message_type: String)
signal match_result_displayed(result: String)
signal zoom_changed(zoom_level: float)
signal camera_panned(position: Vector2)
signal play_sfx(sfx_name: String)
signal play_music(track_name: String)
signal stop_music
signal combat_started(attacker_id: int, defender_id: int)
signal combat_ended(attacker_id: int, defender_id: int, attacker_won: bool)
signal tile_conquered(coords: Vector2i, conqueror_team: int)
signal game_reset
signal game_paused
signal game_resumed
signal save_requested
signal load_requested(save_data: Dictionary)