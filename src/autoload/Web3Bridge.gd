extends Node

var js_window = null
var js_stellar_service = null
var is_web_build: bool = false

signal wallet_connected(address: String)
signal wallet_connection_failed(error: String)
signal game_started(tx_hash: String)
signal game_start_failed(error: String)
signal proof_submitted(proof_id: String)
signal proof_submission_failed(error: String)
signal game_ended(tx_hash: String)
signal game_end_failed(error: String)

func _ready() -> void:
    is_web_build = OS.has_feature("web")
    if is_web_build: _initialize_js_bridge()
    else: _setup_mock_service()

func _initialize_js_bridge() -> void:
    js_window = JavaScriptBridge.get_interface("window")
    if js_window:
        var has_service = JavaScriptBridge.eval("typeof window.StellarGameService !== 'undefined'")
        if has_service:
            js_stellar_service = JavaScriptBridge.get_interface("StellarGameService")
        else:
            _inject_mock_js_service()

func _inject_mock_js_service() -> void:
    var mock_js = """
    window.StellarGameService = {
        connectWallet: async function() {
            await new Promise(r => setTimeout(r, 350));
            return { address: 'GHUMANVSBOTSDEMO12345XYZ' };
        },
        start_game: async function(payload) {
            await new Promise(r => setTimeout(r, 260));
            return { txHash: 'tx_start_' + Date.now(), payload: payload };
        },
        submit_zk_proof: async function(payload) {
            await new Promise(r => setTimeout(r, 420));
            return { proofId: 'proof_' + Math.floor(Math.random() * 99999), payload: payload };
        },
        end_game: async function(result) {
            await new Promise(r => setTimeout(r, 260));
            return { txHash: 'tx_end_' + Date.now(), result: result };
        }
    };
    """
    JavaScriptBridge.eval(mock_js)
    js_stellar_service = JavaScriptBridge.get_interface("StellarGameService")

func _setup_mock_service() -> void: pass

func connect_wallet() -> void:
    if is_web_build and js_stellar_service:
        var promise = js_stellar_service.connectWallet()
        promise.then(_on_wallet_connected).catch(_on_wallet_error)
    else:
        await get_tree().create_timer(0.35).timeout
        _on_wallet_connected({"address": "GHUMANVSBOTSDEMO12345XYZ"})

func _on_wallet_connected(result) -> void:
    var address = result.address if result.has("address") else str(result)
    GameState.wallet_connected = true; GameState.wallet_address = address
    EventBus.emit_signal("wallet_connected", address)
    wallet_connected.emit(address)

func _on_wallet_error(error) -> void:
    wallet_connection_failed.emit(str(error))

func start_game_on_chain(mode: String, llm_a: String, ai: String, 
                         difficulty: String, contract: String) -> void:
    var payload = {"mode": mode, "llmA": llm_a, "ai": ai, 
                   "difficulty": difficulty, "contract": contract}
    if is_web_build and js_stellar_service:
        var promise = js_stellar_service.start_game(payload)
        promise.then(_on_game_started).catch(_on_game_start_error)
    else:
        await get_tree().create_timer(0.26).timeout
        _on_game_started({"txHash": "tx_start_" + str(Time.get_ticks_msec())})

func _on_game_started(result) -> void:
    var tx_hash = result.txHash if result.has("txHash") else str(result)
    EventBus.emit_signal("game_started_on_chain", tx_hash)
    game_started.emit(tx_hash)

func _on_game_start_error(error) -> void: game_start_failed.emit(str(error))

func submit_zk_proof(proof_data: Dictionary) -> void:
    if is_web_build and js_stellar_service:
        var promise = js_stellar_service.submit_zk_proof(proof_data)
        promise.then(_on_proof_submitted).catch(_on_proof_error)
    else:
        await get_tree().create_timer(0.42).timeout
        _on_proof_submitted({"proofId": "proof_" + str(randi() % 99999)})

func _on_proof_submitted(result) -> void:
    var proof_id = result.proofId if result.has("proofId") else str(result)
    EventBus.emit_signal("proof_submitted", proof_id)
    proof_submitted.emit(proof_id)

func _on_proof_error(error) -> void: proof_submission_failed.emit(str(error))

func end_game_on_chain(winner: String, turn: int) -> void:
    var result = {"winner": winner, "turn": turn}
    if is_web_build and js_stellar_service:
        var promise = js_stellar_service.end_game(result)
        promise.then(_on_game_ended).catch(_on_game_end_error)
    else:
        await get_tree().create_timer(0.26).timeout
        _on_game_ended({"txHash": "tx_end_" + str(Time.get_ticks_msec())})

func _on_game_ended(result) -> void:
    var tx_hash = result.txHash if result.has("txHash") else str(result)
    EventBus.emit_signal("game_ended_on_chain", tx_hash)
    game_ended.emit(tx_hash)

func _on_game_end_error(error) -> void: game_end_failed.emit(str(error))

func export_proofs_to_js(proofs_json: String) -> void:
    if is_web_build:
        JavaScriptBridge.eval("""
        var blob = new Blob([JSON.stringify(""" + proofs_json + """)], {type: 'application/json'});
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'human-vs-bots-proofs-' + Date.now() + '.json';
        a.click();
        URL.revokeObjectURL(url);
        """)
    else:
        print("Web3Bridge: Would export proofs (native mode)")
        print(proofs_json)