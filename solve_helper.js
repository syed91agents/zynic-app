const fs = require('fs');
const path = require('path');
const https = require('https');

// Cache directory inside web_app
const cacheDir = path.join(__dirname, 'cache');
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
}
const playerCachePath = path.join(cacheDir, 'player_74edf1a3.js');

// Mock environment
global.window = global;
global.self = global;
global.navigator = { userAgent: 'Mozilla/5.0' };
global.document = { createElement: () => ({}), domain: 'youtube.com' };
global.location = { href: 'https://www.youtube.com/', protocol: 'https:', host: 'www.youtube.com', hostname: 'www.youtube.com' };
global.XMLHttpRequest = function() {};
global.XMLHttpRequest.prototype = {};
global._yt_player = {};

function downloadPlayer(url, dest, callback) {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
        response.pipe(file);
        file.on('finish', () => {
            file.close(callback);
        });
    }).on('error', (err) => {
        fs.unlink(dest, () => {});
        callback(err);
    });
}

function ensurePlayerLoaded(callback) {
    if (fs.existsSync(playerCachePath)) {
        callback(null, fs.readFileSync(playerCachePath, 'utf8'));
    } else {
        const playerUrl = 'https://www.youtube.com/s/player/74edf1a3/player_ias.vflset/en_US/base.js';
        downloadPlayer(playerUrl, playerCachePath, (err) => {
            if (err) {
                callback(err);
            } else {
                callback(null, fs.readFileSync(playerCachePath, 'utf8'));
            }
        });
    }
}

function solve(inputCipherOrUrl) {
    ensurePlayerLoaded((err, playerCode) => {
        if (err) {
            console.error('ERROR: Failed to load player JS:', err);
            process.exit(1);
        }

        // Inject both export statements inside the IIFE closure
        const exportStatement = '; global._cipherSigFunc = function(sig) { return JI(48, 1918, f1(1, 6528, sig)); }; global._nTransformFunc = function(n) { return GU(6, 6010, n); };';
        const modifiedJs = playerCode.replace('})(_yt_player);', exportStatement + ' })(_yt_player);');

        try {
            eval(modifiedJs);
        } catch (e) {
            console.error('ERROR: Failed to evaluate player JS:', e);
            process.exit(1);
        }

        // A signatureCipher is a query-string like "url=...&s=...&sp=sig" — it never starts with https://.
        // A plain stream URL always starts with https:// (or http://). Check protocol prefix first.
        const isPlainUrl = inputCipherOrUrl.startsWith('https://') || inputCipherOrUrl.startsWith('http://');
        if (!isPlainUrl && inputCipherOrUrl.includes('url=')) {
            // It's a signatureCipher query string!
            const params = {};
            inputCipherOrUrl.split('&').forEach(pair => {
                const parts = pair.split('=');
                if (parts.length > 0) {
                    params[decodeURIComponent(parts[0])] = decodeURIComponent(parts.slice(1).join('='));
                }
            });

            const obfuscatedSig = params.s;
            const sigParam = params.sp || 'sig';
            const baseUrl = params.url;

            if (!obfuscatedSig || !baseUrl) {
                console.error('ERROR: Invalid signatureCipher query');
                process.exit(1);
            }

            // Deobfuscate signature
            let deobfuscatedSig = obfuscatedSig;
            if (global._cipherSigFunc) {
                deobfuscatedSig = global._cipherSigFunc(obfuscatedSig);
            }

            // Deobfuscate n parameter inside baseUrl if present
            let finalUrl = baseUrl;
            const nMatch = finalUrl.match(/([?&])n=([^&]+)/);
            if (nMatch && global._nTransformFunc) {
                const oldN = decodeURIComponent(nMatch[2]);
                const newN = global._nTransformFunc(oldN);
                finalUrl = finalUrl.replace(`n=${nMatch[2]}`, `n=${encodeURIComponent(newN)}`);
            }

            const separator = finalUrl.includes('?') ? '&' : '?';
            const completedUrl = `${finalUrl}${separator}${sigParam}=${encodeURIComponent(deobfuscatedSig)}`;
            console.log(completedUrl);
            process.exit(0);
        } else {
            // It's a plain URL!
            let finalUrl = inputCipherOrUrl;
            const nMatch = finalUrl.match(/([?&])n=([^&]+)/);
            if (nMatch && global._nTransformFunc) {
                const oldN = decodeURIComponent(nMatch[2]);
                const newN = global._nTransformFunc(oldN);
                finalUrl = finalUrl.replace(`n=${nMatch[2]}`, `n=${encodeURIComponent(newN)}`);
            }
            console.log(finalUrl);
            process.exit(0);
        }
    });
}

// Receive input from command line argument
const input = process.argv[2];
if (!input) {
    console.error('ERROR: Missing input argument');
    process.exit(1);
}
solve(input);
