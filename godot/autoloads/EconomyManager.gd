extends Node

## Calculates simple per-turn resource yields from city data.
## Cities may provide a `yields` dictionary; numeric values are summed by key
## and applied to GameState.resources without adding broader economy rules.


func calculate_yields(cities: Array = []) -> Dictionary:
	var source_cities := cities
	if source_cities.is_empty() and has_node("/root/GameState"):
		source_cities = GameState.cities

	var totals := {}
	for city in source_cities:
		if typeof(city) != TYPE_DICTIONARY:
			continue

		var city_yields = city.get("yields", {})
		if typeof(city_yields) != TYPE_DICTIONARY:
			continue

		for resource_key in city_yields.keys():
			var amount = city_yields[resource_key]
			if typeof(amount) != TYPE_INT and typeof(amount) != TYPE_FLOAT:
				continue

			var key := str(resource_key)
			totals[key] = totals.get(key, 0) + amount

	return _normalize_numeric_dictionary(totals)


func apply_turn_yields() -> Dictionary:
	var turn_yields := calculate_yields()
	if not has_node("/root/GameState"):
		return turn_yields

	for resource_key in turn_yields.keys():
		var current_amount = GameState.resources.get(resource_key, 0)
		if typeof(current_amount) != TYPE_INT and typeof(current_amount) != TYPE_FLOAT:
			current_amount = 0
		GameState.resources[resource_key] = current_amount + turn_yields[resource_key]

	GameState.resources = _normalize_numeric_dictionary(GameState.resources)
	return turn_yields


func _normalize_numeric_dictionary(source: Dictionary) -> Dictionary:
	var keys := source.keys()
	keys.sort_custom(func(left, right): return str(left) < str(right))

	var normalized := {}
	for key in keys:
		var value = source[key]
		if typeof(value) == TYPE_INT or typeof(value) == TYPE_FLOAT:
			normalized[str(key)] = value
	return normalized
