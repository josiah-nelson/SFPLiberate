// --- Configuration ---
// TODO: These UUIDs should be discovered dynamically or configured per device
// Replace these placeholder UUIDs with your actual BLE service/characteristic UUIDs
const SFP_SERVICE_UUID = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX";
const WRITE_CHAR_UUID = "YYYYYYYY-YYYY-YYYY-YYYY-YYYYYYYYYYYY"; // For sending commands
const NOTIFY_CHAR_UUID = "ZZZZZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZZZZZZZZZ"; // For receiving data/logs
// The frontend is reverse-proxied to the backend at /api by NGINX
const API_BASE_URL = "/api";
// Public community index (to be hosted on GitHub Pages)
// TODO: Create the community modules repository and publish to GitHub Pages
// Expected URL pattern: https://username.github.io/SFPLiberate-modules/index.json
const COMMUNITY_INDEX_URL = "https://josiah-nelson.github.io/SFPLiberate-modules/index.json";

// --- Global State ---
let bleDevice = null;
let gattServer = null;
let writeCharacteristic = null;
let notifyCharacteristic = null;
let rawEepromData = null; // Holds the raw ArrayBuffer of the last read
// TODO: Accumulate DDM samples for CSV export (future)
let ddmSamples = [];
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');

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
    // Feature support notice
    if (!isWebBluetoothAvailable()) {
        disableBleUI();
        supportBanner.textContent = supportMessageForBrowser();
        supportBanner.classList.remove('hidden');
    }
});

// --- Feature Detection Helpers ---
function isWebBluetoothAvailable() {
    return !!(navigator && navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function');
}

function isSafari() {
    const ua = navigator.userAgent;
    const isSafari = /Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua) && !/Edg\//.test(ua);
    return isSafari;
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
    if (isSafari()) {
        return 'Web Bluetooth is limited in Safari (especially on iOS). Use Chrome/Edge if possible. On macOS Safari, enable Web Bluetooth in Develop > Experimental Features if available.';
    }
    return 'This browser does not support Web Bluetooth. Please use a compatible browser (e.g., Chrome, Edge, or Opera).';
}

function disableBleUI() {
    const connectButton = document.getElementById('connectButton');
    connectButton.disabled = true;
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

// --- 1. BLE Connection Logic ---
async function connectToDevice() {
    log("Requesting BLE device...");
    try {
        // Some browsers (notably Safari) may not support filtering by custom 128-bit UUIDs.
        // Attempt a filtered request first; if it fails or we're on Safari, fall back to acceptAllDevices.
        const wantsFallback = isSafari();
        let requestOptions = wantsFallback
            ? { acceptAllDevices: true, optionalServices: [SFP_SERVICE_UUID] }
            : { filters: [{ services: [SFP_SERVICE_UUID] }], optionalServices: [SFP_SERVICE_UUID] };

        try {
            bleDevice = await navigator.bluetooth.requestDevice(requestOptions);
        } catch (firstErr) {
            // Fallback path for browsers that reject custom UUID filters
            log(`Filtered request failed (${firstErr}). Trying broad scan...`);
            bleDevice = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [SFP_SERVICE_UUID] });
        }

        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);
        log("Connecting to GATT server...");
        gattServer = await bleDevice.gatt.connect();

        log("Getting primary service...");
        const service = await gattServer.getPrimaryService(SFP_SERVICE_UUID);

        log("Getting Write characteristic...");
        writeCharacteristic = await service.getCharacteristic(WRITE_CHAR_UUID);

        log("Getting Notify characteristic...");
        notifyCharacteristic = await service.getCharacteristic(NOTIFY_CHAR_UUID);

        log("Starting notifications...");
        await notifyCharacteristic.startNotifications();
        notifyCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);

        log("Successfully connected!");
        updateConnectionStatus(true);

    } catch (error) {
        log(`Connection failed: ${error}`, true);
        updateConnectionStatus(false);
    }
}

function onDisconnected() {
    log("Device disconnected.", true);
    updateConnectionStatus(false);
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

// --- 3. SFP Read/Parse Logic ---

function requestSfpRead() {
    // NOTE: The SFP Wizard reads/writes on-device; BLE broadcasts logs/data.
    // If a trigger command exists, it needs discovery. For now, instruct users
    // to initiate a read on the device while connected; the app will capture
    // the broadcasted data via notifications.
    log("If available, trigger read on the device. Listening for data...");
    // TODO: If a BLE trigger command exists (e.g., [POST] /sif/start), discover and enable.
    // sendBleCommand("[POST] /sif/start");
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
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: name,
                eeprom_data_base64: base64Data
            })
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
        const response = await fetch(`${API_BASE_URL}/modules/${moduleId}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.detail || "Failed to delete.");
        }

        log(result.message);
        loadSavedModules(); // Refresh the list

    } catch (error) {
        log(`Failed to delete: ${error}`, true);
    }
}

/**
 * Fetches a module's binary data and writes it to the SFP.
 */
async function writeSfp(moduleId) {
    if (!bleDevice || !gattServer || !gattServer.connected) {
        alert("Please connect to the SFP Wizard first.");
        return;
    }

    log(`Preparing to write module ${moduleId}...`);

    try {
        // 1. Fetch the binary EEPROM data from our backend
        log("Fetching EEPROM data from backend...");
        const response = await fetch(`${API_BASE_URL}/modules/${moduleId}/eeprom`);
        if (!response.ok) {
            throw new Error("Module binary data not found.");
        }
        const eepromData = await response.arrayBuffer();

        // 2. Send the "start write" command to the SFP Wizard
        //    NOTE: We are *guessing* this command. You will need to discover
        //    the correct command, e.g., [POST] /sfp/write
        log("Sending 'start write' command to device (TODO: VERIFY THIS COMMAND)");
        await sendBleCommand("[POST] /sfp/write/start"); // <-- 100% A GUESS

        // 3. Send the binary data.
        //    BLE writes are often limited in size (MTU, ~240 bytes or less).
        //    You will likely need to "chunk" the data.
        //    For now, we'll try to send it all at once.
        log(`Attempting to write ${eepromData.byteLength} bytes...`);
        // TODO: This needs to be a different characteristic, or
        // a different command sequence. This part WILL fail
        // and needs to be reverse-engineered by sniffing the app's
        // "Write" or "Push EEPROM" function.
        // await writeCharacteristic.writeValue(eepromData);

        log("Write logic is a placeholder and needs to be discovered.", true);
        alert("Write function is not yet implemented. You must sniff the BLE traffic for the 'Write EEPROM' command from the official app to complete this.");

    } catch (error) {
        log(`Failed to write SFP: ${error}`, true);
    }
}

// --- Utility Functions ---
function bufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// --- Scanning (Discovery) TODO scaffolding ---
// Limited scanning functionality to discover devices vs static UUIDs
// TODO: Use the Bluetooth Scanning API (requestLEScan) when available to
// discover SFP Wizard devices passively and present them in a list.
// This API is currently supported in Chromium-based browsers; Safari support
// is limited. For Safari/macOS with experimental Web Bluetooth, fall back to
// requestDevice with acceptAllDevices and instruct the user to pick the device.
async function limitedScanTODO() {
    try {
        if (navigator.bluetooth && typeof navigator.bluetooth.requestLEScan === 'function') {
            log('Starting low-energy scan (experimental)...');
            const scan = await navigator.bluetooth.requestLEScan({ keepRepeatedDevices: false });
            // TODO: attach navigator.bluetooth.addEventListener('advertisementreceived', handler)
            // and populate a discovery list in the UI.
            // For now, we simply stop immediately to avoid leaving scans running.
            await new Promise((r) => setTimeout(r, 2000));
            scan.stop();
            log('Stopped low-energy scan. (TODO: implement handler and device selection UI)');
        } else {
            log('Scanning API not available. Falling back to requestDevice...', true);
            await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [SFP_SERVICE_UUID] });
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
