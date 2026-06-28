.PHONY: godot-export

godot-export:
	@set -eu; \
	if command -v godot4 >/dev/null 2>&1; then \
		GODOT_BIN=godot4; \
	elif command -v godot >/dev/null 2>&1; then \
		GODOT_BIN=godot; \
	else \
		echo "Error: Godot 4 was not found. Install it and expose 'godot4' or 'godot' in PATH." >&2; \
		exit 1; \
	fi; \
	GODOT_VERSION="$$("$$GODOT_BIN" --version)"; \
	case "$$GODOT_VERSION" in \
		4.*) ;; \
		*) echo "Error: $$GODOT_BIN is $$GODOT_VERSION; Godot 4.x is required." >&2; exit 1 ;; \
	esac; \
	mkdir -p dist; \
	DIST_PATH="$$(pwd)/dist/index.html"; \
	echo "Exporting Godot Web build with $$GODOT_BIN to $$DIST_PATH"; \
	"$$GODOT_BIN" --headless --path godot --export-release Web "$$DIST_PATH"
