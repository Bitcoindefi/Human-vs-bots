# Human-vs-bots

[![Godot Web build](https://github.com/Bitcoindefi/Human-vs-bots/actions/workflows/godot-build.yml/badge.svg)](https://github.com/Bitcoindefi/Human-vs-bots/actions/workflows/godot-build.yml)

Turn-based strategy game with a Web3-ready flow on Stellar.

## What this project is

`Human-vs-bots` is a browser game with:

- Hex map battles (movement, attack, territory capture)
- Building-based production (human buildings vs bot tech core)
- Two battle modes:
  - **Human vs LLM**
  - **LLM vs LLM** simulation
- Popular LLM profiles as opponents with visible difficulty labels
- Side drawer UI, map zoom, and tactical match stats

## Run locally (direct game entry)

From repo root:

```bash
python3 -m http.server 4180 --directory /workspaces/Human-vs-bots
"$BROWSER" http://127.0.0.1:4180/
```

Root (`/`) redirects directly to the game.

Main game route:

- `demo/human-vs-bots/index.html`

Alternative prototype route:

- `demo/civ-lite/index.html`

## Gameplay overview

- Select mode: **Human vs LLM** or **LLM vs LLM**
- Choose models and map difficulty
- Start match, control turns, produce units, and capture land
- Win by elimination or territory dominance

## LLM opponents currently available

- Claude 3.5 Sonnet (Hard)
- Claude 3 Opus (Very Hard)
- Clawbot v2 (Medium)
- OpenAI GPT-4o (Hard)
- OpenAI GPT-4.1 mini (Medium)
- OpenAI o1-mini (Very Hard)

## Web3 / ZK flow in the demo

UI includes:

- Wallet connection
- Match lifecycle (`start_game`, turn progression, `end_game`)
- Proof snapshot generation and export (`JSON`)

The flow is aligned with Stellar hackathon architecture and is prepared for deeper contract integration.

## Screenshots


![Main Gameplay](docs/screenshots/main-gameplay.png)


## Useful scripts

- `scripts/serve-demos.sh`
- `scripts/serve-human-vs-bots.sh`
- `scripts/serve-civ-lite.sh`
- `scripts/game-studio.sh`

## Godot project

The base Godot project lives in `godot/` and requires Godot 4.x.

To open it, import `godot/project.godot` from the Godot Project Manager or run:

```bash
godot4 --editor --path godot
```

If your Godot 4 executable is named `godot`, use that command instead.

Install the matching Godot export templates before exporting for the first time.
Then export the Web build from the repository root:

```bash
make godot-export
```

The command detects `godot4` or `godot`, runs the `Web` export preset in headless
mode, and writes the generated entry point to `dist/index.html`. The generated
`dist/` directory is intentionally not tracked.

### Godot Web CI/CD

The [Godot Web build workflow](.github/workflows/godot-build.yml) runs for every
pull request and every push to `main`. Its `build` job installs and caches Godot
4.7.0 plus the matching Web export templates, calls `make godot-export`, and
uploads `dist/` as the GitHub Pages artifact.

For pushes to `main`, the `deploy` job publishes that artifact to the
`github-pages` environment with `actions/deploy-pages`. Pull requests build and
upload the artifact for validation but never deploy it. The repository's Pages
source must be set to **GitHub Actions** under **Settings → Pages**.

## Third-party references and licenses

- Unciv assets inspiration (visual assets used in demo pipeline)
- Stellar/Game Studio quickstart alignment

License files in repo root:

- `THIRD_PARTY_UNCIV_LICENSE.txt`
- `THIRD_PARTY_STELLAR_LICENSE.txt`
