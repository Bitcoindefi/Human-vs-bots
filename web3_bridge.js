(function() {
    'use strict';
    
    if (typeof window.StellarGameService === 'undefined') {
        window.StellarGameService = {
            connectWallet: async function() {
                await new Promise(r => setTimeout(r, 350));
                return { address: 'GHUMANVSBOTSDEMO12345XYZ' };
            },
            start_game: async function(payload) {
                await new Promise(r => setTimeout(r, 260));
                return { txHash: 'tx_start_' + Date.now(), payload };
            },
            submit_zk_proof: async function(payload) {
                await new Promise(r => setTimeout(r, 420));
                return { proofId: 'proof_' + Math.floor(Math.random() * 99999), payload };
            },
            end_game: async function(result) {
                await new Promise(r => setTimeout(r, 260));
                return { txHash: 'tx_end_' + Date.now(), result };
            }
        };
    }
    
    window.downloadProofs = function(data) {
        var blob = new Blob([data], {type: 'application/json'});
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'human-vs-bots-proofs-' + Date.now() + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    window.godotBridge = {
        emitSignal: function(signalName, ...args) {
            if (window.godotCallbacks && window.godotCallbacks[signalName]) {
                window.godotCallbacks[signalName].forEach(cb => cb(...args));
            }
        },
        registerCallback: function(signalName, callback) {
            if (!window.godotCallbacks) window.godotCallbacks = {};
            if (!window.godotCallbacks[signalName]) window.godotCallbacks[signalName] = [];
            window.godotCallbacks[signalName].push(callback);
        }
    };
})();