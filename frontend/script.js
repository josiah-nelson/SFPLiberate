// --- Configuration ---
// BLE profile (dynamic per device). Populated by discovery or manual entry.
const PROFILE_STORAGE_KEY = 'sfpActiveProfile';
function loadActiveProfile() {
    try { return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || 'null'); } catch { return null; }
}
function saveActiveProfile(profile) {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}
function clearActiveProfile() { localStorage.removeItem(PROFILE_STORAGE_KEY); }
function requireProfile() {
    const p = loadActiveProfile();
    if (!p || !p.serviceUuid || !p.writeCharUuid || !p.notifyCharUuid) {
        throw new Error('SFP profile not configured. Run discovery or manual configure to populate UUIDs.');
    }
    return p;
}
// Optional secondary notify characteristic may be discovered for future use
let SECONDARY_NOTIFY_CHAR_UUID = null;
const BLE_WRITE_CHUNK_SIZE = 20; // Conservative chunk size for maximum BLE compatibility
const BLE_WRITE_CHUNK_DELAY_MS = 10; // Delay between chunks (ms). Can be reduced for faster writes if device supports it.
const TESTED_FIRMWARE_VERSION = "1.0.10"; // Firmware version this app was developed and tested with
// The frontend is reverse-proxied to the backend at /api by NGINX
const API_BASE_URL = "/api";
// Public community index (to be hosted on GitHub Pages)
// TODO: Create the community modules repository and publish to GitHub Pages
// Expected URL pattern: https://username.github.io/SFPLiberate-modules/index.json
const COMMUNITY_INDEX_URL = "https://josiah-nelson.github.io/SFPLiberate-modules/index.json";

// --- Global State ---
let appConfig = { ble_proxy_enabled: true, ble_proxy_ws_path: '/api/v1/ble/ws', ble_proxy_default_timeout: 5 };
let bleDevice = null;
let gattServer = null;
let writeCharacteristic = null;
let notifyCharacteristic = null;
let rawEepromData = null; // Holds the raw ArrayBuffer of the last read
let deviceVersion = null; // Stores the device firmware version
let statusCheckInterval = null; // Interval for periodic status checks
let messageListeners = []; // Array of {pattern: string, resolve: function, reject: function, timeout: number}
// TODO: Accumulate DDM samples for CSV export (future)
let ddmSamples = [];
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');
// BLE Proxy instance (when using proxy mode)
let bleProxy = null;

// Connection mode state
let resolvedConnectionMode = 'auto'; // 'direct' or 'proxy' after resolution

// --- DOM References ---
document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connectButton');
    const readSfpButton = document.getElementById('readSfpButton');
    const saveModuleButton = document.getElementById('saveModuleButton');
    const loadModulesButton = document.getElementById('loadModulesButton');
    const uploadCommunityButton = document.getElementById('uploadCommunityButton');
    const loadCommunityModulesButton = document.getElementById('loadCommunityModulesButton');
    const importFromFileButton = document.getElementById('importFromFileButton');
    const backupAllButton = document.getElementById('backupAllButton');
    const moduleList = document.getElementById('moduleList');
    const supportBanner = ensureSupportBanner();
    const modeSelect = document.getElementById('connectionMode');
    const modeHint = document.getElementById('connectionModeHint');
    const refreshAdaptersBtn = document.getElementById('refreshAdaptersBtn');
    const scanButton = document.getElementById('scanButton');
    const proxyScanButton = document.getElementById('proxyScanButton');
    const saveProfileEnvBtn = document.getElementById('saveProfileEnvBtn');

    // --- Event Listeners ---
    connectButton.onclick = connectToDevice;
    readSfpButton.onclick = requestSfpRead;
    saveModuleButton.onclick = saveCurrentModule;
    uploadCommunityButton.onclick = uploadToCommunityTODO;
    loadCommunityModulesButton.onclick = loadCommunityModulesTODO;
    importFromFileButton.onclick = importFromFileTODO;
    backupAllButton.onclick = backupAllTODO;
    loadModulesButton.onclick = loadSavedModules;

    // Use event delegation for buttons on dynamic content (module list)
    moduleList.onclick = (event) => {
        const target = event.target;
        const moduleId = target.dataset.id;

        if (target.classList.contains('btn-write')) {
            writeSfp(moduleId);
        }
        if (target.classList.contains('btn-delete')) {
            deleteModule(moduleId);
        }
    };
    // Load runtime config (env-driven) then initialize UI
    fetch('/api/v1/config')
        .then(r => r.ok ? r.json() : {})
        .then(cfg => {
            if (cfg && typeof cfg === 'object') {
                appConfig = Object.assign(appConfig, cfg);
                const proxyOption = document.querySelector('#connectionMode option[value="proxy"]');
                const proxyBtn = document.getElementById('proxyScanButton');
                const proxyList = document.getElementById('proxyDiscovery');
                if (!appConfig.ble_proxy_enabled) {
                    // Remove proxy option entirely from the selector
                    if (proxyOption && proxyOption.parentElement) {
                        // If currently selected, switch to auto
                        if (modeSelect.value === 'proxy') {
                            modeSelect.value = 'auto';
                        }
                        proxyOption.parentElement.removeChild(proxyOption);
                    }
                    if (proxyBtn) proxyBtn.style.display = 'none';
                    if (proxyList) proxyList.style.display = 'none';
                }
                // If backend provides default profile and none is saved, adopt it
                if (cfg.default_profile && !loadActiveProfile()) {
                    saveActiveProfile(cfg.default_profile);
                }
            }
        })
        .catch(() => {})
        .finally(() => {
            // Recompute hints once config is known
            if (typeof refreshModeUI === 'function') { try { refreshModeUI(); } catch (_) {} }
        });

    // Initialize connection mode UI and hints
    function refreshModeUI() {
        const selected = modeSelect.value;
        const wb = isWebBluetoothAvailable();
        const proxyAvail = isProxyAvailable();
        if (selected === 'auto') {
            if (wb) {
                modeHint.textContent = 'Direct via Web Bluetooth';
            } else if (proxyAvail) {
                modeHint.textContent = 'Proxy via backend (recommended for Safari/iOS)';
            } else {
                modeHint.textContent = 'No supported BLE method available';
            }
        } else if (selected === 'web-bluetooth') {
            modeHint.textContent = wb ? 'Direct via Web Bluetooth' : 'Not supported in this browser';
        } else if (selected === 'proxy') {
            modeHint.textContent = 'Proxy via backend WebSocket';
        }
    }

    modeSelect.addEventListener('change', () => {
        refreshModeUI();
        updateProxyAdapterVisibility();
        // Show proxy discovery only in proxy mode
        if (proxyScanButton) {
            proxyScanButton.style.display = (modeSelect.value === 'proxy' && appConfig.ble_proxy_enabled) ? '' : 'none';
        }
    });
    if (refreshAdaptersBtn) refreshAdaptersBtn.onclick = loadProxyAdapters;
    refreshModeUI();
    updateProxyAdapterVisibility();
    updateConnectAvailability();

    // Hide Web Bluetooth scan on iOS/iPadOS
    if (scanButton && isIOS()) scanButton.style.display = 'none';
    // Proxy discovery visibility based on mode and env
    if (proxyScanButton) proxyScanButton.style.display = (modeSelect.value === 'proxy' && appConfig.ble_proxy_enabled) ? '' : 'none';
    updateProfileActions();

    if (saveProfileEnvBtn) {
        saveProfileEnvBtn.onclick = async () => {
            try {
                const p = loadActiveProfile();
                if (!p) { alert('No active profile to save.'); return; }
                const res = await fetch('/api/v1/ble/profile/env', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        service_uuid: p.serviceUuid,
                        write_char_uuid: p.writeCharUuid,
                        notify_char_uuid: p.notifyCharUuid,
                    })
                });
                const out = await res.json();
                if (!res.ok || out.error) throw new Error(out.error || 'Failed to save .env');
                const restart = confirm('Defaults saved to .env. Restart Docker now? (recommended)');
                if (restart) {
                    alert('Please run:\n\n  docker compose restart\n\nThen reload this page.');
                }
            } catch (e) {
                alert('Save failed: ' + (e.message || e));
            }
        };
    }

    // Feature support notice and auto-hints
    if (!isWebBluetoothAvailable()) {
        if (isProxyAvailable()) {
            // Encourage proxy mode for Safari/iOS users
            supportBanner.textContent = 'Web Bluetooth not available. Using BLE Proxy via backend.';
            supportBanner.classList.remove('hidden');
            // Default selection remains 'auto'; it will resolve to proxy at connect time
            updateProxyAdapterVisibility();
        } else {
            disableBleUI();
            supportBanner.textContent = supportMessageForBrowser();
            supportBanner.classList.remove('hidden');
        }
    }
});

// --- Feature Detection Helpers ---
function isWebBluetoothAvailable() {
    return !!(navigator && navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function');
}

/**
 * Detects if the browser is Safari (macOS/iOS).
 * Note: As of Safari 18 / iOS 18 (2024), Safari does NOT support Web Bluetooth API.
 * Apple's position is "Not Considering" due to privacy/fingerprinting concerns.
 */
function isSafari() {
    const ua = navigator.userAgent;
    const isSafari = /Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua) && !/Edg\//.test(ua);
    return isSafari;
}

/**
 * Detects if the browser is running on iOS (iPhone/iPad).
 */
function isIOS() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad on iOS 13+
}

function isProxyAvailable() {
    try {
        return appConfig.ble_proxy_enabled && typeof BLEProxyClient !== 'undefined' && BLEProxyClient.isAvailable();
    } catch (_) {
        return false;
    }
}

function resolveConnectionMode() {
    const selected = document.getElementById('connectionMode').value;
    if (selected === 'web-bluetooth') return 'direct';
    if (selected === 'proxy') return 'proxy';
    // Auto: prefer direct when available, otherwise proxy
    if (isWebBluetoothAvailable()) return 'direct';
    if (isProxyAvailable()) return 'proxy';
    return 'none';
}

function buildProxyWsUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const path = appConfig.ble_proxy_ws_path || '/api/v1/ble/ws';
    return `${proto}//${window.location.host}${path}`;
}

function updateProxyAdapterVisibility() {
    const row = document.getElementById('proxyAdapterRow');
    if (!row) return;
    const selected = document.getElementById('connectionMode').value;
    const show = selected === 'proxy' || (!isWebBluetoothAvailable() && isProxyAvailable());
    row.style.display = show ? 'flex' : 'none';
    if (show) { loadProxyAdapters(); }
}

async function loadProxyAdapters() {
    try {
        if (!isProxyAvailable()) return;
        const res = await fetch('/api/v1/ble/adapters');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const list = await res.json();
        renderAdapters(list);
    } catch (err) {
        const hint = document.getElementById('proxyAdapterHint');
        if (hint) hint.textContent = 'Adapter list unavailable';
    }
}

function renderAdapters(list) {
    const select = document.getElementById('proxyAdapterSelect');
    const hint = document.getElementById('proxyAdapterHint');
    if (!select) return;
    const saved = localStorage.getItem('proxyAdapter') || '';
    select.innerHTML = '';
    if (!list || list.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(default)';
        select.appendChild(opt);
        if (hint) hint.textContent = 'No adapters found; using default.';
        return;
    }
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '(default)';
    select.appendChild(defaultOpt);
    list.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.name;
        const addrTxt = a.address ? ` ${a.address}` : '';
        opt.textContent = `${a.name}${addrTxt}${a.powered === false ? ' (off)' : ''}`;
        select.appendChild(opt);
    });
    if (saved) select.value = saved;
    select.onchange = () => { localStorage.setItem('proxyAdapter', select.value); };
    if (hint) hint.textContent = 'Select a local Bluetooth adapter (optional).';
}

function ensureSupportBanner() {
    let el = document.getElementById('supportBanner');
    if (!el) {
        el = document.createElement('div');
        el.id = 'supportBanner';
        el.style.margin = '1rem 0';
        el.style.padding = '0.75rem';
        el.style.border = '1px solid var(--border-color)';
        el.style.background = 'rgba(233,69,96,0.1)';
        var mainContainer = document.querySelector('main.container');
        if (mainContainer && mainContainer.prepend) {
            mainContainer.prepend(el);
        }
    }
    return el;
}

function supportMessageForBrowser() {
    if (isSafari() || isIOS()) {
        if (isIOS()) {
            return '⚠️ Safari on iOS does NOT support Web Bluetooth API. Apple has declined to implement it due to privacy concerns. ' +
                   'To use this app on iOS: Download the "Bluefy – Web BLE Browser" app from the App Store, ' +
                   'which provides full Web Bluetooth support. Alternatively, use Chrome/Edge on desktop.';
        }
        return '⚠️ Safari does NOT support Web Bluetooth API (as of Safari 18). Apple\'s position is "Not Considering" this feature. ' +
               'Please use Chrome, Edge, or Opera instead. No experimental flags are available to enable it.';
    }
    return 'This browser does not support Web Bluetooth API. Please use a compatible browser (Chrome, Edge, Opera, or Bluefy on iOS).';
}

function disableBleUI() {
    const connectButton = document.getElementById('connectButton');
    connectButton.disabled = true;
}

function updateConnectAvailability() {
    const connectButton = document.getElementById('connectButton');
    const p = loadActiveProfile();
    connectButton.disabled = !p || !p.serviceUuid || !p.writeCharUuid || !p.notifyCharUuid;
}

function updateProfileActions() {
    const p = loadActiveProfile();
    const hasProfile = !!(p && p.serviceUuid && p.writeCharUuid && p.notifyCharUuid);
    const btn = document.getElementById('saveProfileEnvBtn');
    if (btn) {
        const show = hasProfile && appConfig.ble_proxy_enabled && !appConfig.public_mode;
        btn.style.display = show ? '' : 'none';
    }
}

// --- Log Helper ---
function log(message, isError = false) {
    const logConsole = document.getElementById('logConsole');
    const entry = document.createElement('div');
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    if (isError) {
        entry.style.color = "var(--error-color)";
    }
    logConsole.prepend(entry);
}

// --- Message Waiting Helper ---
/**
 * Waits for a specific message pattern from the BLE device.
 * Returns a promise that resolves when a notification containing the pattern is received.
 * Includes a timeout as a safety fallback.
 * @param {string} pattern - The text pattern to match in incoming notifications
 * @param {number} timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns {Promise<string>} - Resolves with the matched message text
 */
function waitForMessage(pattern, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            // Remove this listener from the array
            const index = messageListeners.findIndex(listener => listener.resolve === resolve);
            if (index !== -1) {
                messageListeners.splice(index, 1);
            }
            reject(new Error(`Timeout waiting for message: "${pattern}"`));
        }, timeoutMs);

        messageListeners.push({
            pattern,
            resolve: (message) => {
                clearTimeout(timeoutId);
                resolve(message);
            },
            reject: (error) => {
                clearTimeout(timeoutId);
                reject(error);
            },
            timeoutId
        });
    });
}

// --- 1. BLE Connection Logic ---
async function connectToDevice() {
    const mode = resolveConnectionMode();
    resolvedConnectionMode = mode;
    if (mode === 'none') {
        log('No supported BLE connection mode available in this environment.', true);
        alert('Your browser does not support Web Bluetooth and the BLE proxy is unavailable.');
        return;
    }
    if (mode === 'proxy') {
        return await connectViaProxy();
    }
    // Default: direct Web Bluetooth
    log("Requesting BLE device...");
    try {
        const profile = requireProfile();
        // Some browsers may not support filtering by custom 128-bit UUIDs.
        // Attempt a filtered request first; if it fails, fall back to acceptAllDevices.
        // Note: Safari does NOT support Web Bluetooth API at all, so this won't work there.
        let requestOptions = {
            filters: [{ services: [profile.serviceUuid] }],
            optionalServices: [profile.serviceUuid]
        };

        try {
            bleDevice = await navigator.bluetooth.requestDevice(requestOptions);
        } catch (firstErr) {
            // Fallback path for browsers that reject custom UUID filters
            log(`Filtered request failed (${firstErr.message}). Trying broad scan...`);
            bleDevice = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [profile.serviceUuid]
            });
        }

        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);
        log("Connecting to GATT server...");
        gattServer = await bleDevice.gatt.connect();

        log("Getting primary service...");
        const service = await gattServer.getPrimaryService(profile.serviceUuid);

        log("Getting Write characteristic...");
        writeCharacteristic = await service.getCharacteristic(profile.writeCharUuid);

        log("Getting Notify characteristic...");
        notifyCharacteristic = await service.getCharacteristic(profile.notifyCharUuid);

        log("Starting notifications...");
        const notifier = await notifyCharacteristic.startNotifications();
        if (notifier && typeof notifier.addEventListener === 'function') {
            notifier.addEventListener('characteristicvaluechanged', handleNotifications);
        } else {
            notifyCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);
        }

        log("Successfully connected!");
        updateConnectionStatus(true);
        updateConnectionType('Direct (Web Bluetooth)');

        // Get device version and start periodic status checks
        await getDeviceVersion();
        startStatusMonitoring();

    } catch (error) {
        log(`Connection failed: ${error}`, true);
        updateConnectionStatus(false);
    }
}

function onDisconnected() {
    log("Device disconnected.", true);
    updateConnectionStatus(false);
    updateConnectionType('Not Connected');
    stopStatusMonitoring();
    deviceVersion = null;

    // Reject any pending message listeners to prevent memory leaks and hanging promises
    messageListeners.forEach(listener => {
        clearTimeout(listener.timeoutId);
        listener.reject(new Error("Device disconnected"));
    });
    messageListeners = [];

    // Optionally, try to reconnect
}

function updateConnectionStatus(isConnected) {
    const bleStatus = document.getElementById('bleStatus');
    const readSfpButton = document.getElementById('readSfpButton');

    if (isConnected) {
        bleStatus.textContent = "Connected";
        bleStatus.dataset.status = "connected";
        readSfpButton.disabled = false;
    } else {
        bleStatus.textContent = "Disconnected";
        bleStatus.dataset.status = "disconnected";
        document.getElementById('sfpStatus').textContent = "Unknown";
        document.getElementById('sfpStatus').dataset.status = "unknown";
        readSfpButton.disabled = true;
        document.getElementById('liveDataArea').classList.add('hidden');
    }
}

function updateConnectionType(text) {
    const el = document.getElementById('connectionType');
    if (!el) return;
    el.textContent = text || 'Not Connected';
    el.dataset.status = text && text.toLowerCase().includes('proxy') ? 'proxy' : (text && text.toLowerCase().includes('direct') ? 'direct' : 'unknown');
}

/**
 * Gets the device firmware version using the discovered API endpoint
 */
async function getDeviceVersion() {
    try {
        log("Requesting device version...");
        await sendBleCommand("/api/1.0/version");
        // The response will be handled in handleNotifications
        // and will look like "Version: 1.0.10"
    } catch (error) {
        log(`Failed to get device version: ${error}`, true);
    }
}

/**
 * Requests device status using the discovered API endpoint
 */
async function requestDeviceStatus() {
    try {
        await sendBleCommand("[GET] /stats");
        // The response will be handled in handleNotifications
        // Format: "sysmon: ver:1.0.10, bat:[x]|^|35%, sfp:[x], ..."
    } catch (error) {
        log(`Failed to get device status: ${error}`, true);
    }
}

/**
 * Starts periodic status monitoring of the connected device.
 *
 * Note: This polls the device every 5 seconds regardless of whether the data
 * is actively used, creating BLE traffic and battery drain. This approach was
 * chosen for simplicity and to ensure status is always current. Future
 * optimizations could include:
 * - Only polling when status UI is visible
 * - Event-driven updates instead of polling
 * - User-configurable polling interval or manual refresh
 * - Stopping monitoring during long operations (reads/writes)
 */
function isConnectedNow() {
    if (resolvedConnectionMode === 'proxy') {
        return !!(bleProxy && bleProxy.connected);
    }
    return !!(gattServer && gattServer.connected);
}

function startStatusMonitoring() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }
    // Check status every 5 seconds
    statusCheckInterval = setInterval(() => {
        if (isConnectedNow()) {
            requestDeviceStatus();
        }
    }, 5000);
    // Also check immediately
    requestDeviceStatus();
}

/**
 * Stops periodic status monitoring
 */
function stopStatusMonitoring() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        statusCheckInterval = null;
    }
}

// --- 2. BLE Data Handling (The "Brain") ---

/**
 * This is the core logic. It handles all incoming data from the 
 * SFP Wizard device.
 */
function handleNotifications(event) {
    const value = event.target.value; // DataView
    // Convert DataView to Uint8Array for broad browser compatibility (Safari included)
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);

    // Heuristic: if all bytes are printable ASCII (and newline/carriage return), treat as text
    let isLikelyText = true;
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (!(b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126))) {
            isLikelyText = false;
            break;
        }
    }

    let textResponse = null;
    if (isLikelyText) {
        try {
            textResponse = textDecoder.decode(bytes);
        } catch (_) {
            textResponse = null;
        }
    }

    if (textResponse) {
        log(`Received Text: ${textResponse.trim()}`);

        // Check if it's a version response
        if (textResponse.includes('Version:')) {
            const versionMatch = textResponse.match(/Version:\s*([0-9.]+)/i);
            if (versionMatch) {
                deviceVersion = versionMatch[1];
                log(`Device firmware version: ${deviceVersion}`);
                // Check if it's the expected version
                if (deviceVersion !== TESTED_FIRMWARE_VERSION) {
                    log(`⚠️ Warning: This app was developed for firmware v${TESTED_FIRMWARE_VERSION}. You have v${deviceVersion}. Some features may not work correctly.`, true);
                }
            }
        }

        // Check if it's the periodic status monitor
        if (textResponse.includes('sysmon:')) {
            const sfpStatus = document.getElementById('sfpStatus');
            if (textResponse.includes('sfp:[x]')) {
                sfpStatus.textContent = "Module Present";
                sfpStatus.dataset.status = "yes";
            } else if (textResponse.includes('sfp:[ ]')) {
                sfpStatus.textContent = "No Module";
                sfpStatus.dataset.status = "no";
            }

            // Extract and display battery level
            const batteryMatch = textResponse.match(/bat:\[.\]\|\^?\|(\d+)%/);
            if (batteryMatch) {
                const batteryLevel = batteryMatch[1];
                log(`Device battery level: ${batteryLevel}%`);

                // Display battery level in UI if element exists
                const batteryStatus = document.getElementById('batteryStatus');
                if (batteryStatus) {
                    batteryStatus.textContent = `Battery: ${batteryLevel}%`;
                    batteryStatus.dataset.level = batteryLevel;
                }
            }
        }

        // Check for SIF operation acknowledgments
        const ackMessages = {
            'SIF start': "Device acknowledged read operation - waiting for EEPROM data...",
            'SIF write start': "Device acknowledged write operation - ready to receive data",
            'SIF write stop': "Device confirmed write operation completed",
            'SIF write complete': "Device confirmed write operation completed",
            'SIF erase start': "Device started erase operation",
            'SIF erase stop': "Device completed erase operation",
            'SIF stop': "Device stopped SIF operation",
        };

        for (const [key, message] of Object.entries(ackMessages)) {
            if (textResponse.includes(key)) {
                log(message);

                // Notify any waiting listeners
                const matchedListeners = messageListeners.filter(listener =>
                    textResponse.includes(listener.pattern)
                );
                matchedListeners.forEach(listener => {
                    listener.resolve(textResponse);
                });
                // Remove all matched listeners in one pass
                messageListeners = messageListeners.filter(l => !matchedListeners.includes(l));
                break; // Process first match only
            }
        }

        // TODO: DDM capture
        if (/ddm:/i.test(textResponse)) {
            // Example parsing; actual format TBD from logs
            ddmSamples.push({ ts: Date.now(), line: textResponse.trim() });
        }
        // Handle other text responses, e.g., "Write OK", "Error", etc.
    } else {
        // --- IT'S BINARY DATA ---
        // This is the SFP EEPROM data we requested
        log(`Received ${value.buffer.byteLength} bytes of binary SFP data.`);
        rawEepromData = value.buffer; // Save the raw ArrayBuffer
        parseAndDisplaySfpData(rawEepromData);

        // Enable the save button
        document.getElementById('saveModuleButton').disabled = false;
        // Enable community upload after a successful read
        const uploadBtn = document.getElementById('uploadCommunityButton');
        if (uploadBtn) uploadBtn.disabled = false;
        document.getElementById('liveDataArea').classList.remove('hidden');
    }
}

/**
 * Send a command (as a text string) to the SFP Wizard.
 */
async function sendBleCommand(command) {
    if (!writeCharacteristic) {
        log("Not connected.", true);
        return;
    }
    try {
        const encodedCommand = textEncoder.encode(command);
        await writeCharacteristic.writeValueWithoutResponse(encodedCommand);
        log(`Sent Command: ${command}`);
    } catch (error) {
        log(`Failed to send command: ${error}`, true);
    }
}

// --- Proxy Mode Implementation ---
async function connectViaProxy() {
    try {
        const wsUrl = buildProxyWsUrl();
        log(`Connecting via BLE Proxy (${wsUrl})...`);
        bleProxy = new BLEProxyClient(wsUrl);
        await bleProxy.connect();

        // Connect to device with the service UUID
        const adapter = (document.getElementById('proxyAdapterSelect') || {}).value || undefined;
        const profile = requireProfile();
        const device = await bleProxy.requestDevice({ services: [profile.serviceUuid], adapter });
        bleDevice = device;

        // Create a GATT-like server and get characteristics through proxy
        gattServer = await device.gatt.connect();
        const service = await gattServer.getPrimaryService(profile.serviceUuid);
        writeCharacteristic = await service.getCharacteristic(profile.writeCharUuid);
        notifyCharacteristic = await service.getCharacteristic(profile.notifyCharUuid);

        // Start notifications and hook the handler
        const notifier = await notifyCharacteristic.startNotifications();
        if (notifier && typeof notifier.addEventListener === 'function') {
            notifier.addEventListener('characteristicvaluechanged', handleNotifications);
        } else if (typeof notifyCharacteristic.addEventListener === 'function') {
            notifyCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);
        }

        // Watch for proxy disconnection
        if (bleProxy.ws) {
            bleProxy.ws.addEventListener('close', () => {
                onDisconnected();
            });
            bleProxy.ws.addEventListener('error', () => {
                // Log but let onclose handle UI
                log('BLE Proxy WebSocket error', true);
            });
        }

        log("Successfully connected via BLE Proxy!");
        updateConnectionStatus(true);
        updateConnectionType('Proxy (via Backend)');
        await getDeviceVersion();
        startStatusMonitoring();
    } catch (error) {
        log(`Proxy connection failed: ${error}`, true);
        updateConnectionStatus(false);
        updateConnectionType('Not Connected');
    }
}

async function ensureProxyConnected() {
    if (!bleProxy) {
        bleProxy = new BLEProxyClient(buildProxyWsUrl());
    }
    if (!bleProxy.connected) {
        await bleProxy.connect();
    }
    return bleProxy;
}

async function discoverViaProxy() {
    try {
        if (!isProxyAvailable()) {
            alert('BLE Proxy is not available.');
            return;
        }
        await ensureProxyConnected();
        log('Discovering devices via proxy...');
        const timeout = appConfig.ble_proxy_default_timeout || 5;
        const adapter = (document.getElementById('proxyAdapterSelect') || {}).value || undefined;
        const results = await bleProxy.discoverDevices({ serviceUuid: null, timeout, adapter });
        // Fuzzy filter: include devices with 'SFP' in the name
        const filtered = (results || []).filter(d => (d.name || '').toLowerCase().includes('sfp'));
        const container = document.getElementById('proxyDiscovery');
        const list = document.getElementById('proxyDiscoveryList');
        if (list) {
            list.innerHTML = '';
            if (!filtered || filtered.length === 0) {
                list.innerHTML = '<li>No devices found.</li>';
            } else {
                filtered.forEach(dev => {
                    const li = document.createElement('li');
                    const safeName = (dev.name || 'Unknown').replace(/</g, '&lt;');
                    li.innerHTML = `
                        <div class="info">
                            <strong>${safeName}</strong>
                            <span style="margin-left:0.5rem; color:var(--text-muted)">${dev.address || ''} ${typeof dev.rssi === 'number' ? `(RSSI ${dev.rssi})` : ''}</span>
                        </div>
                        <div class="actions">
                            <button class="btn-connect-proxy" data-address="${dev.address}">Connect via Proxy</button>
                        </div>
                    `;
                    list.appendChild(li);
                });
                list.onclick = async (ev) => {
                    const t = ev.target;
                    if (t && t.classList && t.classList.contains('btn-connect-proxy')) {
                        const addr = t.getAttribute('data-address');
                        if (addr) {
                            await connectViaProxyAddress(addr);
                        }
                    }
                };
            }
        }
        if (container) container.classList.remove('hidden');
    } catch (err) {
        log(`Proxy discovery failed: ${err}`, true);
        alert(`Proxy discovery failed: ${err.message || err}`);
    }
}

async function connectViaProxyAddress(deviceAddress) {
    try {
        const adapter = (document.getElementById('proxyAdapterSelect') || {}).value || undefined;
        const params = { device_address: deviceAddress, ...(adapter ? { adapter: adapter } : {}) };
        const inspRes = await fetch(`/api/v1/ble/inspect?${new URLSearchParams(params).toString()}`);
        if (!inspRes.ok) throw new Error('Inspection failed');
        const insp = await inspRes.json();
        const profile = selectProfileFromGatt(insp.gatt);
        profile.deviceAddress = deviceAddress;
        profile.deviceName = (insp.device && insp.device.name) || 'Unknown';
        saveActiveProfile(profile);
        updateConnectAvailability();
        updateProfileActions();

        const device = await bleProxy.requestDevice({ services: [profile.serviceUuid], deviceAddress, adapter });
        bleDevice = device;
        gattServer = await device.gatt.connect();
        const service = await gattServer.getPrimaryService(profile.serviceUuid);
        writeCharacteristic = await service.getCharacteristic(profile.writeCharUuid);
        notifyCharacteristic = await service.getCharacteristic(profile.notifyCharUuid);
        const notifier = await notifyCharacteristic.startNotifications();
        if (notifier && typeof notifier.addEventListener === 'function') {
            notifier.addEventListener('characteristicvaluechanged', handleNotifications);
        } else if (typeof notifyCharacteristic.addEventListener === 'function') {
            notifyCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);
        }
        updateConnectionStatus(true);
        updateConnectionType('Proxy (via Backend)');
        await getDeviceVersion();
        startStatusMonitoring();
    } catch (err) {
        log(`Proxy connect failed: ${err}`, true);
        alert(`Proxy connect failed: ${err.message || err}`);
    }
}

function selectProfileFromGatt(gatt) {
    if (!gatt || !gatt.services) throw new Error('Invalid GATT data');
    // Find a service that has both a notify and a write/write-without-response characteristic
    let best = null;
    for (const svc of gatt.services) {
        const chars = svc.characteristics || [];
        const notifyChar = chars.find(c => (c.properties||[]).includes('notify'));
        const writeNoRsp = chars.find(c => (c.properties||[]).includes('write-without-response'));
        const write = chars.find(c => (c.properties||[]).includes('write'));
        const writeChar = writeNoRsp || write || null;
        if (notifyChar && writeChar) {
            best = { serviceUuid: svc.uuid, notifyCharUuid: notifyChar.uuid, writeCharUuid: writeChar.uuid };
            break;
        }
    }
    if (!best) {
        // Fallback: pick first service with notify and use any write from any service
        let notifySvc = null, notifyChar = null;
        for (const svc of gatt.services) {
            const c = (svc.characteristics||[]).find(x => (x.properties||[]).includes('notify'));
            if (c) { notifySvc = svc; notifyChar = c; break; }
        }
        let writeChar = null;
        for (const svc of gatt.services) {
            const c = (svc.characteristics||[]).find(x => (x.properties||[]).includes('write-without-response') || (x.properties||[]).includes('write'));
            if (c) { writeChar = c; break; }
        }
        if (notifySvc && notifyChar && writeChar) {
            best = { serviceUuid: notifySvc.uuid, notifyCharUuid: notifyChar.uuid, writeCharUuid: writeChar.uuid };
        }
    }
    if (!best) throw new Error('Unable to determine write/notify characteristics automatically');
    return best;
}

// --- 3. SFP Read/Parse Logic ---

function requestSfpRead() {
    // Trigger SFP EEPROM read using the discovered BLE API endpoint
    // The device will respond with "SIF start" followed by binary EEPROM data
    log("Sending SFP read command to device...");
    sendBleCommand("[POST] /sif/start");
    log("Waiting for EEPROM data...");
}

/**
 * Parses the raw SFP data (SFF-8472 spec) and updates the UI.
 */
function parseAndDisplaySfpData(arrayBuffer) {
    const asciiDecoder = new TextDecoder('ascii');

    if (arrayBuffer.byteLength < 96) {
        log("EEPROM data is too short.", true);
        return;
    }

    // SFF-8472 Address A0h Offsets
    const vendor = asciiDecoder.decode(arrayBuffer.slice(20, 36)).trim();
    const model = asciiDecoder.decode(arrayBuffer.slice(40, 56)).trim();
    const serial = asciiDecoder.decode(arrayBuffer.slice(68, 84)).trim();

    document.getElementById('sfp-vendor').textContent = `Vendor: ${vendor || 'N/A'}`;
    document.getElementById('sfp-model').textContent = `Model:  ${model || 'N/A'}`;
    document.getElementById('sfp-serial').textContent = `Serial: ${serial || 'N/A'}`;
}

// --- 4. Backend API (Library) Functions ---

/**
 * Fetches the list of saved modules from our Docker backend.
 */
async function loadSavedModules() {
    log("Loading module library from backend...");
    try {
        const response = await fetch(`${API_BASE_URL}/modules`);
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        const modules = await response.json();

        const moduleList = document.getElementById('moduleList');
        moduleList.innerHTML = ""; // Clear existing list

        if (modules.length === 0) {
            moduleList.innerHTML = "<li>No modules saved yet.</li>";
        }

        modules.forEach(module => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="info">
                    <strong>${module.name}</strong>
                    ${module.vendor} - ${module.model}
                </div>
                <div class="actions">
                    <button class="btn-write" data-id="${module.id}">Write</button>
                    <button class="btn-delete" data-id="${module.id}">Delete</button>
                </div>
            `;
            moduleList.appendChild(li);
        });
        document.getElementById('moduleLibrary').classList.remove('hidden');

    } catch (error) {
        log(`Failed to load library: ${error}`, true);
    }
}

// --- Scanning (Discovery) TODO scaffolding ---
// Limited scanning functionality to discover devices vs static UUIDs
// TODO: Use the Bluetooth Scanning API (requestLEScan) when available to
// discover SFP Wizard devices passively and present them in a list.
// This API is currently supported in Chromium-based browsers only.
// Note: Safari does NOT support Web Bluetooth API at all (as of Safari 18 / iOS 18).
// Users on iOS must use a third-party browser like Bluefy that implements Web BLE.
async function limitedScanTODO() {
    try {
        if (navigator.bluetooth && typeof navigator.bluetooth.requestLEScan === 'function') {
            log('Starting low-energy scan (experimental)...');
            const scan = await navigator.bluetooth.requestLEScan({ keepRepeatedDevices: false });
            const items = new Map();
            const list = document.getElementById('proxyDiscoveryList');
            const container = document.getElementById('proxyDiscovery');
            function render() {
                if (!list) return;
                list.innerHTML = '';
                const arr = Array.from(items.values()).filter(d => (d.name || '').toLowerCase().includes('sfp'));
                if (arr.length === 0) {
                    list.innerHTML = '<li>No devices found.</li>';
                } else {
                    arr.forEach(dev => {
                        const li = document.createElement('li');
                        li.innerHTML = `
                            <div class="info">
                                <strong>${dev.name || 'Unknown'}</strong>
                                <span style="margin-left:0.5rem; color:var(--text-muted)">${typeof dev.rssi==='number'?`(RSSI ${dev.rssi})`:''}</span>
                            </div>
                            <div class="actions">
                                <button disabled title="Use Proxy discovery to connect">Connect</button>
                            </div>
                        `;
                        list.appendChild(li);
                    });
                }
                if (container) container.classList.remove('hidden');
            }
            function onAdv(e) {
                items.set(e.device.id || e.device.name || Math.random().toString(16).slice(2), {
                    name: e.device.name,
                    rssi: e.rssi
                });
                render();
            }
            navigator.bluetooth.addEventListener('advertisementreceived', onAdv);
            // TODO: attach navigator.bluetooth.addEventListener('advertisementreceived', handler)
            // and populate a discovery list in the UI.
            // For now, we simply stop immediately to avoid leaving scans running.
            await new Promise((r) => setTimeout(r, 4000));
            scan.stop();
            navigator.bluetooth.removeEventListener('advertisementreceived', onAdv);
            log('Stopped low-energy scan. (TODO: implement handler and device selection UI)');
        } else {
            log('Scanning API not available. Falling back to requestDevice...', true);
            await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
        }
    } catch (err) {
        log(`Scan failed or was cancelled: ${err}`, true);
    }
}

// --- Community Upload / Import TODOs ---
async function uploadToCommunityTODO() {
    try {
        if (!rawEepromData) {
            alert('Read an SFP first.');
            return;
        }
        // TODO: Compute sha256 in browser for immediate duplicate checks
        const base64Data = bufferToBase64(rawEepromData);
        const vendor = document.getElementById('sfp-vendor').textContent.replace('Vendor: ','');
        const model = document.getElementById('sfp-model').textContent.replace('Model:  ','');
        const serial = document.getElementById('sfp-serial').textContent.replace('Serial: ','');
        const name = document.getElementById('moduleNameInput').value || `${vendor} ${model}`.trim();
        const res = await fetch(`${API_BASE_URL}/submissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, vendor, model, serial, eeprom_data_base64: base64Data })
        });
        const out = await res.json();
        if (!res.ok) throw new Error(out.detail || 'Submission failed');
        log(`Community submission queued. Inbox ID: ${out.inbox_id}, sha256: ${out.sha256}`);
        alert('Thanks! Your module was queued for community review.');
    } catch (err) {
        log(`Community upload failed: ${err}`, true);
    }
}

// --- 4a. Library Save/Delete & Write (Restored) ---

/**
 * Saves the currently read module data to the backend.
 */
async function saveCurrentModule() {
    const name = document.getElementById('moduleNameInput').value;
    if (!name) {
        alert("Please enter a friendly name for the module.");
        return;
    }
    if (!rawEepromData) {
        alert("No SFP data has been read yet.");
        return;
    }

    log("Saving module to backend...");

    // Convert ArrayBuffer to Base64 string to send as JSON
    const base64Data = bufferToBase64(rawEepromData);

    try {
        const response = await fetch(`${API_BASE_URL}/modules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, eeprom_data_base64: base64Data })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.detail || "Failed to save.");
        }

        if (result.status === 'duplicate') {
            log(`Duplicate detected (SHA256). Using existing ID: ${result.id}`);
        } else {
            log(`Module saved with ID: ${result.id}`);
        }
        document.getElementById('moduleNameInput').value = "";
        loadSavedModules(); // Refresh the list

    } catch (error) {
        log(`Failed to save module: ${error}`, true);
    }
}

/**
 * Deletes a module from the backend database.
 */
async function deleteModule(moduleId) {
    if (!confirm("Are you sure you want to delete this module?")) {
        return;
    }

    log(`Deleting module ${moduleId}...`);
    try {
        const response = await fetch(`${API_BASE_URL}/modules/${moduleId}`, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.detail || "Failed to delete.");
        }
        log(result.message);
        loadSavedModules();
    } catch (error) {
        log(`Failed to delete: ${error}`, true);
    }
}

/**
 * Fetches a module's binary data and writes it to the SFP.
 * Uses the discovered BLE write protocol: [POST] /sif/write
 */
async function writeSfp(moduleId) {
    if (!bleDevice || !gattServer || !isConnectedNow()) {
        alert("Please connect to the SFP Wizard first.");
        return;
    }

    const confirmed = confirm(
        "⚠️ WARNING: Writing EEPROM data can permanently damage your SFP module if incorrect data is used.\n\n" +
        "Before proceeding:\n" +
        "✓ Ensure you have backed up the original module data\n" +
        "✓ Verify this is the correct module profile\n" +
        "✓ Use test/non-critical modules first\n\n" +
        "Do you want to continue?"
    );
    if (!confirmed) { log("Write operation cancelled by user."); return; }

    log(`Preparing to write module ${moduleId}...`);

    try {
        // 1. Fetch the binary EEPROM data from our backend
        log("Fetching EEPROM data from backend...");
        const response = await fetch(`${API_BASE_URL}/modules/${moduleId}/eeprom`);
        if (!response.ok) { throw new Error("Module binary data not found."); }
        const eepromData = await response.arrayBuffer();
        log(`Retrieved ${eepromData.byteLength} bytes of EEPROM data.`);

        // 2. Send the write initiation command to the SFP Wizard
        log("Sending write initiation command: [POST] /sif/write");
        await sendBleCommand("[POST] /sif/write");

        // 3. Wait for acknowledgment (best-effort)
        log("Waiting for device acknowledgment...");
        try { await waitForMessage("SIF write start", 5000); log("Device ready to receive EEPROM data."); }
        catch (error) { log(`Warning: ${error.message}. Proceeding anyway...`, true); }

        // 4. Chunk and send the binary data
        const totalChunks = Math.ceil(eepromData.byteLength / BLE_WRITE_CHUNK_SIZE);
        log(`Writing ${eepromData.byteLength} bytes in ${totalChunks} chunks...`);
        for (let i = 0; i < totalChunks; i++) {
            const start = i * BLE_WRITE_CHUNK_SIZE;
            const end = Math.min(start + BLE_WRITE_CHUNK_SIZE, eepromData.byteLength);
            const chunk = eepromData.slice(start, end);
            try {
                await writeCharacteristic.writeValueWithoutResponse(chunk);
                if ((i + 1) % 10 === 0 || i === totalChunks - 1) {
                    const progress = Math.round(((i + 1) / totalChunks) * 100);
                    log(`Write progress: ${progress}% (${i + 1}/${totalChunks} chunks)`);
                }
                if (BLE_WRITE_CHUNK_DELAY_MS > 0) { await new Promise(r => setTimeout(r, BLE_WRITE_CHUNK_DELAY_MS)); }
            } catch (chunkError) {
                throw new Error(`Failed to write chunk ${i + 1}/${totalChunks}: ${chunkError}`);
            }
        }

        log("All data chunks sent successfully.");
        log("Waiting for write completion confirmation...");
        try { await Promise.race([waitForMessage("SIF write stop", 10000), waitForMessage("SIF write complete", 10000)]); log("✓ Write operation completed!", false); }
        catch (error) { log(`Warning: ${error.message}. Write may have completed anyway.`, true); log("✓ Write operation likely completed (no confirmation received)", false); }
        log("⚠️ IMPORTANT: Verify the write by reading the module back and comparing data.");
        alert(
            "Write operation completed!\n\n" +
            "NEXT STEPS:\n" +
            "1. Read the module back using the Read button\n" +
            "2. Compare the data to verify successful write\n" +
            "3. Test the module in your equipment"
        );
    } catch (error) {
        log(`Failed to write SFP: ${error}`, true);
        alert(`Write operation failed: ${error.message || error}`);
    }
}

// Utility: ArrayBuffer -> base64
function bufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]); }
    return window.btoa(binary);
}

async function loadCommunityModulesTODO() {
    try {
        log('Fetching community index (TODO)...');
        // TODO: fetch COMMUNITY_INDEX_URL and render list in #communityModuleList
        // Example: const res = await fetch(COMMUNITY_INDEX_URL, { cache: 'no-store' });
        // const idx = await res.json();
        const container = document.getElementById('communityModuleLibrary');
        const list = document.getElementById('communityModuleList');
        if (list) {
            list.innerHTML = '<li>TODO: Fetch and list modules from community index.</li>';
        }
        if (container) container.classList.remove('hidden');
        alert('TODO: Community listing not yet implemented.');
    } catch (err) {
        log(`Failed to load community modules: ${err}`, true);
    }
}

async function importFromFileTODO() {
    try {
        const input = document.getElementById('importFileInput');
        if (!input || !input.files || input.files.length === 0) {
            alert('Select a .bin or .json file first.');
            return;
        }
        const file = input.files[0];
        // TODO: Implement reading metadata JSON or raw BIN and saving to backend.
        log(`TODO: Importing from file '${file.name}' not yet implemented.`);
        alert('TODO: Import from file (supports .json or .bin)');
    } catch (err) {
        log(`Import failed: ${err}`, true);
    }
}

async function backupAllTODO() {
    try {
        // TODO: Implement endpoint to export all modules as JSON/CSV/zip and trigger browser download.
        log('TODO: Backup/Export not yet implemented (CSV + ZIP).');
        alert('TODO: Backup/Export all modules to CSV/ZIP');
    } catch (err) {
        log(`Backup failed: ${err}`, true);
    }
}
