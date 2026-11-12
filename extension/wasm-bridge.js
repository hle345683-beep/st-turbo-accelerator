/**
 * WASM-BRIDGE.JS — CẦU NỐI WEBASSMEBLY AN TOÀN KÈM FAIL-SAFE
 * Dự án: ST-RUST-ACCELERATOR / ST-TURBO-ACCELERATOR
 * Quản lý vòng đời và giao tiếp với lõi Rust WASM st-wasm-core
 * Hỗ trợ Unicode / Tiếng Việt có dấu đầy đủ và cơ chế Fail-Safe Circuit Breaker.
 */

// Shared state across CJS and ESM module instances (Dual-package hazard protection)
const _shared = (typeof globalThis !== 'undefined' && globalThis.__ST_WASM_BRIDGE_STATE) 
    ? globalThis.__ST_WASM_BRIDGE_STATE 
    : {
        wasmInstance: null,
        isReady: false,
        isWasmEnabledFlag: true,
        fallbackMatcher: null,
        fallbackVaultMessages: new Map(),
        fallbackVaultLine0: null
    };

if (typeof globalThis !== 'undefined') {
    globalThis.__ST_WASM_BRIDGE_STATE = _shared;
}

function debugLog(message, ...args) {
    if (typeof window !== 'undefined' && window.__ST_RUST_DEBUG) {
        console.debug(`[ST-Rust] ${message}`, ...args);
    }
}

/**
 * Khởi tạo lõi Rust WebAssembly.
 * Hỗ trợ cả môi trường Trình duyệt (Browser) và môi trường Node.js.
 */
async function initWasm(options = {}) {
    if (_shared.isReady && _shared.wasmInstance) return true;

    try {
        if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
            const wasmUrl = options.wasmUrl || 
                (document.currentScript && document.currentScript.src 
                    ? new URL('./pkg/st_wasm_core_bg.wasm', document.currentScript.src).href 
                    : '/scripts/extensions/third-party/st-rust-accelerator/pkg/st_wasm_core_bg.wasm');

            let wasmGlue;
            try {
                wasmGlue = await import('./pkg/st_wasm_core.js');
            } catch (_) {
                wasmGlue = await import('../pkg/st_wasm_core.js');
            }

            if (typeof WebAssembly.instantiateStreaming === 'function') {
                try {
                    await wasmGlue.default({ module_or_path: wasmUrl });
                } catch (_) {
                    const response = await fetch(wasmUrl);
                    const bytes = await response.arrayBuffer();
                    await wasmGlue.default({ module_or_path: bytes });
                }
            } else {
                const response = await fetch(wasmUrl);
                const bytes = await response.arrayBuffer();
                await wasmGlue.default({ module_or_path: bytes });
            }

            _shared.wasmInstance = wasmGlue;
            _shared.isReady = true;
            window.__ST_RUST_READY = true;
            debugLog(`Rust WASM Core v${wasmGlue.get_wasm_core_version()} initialized successfully.`);
            return true;
        } else {
            // Môi trường Node.js (dành cho Unit Testing và Server Runner)
            let wasmModule = null;
            let reqFn = null;
            if (typeof require !== 'undefined') {
                reqFn = require;
            } else {
                try {
                    const { createRequire } = await import('module');
                    reqFn = createRequire(import.meta.url);
                } catch (_) {}
            }

            if (reqFn) {
                const searchPaths = [
                    './pkg-node/st_wasm_core.js',
                    '../pkg-node/st_wasm_core.js',
                    '../../pkg-node/st_wasm_core.js',
                    './pkg/st_wasm_core.js',
                    '../pkg/st_wasm_core.js'
                ];
                for (const p of searchPaths) {
                    try {
                        const resolved = reqFn.resolve(p, { paths: [__dirname, process.cwd()] });
                        wasmModule = reqFn(resolved);
                        if (wasmModule) break;
                    } catch (_) {}
                }
            }

            if (!wasmModule) {
                try {
                    wasmModule = await import('./pkg-node/st_wasm_core.js');
                } catch (_) {
                    try {
                        wasmModule = await import('../pkg-node/st_wasm_core.js');
                    } catch (_) {}
                }
            }

            if (wasmModule) {
                _shared.wasmInstance = wasmModule;
                _shared.isReady = true;
                if (typeof globalThis !== 'undefined') {
                    globalThis.__ST_RUST_READY = true;
                }
                return true;
            }
            throw new Error('Could not resolve st_wasm_core module in Node.js runtime');
        }
    } catch (err) {
        console.warn('[ST-Rust] Không thể khởi tạo Rust WASM (Kích hoạt Fail-Safe Fallback):', err);
        _shared.isReady = false;
        if (typeof window !== 'undefined') {
            window.__ST_RUST_READY = false;
        }
        return false;
    }
}

function isWasmReady() {
    return _shared.isReady && _shared.isWasmEnabledFlag && _shared.wasmInstance !== null;
}

function setWasmEnabled(enabled) {
    _shared.isWasmEnabledFlag = !!enabled;
}

/**
 * Lưu chuỗi metadata Line 0 vào WASM Memory Vault.
 */
function storeLine0InVault(line0Data) {
    const jsonStr = typeof line0Data === 'string' ? line0Data : JSON.stringify(line0Data);
    if (!isWasmReady()) {
        _shared.fallbackVaultLine0 = jsonStr;
        return 0;
    }
    try {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(jsonStr);
        return _shared.wasmInstance.vault_store_line0(bytes);
    } catch (err) {
        console.error('[ST-Rust] Lỗi lưu Line 0 vào Vault:', err);
        _shared.fallbackVaultLine0 = jsonStr;
        return 0;
    }
}

/**
 * Đọc lại chuỗi metadata Line 0 từ WASM Memory Vault.
 */
function getLine0FromVault() {
    if (!isWasmReady()) {
        if (!_shared.fallbackVaultLine0) return null;
        try {
            return JSON.parse(_shared.fallbackVaultLine0);
        } catch (_) {
            return _shared.fallbackVaultLine0;
        }
    }
    try {
        const bytes = _shared.wasmInstance.vault_get_line0();
        const decoder = new TextDecoder();
        const jsonStr = decoder.decode(bytes);
        return JSON.parse(jsonStr);
    } catch (err) {
        console.error('[ST-Rust] Lỗi đọc Line 0 từ Vault:', err);
        if (_shared.fallbackVaultLine0) return JSON.parse(_shared.fallbackVaultLine0);
        return null;
    }
}

/**
 * Nén và lưu một tin nhắn cụ thể vào WASM Vault.
 */
function storeMessageInVault(index, messageData) {
    const jsonStr = typeof messageData === 'string' ? messageData : JSON.stringify(messageData);
    if (!isWasmReady()) {
        _shared.fallbackVaultMessages.set(index, jsonStr);
        return 0;
    }
    try {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(jsonStr);
        return _shared.wasmInstance.vault_store_message(index, bytes);
    } catch (err) {
        console.error(`[ST-Rust] Lỗi lưu tin nhắn #${index} vào Vault:`, err);
        _shared.fallbackVaultMessages.set(index, jsonStr);
        return 0;
    }
}

/**
 * Giải nén và đọc lại tin nhắn từ WASM Vault.
 */
function getMessageFromVault(index) {
    if (!isWasmReady()) {
        const jsonStr = _shared.fallbackVaultMessages.get(index);
        if (!jsonStr) return null;
        try {
            return JSON.parse(jsonStr);
        } catch (_) {
            return jsonStr;
        }
    }
    try {
        const bytes = _shared.wasmInstance.vault_get_message(index);
        const decoder = new TextDecoder();
        const jsonStr = decoder.decode(bytes);
        return JSON.parse(jsonStr);
    } catch (err) {
        console.error(`[ST-Rust] Lỗi đọc tin nhắn #${index} từ Vault:`, err);
        const raw = _shared.fallbackVaultMessages.get(index);
        return raw ? JSON.parse(raw) : null;
    }
}

/**
 * Kiểm tra xem tin nhắn có tồn tại trong WASM Vault hay không.
 */
function hasMessageInVault(index) {
    if (!isWasmReady()) {
        return _shared.fallbackVaultMessages.has(index);
    }
    try {
        return _shared.wasmInstance.vault_has_message(index);
    } catch (_) {
        return _shared.fallbackVaultMessages.has(index);
    }
}

/**
 * Nối toàn bộ ngữ cảnh trực tiếp trong WASM memory (Zero GC V8).
 */
function assembleContextFromVault(indices) {
    if (!isWasmReady()) {
        const result = [];
        for (const idx of indices) {
            const msg = getMessageFromVault(idx);
            if (msg) result.push(msg);
        }
        return JSON.stringify(result);
    }
    try {
        const u32Arr = new Uint32Array(indices);
        return _shared.wasmInstance.vault_assemble_context(u32Arr);
    } catch (err) {
        console.error('[ST-Rust] Lỗi assemble context trong Vault:', err);
        return "[]";
    }
}

/**
 * Xây dựng cây Automaton Aho-Corasick quét Worldbook, hỗ trợ chuẩn Unicode & Tiếng Việt có dấu.
 */
function buildWorldbookMatcher(worldbookJsonOrObject) {
    const jsonStr = typeof worldbookJsonOrObject === 'string'
        ? worldbookJsonOrObject
        : JSON.stringify(worldbookJsonOrObject);

    // Chuẩn bị fallback parser hỗ trợ chuẩn Unicode
    let totalKeywords = 0;
    try {
        const payload = typeof worldbookJsonOrObject === 'string'
            ? JSON.parse(worldbookJsonOrObject)
            : worldbookJsonOrObject;
        const entries = payload.entries || (payload.data && (payload.data.character_book?.entries || payload.data.entries)) || [];
        const patterns = [];
        entries.forEach((entry, idx) => {
            if (entry.enabled === false) return;
            const entryId = entry.id !== undefined ? Number(entry.id) || idx : idx;
            let keys = [];
            if (Array.isArray(entry.keys)) keys = entry.keys;
            else if (typeof entry.key === 'string') keys = entry.key.split(',').map(s => s.trim());
            keys.forEach(k => {
                const trimmed = (k || '').trim().toLowerCase();
                if (trimmed) {
                    totalKeywords++;
                    patterns.push({
                        keyword: trimmed,
                        entryId,
                        isSingleWord: !/\s/.test(trimmed)
                    });
                }
            });
        });
        _shared.fallbackMatcher = patterns;
    } catch (_) {}

    if (isWasmReady()) {
        try {
            return _shared.wasmInstance.build_worldbook_matcher(jsonStr);
        } catch (e) {
            console.warn('[ST-Rust] Lỗi build Worldbook matcher trong WASM, chuyển sang JS fallback:', e);
        }
    }

    return totalKeywords;
}

/**
 * Quét từ khóa Worldbook trong văn bản chat với độ phức tạp tối ưu và hỗ trợ Unicode tiếng Việt đầy đủ.
 */
function scanWorldbookFast(haystack) {
    if (!haystack) return [];

    let wasmMatched = [];
    if (isWasmReady()) {
        try {
            wasmMatched = _shared.wasmInstance.scan_worldbook_text(haystack) || [];
        } catch (e) {
            console.warn('[ST-Rust] Lỗi quét Worldbook bằng WASM:', e);
        }
    }

    // Nếu không có patterns hoặc không cần bổ trợ
    if (!_shared.fallbackMatcher || _shared.fallbackMatcher.length === 0) {
        return wasmMatched;
    }

    // Quét bổ trợ Unicode tiếng Việt (đảm bảo không sót từ có dấu như 'Phong Ma Long', 'Teyvat', 'Nham Thần')
    const textLower = haystack.toLowerCase();
    const resultSet = new Set(wasmMatched);

    for (let p = 0; p < _shared.fallbackMatcher.length; p++) {
        const pat = _shared.fallbackMatcher[p];
        if (resultSet.has(pat.entryId)) continue; // Đã tìm thấy

        let pos = 0;
        while ((pos = textLower.indexOf(pat.keyword, pos)) !== -1) {
            const start = pos;
            const end = pos + pat.keyword.length;
            pos = end;

            if (pat.isSingleWord) {
                // Kiểm tra ranh giới từ chuẩn Unicode
                const prevChar = start > 0 ? textLower[start - 1] : ' ';
                const nextChar = end < textLower.length ? textLower[end] : ' ';
                const isWordChar = (c) => /[\p{L}\p{N}_]/u.test(c);
                if (isWordChar(prevChar) || isWordChar(nextChar)) {
                    continue;
                }
            }
            resultSet.add(pat.entryId);
            break;
        }
    }

    return Array.from(resultSet);
}

/**
 * Đếm số token ước tính.
 */
function countTokens(text) {
    if (!isWasmReady()) {
        return Math.ceil((text || '').length / 3.5);
    }
    try {
        return _shared.wasmInstance.count_tokens(text || '');
    } catch (_) {
        return Math.ceil((text || '').length / 3.5);
    }
}

/**
 * Cắt tỉa ngân sách ngữ cảnh tin nhắn.
 */
function trimContextBudget(messages, maxTokens, reserveTokens = 0, keepFirst = true) {
    if (!isWasmReady()) {
        const list = Array.isArray(messages) ? messages : [];
        return { kept_indices: list.map((_, i) => i), total_kept_tokens: 0, dropped_count: 0 };
    }
    try {
        const jsonStr = typeof messages === 'string' ? messages : JSON.stringify(messages);
        return _shared.wasmInstance.trim_context_budget(jsonStr, maxTokens, reserveTokens, keepFirst);
    } catch (e) {
        console.warn('[ST-Rust] Lỗi trim context budget:', e);
        const list = Array.isArray(messages) ? messages : [];
        return { kept_indices: list.map((_, i) => i), total_kept_tokens: 0, dropped_count: 0 };
    }
}

/**
 * Lấy thống kê từ WASM Vault.
 */
function getVaultStats() {
    if (!isWasmReady()) {
        return {
            total_messages: _shared.fallbackVaultMessages.size,
            raw_total_bytes: 0,
            compressed_total_bytes: 0,
            compression_ratio: 0
        };
    }
    try {
        return _shared.wasmInstance.vault_get_stats();
    } catch (_) {
        return null;
    }
}

/**
 * Xóa sạch bộ nhớ WASM Vault.
 */
function clearVault() {
    _shared.fallbackVaultMessages.clear();
    _shared.fallbackVaultLine0 = null;
    if (!isWasmReady()) return;
    try {
        _shared.wasmInstance.vault_clear();
    } catch (_) {}
}

export {
    initWasm,
    isWasmReady,
    setWasmEnabled,
    storeLine0InVault,
    getLine0FromVault,
    storeMessageInVault,
    getMessageFromVault,
    hasMessageInVault,
    assembleContextFromVault,
    buildWorldbookMatcher,
    scanWorldbookFast,
    countTokens,
    trimContextBudget,
    getVaultStats,
    clearVault,
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initWasm,
        isWasmReady,
        setWasmEnabled,
        storeLine0InVault,
        getLine0FromVault,
        storeMessageInVault,
        getMessageFromVault,
        hasMessageInVault,
        assembleContextFromVault,
        buildWorldbookMatcher,
        scanWorldbookFast,
        countTokens,
        trimContextBudget,
        getVaultStats,
        clearVault,
    };
}
