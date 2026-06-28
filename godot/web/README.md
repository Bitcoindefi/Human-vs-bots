# Godot WebBridge contract

`WebBridge` is a Godot autoload that exchanges asynchronous Stellar/ZK requests
with browser JavaScript. It is active only in a Godot Web export. Native/editor
calls do not touch `JavaScriptBridge`; they emit `bridge_error` instead.

## Loading the browser adapter

The Web export preset adds this tag to the generated page:

```html
<script src="stellar_bridge.js"></script>
```

`make godot-export` copies `godot/web/stellar_bridge.js` next to the generated
`dist/index.html`. If exporting from the Godot editor instead, copy that file
next to the exported HTML manually. The existing repository-root `index.html`
and demo pages are not part of this integration.

Before the game makes a request, configure the adapter with the real wallet,
Stellar, and proof implementations:

```js
window.HumanVsBotsBridge.configure({
  connectWallet: async () => ({ address: "G..." }),
  getAddress: async () => "G...",
  commitAction: async (payload) => ({ txHash: "..." }),
  revealAction: async (payload) => ({ txHash: "..." }),
  generateProof: async (payload) => ({ proof: "...", publicInputs: [] }),
  exportProof: async (payload) => ({ filename: "proof.json" }),
});
```

Handlers may return a value or a Promise. `commitAction`, `revealAction`,
`generateProof`, and `exportProof` receive the parsed JSON object sent by Godot.
This adapter deliberately does not select a wallet SDK, submit transactions, or
generate proofs itself.

## JavaScript functions called by Godot

Godot expects these functions on `window.HumanVsBotsBridge`:

| Function | Input | Successful handler result |
| --- | --- | --- |
| `connectWallet()` | none | address string or `{ address: "G..." }` |
| `getAddress()` | none | address string or `{ address: "G..." }` |
| `commitAction(payloadJson)` | JSON string | any JSON-serializable value |
| `revealAction(payloadJson)` | JSON string | any JSON-serializable value |
| `generateProof(payloadJson)` | JSON string | any JSON-serializable value |
| `exportProof(payloadJson)` | JSON string | any JSON-serializable value |

## Callbacks into Godot

At startup, the autoload creates `window.HumanVsBotsGodot` and registers:

| Callback | Arguments | Godot signal |
| --- | --- | --- |
| `walletConnected` | `address` string | `wallet_connected(address)` |
| `walletConnectionFailed` | error string | `wallet_connection_failed(error)` |
| `addressReceived` | `address` string | `address_received(address)` |
| `commitSubmitted` | JSON result string | `commit_submitted(result)` |
| `revealSubmitted` | JSON result string | `reveal_submitted(result)` |
| `proofGenerated` | JSON result string | `proof_generated(result)` |
| `proofExported` | JSON result string | `proof_exported(result)` |
| `bridgeError` | action string, error string | `bridge_error(action, error)` |

The supplied adapter invokes these callbacks after each handler settles.
Integrations that replace the adapter must use the same callback names and must
JSON-stringify action/proof results. Expected action names for `bridgeError` are
`connect_wallet`, `get_address`, `commit_action`, `reveal_action`,
`generate_proof`, and `export_proof`.

## Godot usage

```gdscript
func _ready() -> void:
	WebBridge.wallet_connected.connect(_on_wallet_connected)
	WebBridge.commit_submitted.connect(_on_commit_submitted)
	WebBridge.bridge_error.connect(_on_bridge_error)

	WebBridge.connect_wallet()
	WebBridge.commit_action({
		"turn": 1,
		"commitment": "hex-or-base64-commitment",
	})
```

Requests return through signals; wrapper methods do not block or return a
transaction/proof result.
