import { features } from '@/lib/features';
import { requireProfile, saveActiveProfile } from './profile';
import { BLEProxyClient, buildDefaultProxyWsUrl } from './proxyClient';
import {
  getBleState,
  log as logLine,
  setBattery,
  setConnected,
  setConnectionType,
  setDeviceVersion,
  setRawEeprom,
  setResolvedMode,
  setSfpPresent,
} from './store';
import type { ConnectionMode, ResolvedMode, SfpProfile } from './types';
import { connectDirect, isWebBluetoothAvailable, startNotifications, writeChunks, writeText } from './webbluetooth';
import { ESPHomeAdapter } from '@/lib/esphome/websocketAdapter';
import { getModuleRepository } from '@/lib/repositories';

const TESTED_FIRMWARE_VERSION = '1.0.10';

/**
 * Custom error class for API operations
 */
class APIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Fetch with automatic retry and timeout handling
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 2
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return res;
    } catch (error: any) {
      if (attempt === retries) {
        throw new APIError(
          'Network request failed after retries',
          undefined,
          error
        );
      }

      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
    }
  }
  throw new Error('Unreachable');
}

export function resolveConnectionMode(selected: ConnectionMode): ResolvedMode {
  if (selected === 'web-bluetooth') return 'direct';
  if (selected === 'proxy') return 'proxy';
  if (selected === 'esphome-proxy') return 'esphome-proxy'; // ESPHome WebSocket for full BLE communication
  // Auto
  if (isWebBluetoothAvailable()) return 'direct';
  if (BLEProxyClient.isAvailable()) return 'proxy';
  return 'none';
}

/**
 * Clean up connection resources when device disconnects.
 * Prevents memory leaks and ensures clean state.
 */
export function handleDisconnection() {
  logLine('Device disconnected - cleaning up resources');

  // Clear status monitoring interval
  if (statusMonitoringId) {
    clearInterval(statusMonitoringId);
    statusMonitoringId = null;
  }

  // Clear all pending message listeners
  listeners.forEach(l => {
    clearTimeout(l.timeoutId);
    l.reject(new Error('Device disconnected'));
  });
  listeners.length = 0;

  // Clean up ESPHome adapter if present
  if (active?.esphomeAdapter) {
    active.esphomeAdapter.disconnect().catch(err => {
      console.error('Error disconnecting ESPHome adapter:', err);
    });
  }

  // Clear active connection
  active = null;

  // Update state
  setConnected(false);
  setConnectionType('Not Connected');
}

/**
 * Stop status monitoring without full disconnection cleanup.
 */
export function stopStatusMonitoring() {
  if (statusMonitoringId) {
    clearInterval(statusMonitoringId);
    statusMonitoringId = null;
  }
}

export type ActiveConnection = {
  mode: ResolvedMode;
  write?: any;
  notify?: any;
  proxy?: BLEProxyClient | null;
  esphomeAdapter?: ESPHomeAdapter | null;
};

let active: ActiveConnection | null = null;
let statusMonitoringId: ReturnType<typeof setInterval> | null = null;
type MsgListener = { pattern: string | RegExp; resolve: (text: string) => void; reject: (e: any) => void; timeoutId: any };
const listeners: MsgListener[] = [];

export async function connect(selected: ConnectionMode) {
  const mode = resolveConnectionMode(selected);
  setResolvedMode(mode);
  if (mode === 'none') {
    logLine('No supported BLE connection mode available in this environment.');
    throw new Error('No BLE connection method available');
  }

  if (mode === 'proxy') return connectViaProxy();
  if (mode === 'esphome-proxy') return connectViaESPHomeProxy();
  return connectDirectMode();
}

async function connectDirectMode() {
  logLine('Requesting BLE device...');
  const profile = requireProfile();
  const { device, server, service, writeCharacteristic, notifyCharacteristic } = await connectDirect(profile, handleDisconnection);
  active = { mode: 'direct', write: writeCharacteristic, notify: notifyCharacteristic, proxy: null };
  await startNotifications(notifyCharacteristic, handleNotifications);
  setConnected(true);
  setConnectionType('Direct (Web Bluetooth)');
  await getDeviceVersion();
  scheduleStatusMonitoring();
  return device;
}

async function connectViaProxy() {
  // Check for custom proxy URL in localStorage (admin-configured)
  const customProxyUrl = typeof window !== 'undefined' ? localStorage.getItem('sfp_ble_proxy_url') : null;
  const wsUrl = customProxyUrl || buildDefaultProxyWsUrl('/api/v1/ble/ws');
  logLine(`Connecting via BLE Proxy (${wsUrl})...`);
  const proxy = new BLEProxyClient(wsUrl);
  await proxy.connect();
  const profile = requireProfile();
  const device = await proxy.requestDevice({ services: [profile.serviceUuid], adapter: null, deviceAddress: profile.deviceAddress || null });
  const gatt = await device.gatt.connect();
  const svc = await gatt.getPrimaryService(profile.serviceUuid);
  const writeCharacteristic = await svc.getCharacteristic(profile.writeCharUuid);
  const notifyCharacteristic = await svc.getCharacteristic(profile.notifyCharUuid);
  active = { mode: 'proxy', write: writeCharacteristic, notify: notifyCharacteristic, proxy };
  await startNotifications(notifyCharacteristic, handleNotifications);
  setConnected(true);
  setConnectionType('Proxy (via Backend)');
  await getDeviceVersion();
  scheduleStatusMonitoring();
  return device;
}

async function connectViaESPHomeProxy() {
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
  const wsUrl = `${protocol}//${host}/api/v1/esphome/ws`;

  logLine(`Connecting via ESPHome Proxy (${wsUrl})...`);
  const adapter = new ESPHomeAdapter(wsUrl);
  await adapter.connect();

  const profile = requireProfile();
  const device = await adapter.requestDevice({
    macAddress: profile.deviceAddress || '',
    serviceUUID: profile.serviceUuid,
    notifyCharUUID: profile.notifyCharUuid,
    writeCharUUID: profile.writeCharUuid,
  });

  const gatt = await device.gatt.connect();
  const svc = await gatt.getPrimaryService(profile.serviceUuid);
  const writeCharacteristic = await svc.getCharacteristic(profile.writeCharUuid);
  const notifyCharacteristic = await svc.getCharacteristic(profile.notifyCharUuid);

  active = {
    mode: 'esphome-proxy',
    write: writeCharacteristic,
    notify: notifyCharacteristic,
    esphomeAdapter: adapter
  };

  await startNotifications(notifyCharacteristic, handleNotifications);
  setConnected(true);
  setConnectionType('ESPHome Proxy (WebSocket)');
  await getDeviceVersion();
  scheduleStatusMonitoring();
  return device;
}

function scheduleStatusMonitoring() {
  // Clear any existing monitor
  if (statusMonitoringId) {
    clearInterval(statusMonitoringId);
  }

  // Poll status every 5 seconds
  requestDeviceStatus().catch(() => { }); // Fire-and-forget initial check

  statusMonitoringId = setInterval(() => {
    const st = getBleState();
    if (!st.connected) {
      stopStatusMonitoring();
      return;
    }
    requestDeviceStatus().catch((e) => {
      logLine(`Status check failed: ${String(e)}`);
    });
  }, 5000);
}

async function getDeviceVersion() {
  try {
    await sendBleCommand('/api/1.0/version');
  } catch (e) {
    logLine(`Failed to get device version: ${String(e)}`);
  }
}

async function requestDeviceStatus() {
  try {
    await sendBleCommand('[GET] /stats');
  } catch (e) {
    logLine(`Failed to get device status: ${String(e)}`);
  }
}

export async function requestSfpRead() {
  await sendBleCommand('[POST] /sif/start');
}

export async function writeSfpFromBuffer(buf: ArrayBuffer) {
  // Device protocol expects a write start command and then data (per legacy code)
  await sendBleCommand('[POST] /sif/write');
  const data = new Uint8Array(buf);
  if (!active) throw new Error('Not connected');
  const totalChunks = Math.ceil(data.length / 20);
  logLine(`Writing ${data.length} bytes in ${totalChunks} chunks...`);
  await writeChunks(active.write, data, 20, 10, false, (written, total) => {
    if (written === total || written % 10 === 0) {
      const pct = Math.round((written / total) * 100);
      logLine(`Write progress: ${pct}% (${written}/${total} chunks)`);
    }
  });
}

export async function sendBleCommand(command: string) {
  if (!active) throw new Error('Not connected');
  await writeText(active.write, command);
  logLine(`Sent Command: ${command}`);
}

// Notification handler: improved text vs binary detection
const textDecoder = new TextDecoder('utf-8');

/**
 * Detect if data is text or binary using multiple heuristics
 */
function detectContentType(bytes: Uint8Array): 'text' | 'binary' {
  // Must be at least 4 bytes to be considered text
  if (bytes.length < 4) return 'binary';

  // Check for known binary signatures
  // SFF-8472 EEPROM: identifier byte 0x03 at start, typically 256+ bytes
  if (bytes[0] === 0x03 && bytes.length >= 128) {
    return 'binary';
  }

  // Try UTF-8 decode (handles ASCII + UTF-8)
  try {
    const text = textDecoder.decode(bytes);

    // Check if it's printable (allow ASCII + UTF-8 chars)
    const printableChars = [...text].filter((c) => {
      const code = c.charCodeAt(0);
      return (
        code === 9 || // tab
        code === 10 || // newline
        code === 13 || // carriage return
        (code >= 32 && code <= 126) || // ASCII printable
        code > 127 // UTF-8 multibyte
      );
    }).length;

    const printableRatio = printableChars / text.length;

    // If >80% printable, consider it text
    return printableRatio > 0.8 ? 'text' : 'binary';
  } catch {
    return 'binary';
  }
}

function handleNotifications(event: { target: { value: DataView } }) {
  const { value } = event.target;
  const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);

  const contentType = detectContentType(bytes);

  if (contentType === 'text') {
    try {
      const text = textDecoder.decode(bytes);
      onText(text);
    } catch {
      // Decode failed despite detection, treat as binary
      const bytesCopy = new Uint8Array(bytes).slice();
      onBinary(bytesCopy.buffer);
    }
  } else {
    // Ensure we pass a real ArrayBuffer (not SharedArrayBuffer)
    const bytesCopy = new Uint8Array(bytes).slice();
    onBinary(bytesCopy.buffer);
  }
}

function onText(text: string) {
  logLine(`Received Text: ${text.trim()}`);

  // Version
  if (text.includes('Version:')) {
    const m = text.match(/Version:\s*([0-9.]+)/i);
    if (m) {
      const v = m[1];
      setDeviceVersion(v);
      if (v !== TESTED_FIRMWARE_VERSION) {
        logLine(`Warning: App developed for firmware v${TESTED_FIRMWARE_VERSION}; device is v${v}.`);
      }
    }
  }

  // sysmon status: battery + SFP presence
  if (text.includes('sysmon:')) {
    if (text.includes('sfp:[x]')) setSfpPresent(true);
    else if (text.includes('sfp:[ ]')) setSfpPresent(false);
    const bat = text.match(/bat:\[.\]\|\^?\|(\d+)%/);
    if (bat) setBattery(parseInt(bat[1], 10));
  }

  // Ack messages: surface as logs
  const ack: Record<string, string> = {
    'SIF start': 'Device acknowledged read operation - waiting for EEPROM data...',
    'SIF write start': 'Device acknowledged write operation - ready to receive data',
    'SIF write stop': 'Device confirmed write operation completed',
    'SIF write complete': 'Device confirmed write operation completed',
    'SIF erase start': 'Device started erase operation',
    'SIF erase stop': 'Device completed erase operation',
    'SIF stop': 'Device stopped SIF operation',
  };
  for (const [k, v] of Object.entries(ack)) {
    if (text.includes(k)) {
      logLine(v);
      break;
    }
  }

  // Resolve any listeners waiting for specific patterns
  const matched = listeners.filter((l) => (typeof l.pattern === 'string' ? text.includes(l.pattern) : (l.pattern as RegExp).test(text)));
  matched.forEach((l) => {
    clearTimeout(l.timeoutId);
    l.resolve(text);
  });
  if (matched.length) {
    // Remove matched
    for (const m of matched) {
      const idx = listeners.indexOf(m);
      if (idx >= 0) listeners.splice(idx, 1);
    }
  }
}

function onBinary(buf: ArrayBuffer) {
  logLine(`Received ${buf.byteLength} bytes of binary SFP data.`);
  setRawEeprom(buf);
}

// Backend helpers
export async function listModules() {
  try {
    const base = features.api.baseUrl;
    const res = await fetchWithRetry(`${base}/v1/modules`);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new APIError(`Failed to fetch modules: ${body}`, res.status);
    }

    return res.json();
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError('Network error while fetching modules', undefined, error);
  }
}

/**
 * Safely encode Uint8Array to base64 (handles large files)
 */
function base64Encode(bytes: Uint8Array): string {
  const chunkSize = 8192;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...Array.from(chunk));
  }

  return btoa(binary);
}

export async function saveCurrentModule(metadata?: Record<string, any>) {
  const buf = getBleState().rawEepromData;
  if (!buf) throw new Error('No EEPROM captured in memory');

  try {
    const repository = getModuleRepository();

    // Use repository to create module
    const result = await repository.createModule({
      name: metadata?.name || 'Unnamed Module',
      eepromData: buf,
    });

    // Return in same format as old API for backward compatibility
    return {
      status: result.isDuplicate ? 'duplicate' : 'success',
      message: result.message,
      id: result.module.id,
    };
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError('Failed to save module', undefined, error);
  }
}

// Proxy discovery helpers (optional)
export async function fetchProxyAdapters(): Promise<{ name: string; address?: string; powered?: boolean }[]> {
  const base = features.api.baseUrl;
  const res = await fetch(`${base}/v1/ble/adapters`);
  if (!res.ok) throw new Error('Adapter list unavailable');
  return res.json();
}

export async function inspectDeviceViaProxy(deviceAddress: string) {
  const base = features.api.baseUrl;
  const res = await fetch(`${base}/v1/ble/inspect?${new URLSearchParams({ device_address: deviceAddress }).toString()}`);
  if (!res.ok) throw new Error('Inspection failed');
  return res.json();
}

export function selectProfileFromGatt(gatt: { services?: { uuid: string; characteristics?: { uuid: string; properties?: string[] }[] }[] }) {
  if (!gatt || !gatt.services) throw new Error('Invalid GATT data');
  let best: SfpProfile | null = null;
  for (const svc of gatt.services) {
    const chars = svc.characteristics || [];
    const notifyChar = chars.find((c) => (c.properties || []).includes('notify'));
    const writeNoRsp = chars.find((c) => (c.properties || []).includes('write-without-response'));
    const write = chars.find((c) => (c.properties || []).includes('write'));
    const writeChar = (writeNoRsp || write) as any;
    if (notifyChar && writeChar) {
      best = { serviceUuid: svc.uuid, notifyCharUuid: notifyChar.uuid, writeCharUuid: writeChar.uuid };
      break;
    }
  }
  if (!best) {
    let notifySvc: any = null,
      notifyChar: any = null;
    for (const svc of gatt.services) {
      const c = (svc.characteristics || []).find((x) => (x.properties || []).includes('notify'));
      if (c) {
        notifySvc = svc;
        notifyChar = c;
        break;
      }
    }
    let writeChar: any = null;
    for (const svc of gatt.services) {
      const c = (svc.characteristics || []).find((x) => (x.properties || []).includes('write-without-response') || (x.properties || []).includes('write'));
      if (c) {
        writeChar = c;
        break;
      }
    }
    if (!notifyChar || !writeChar) throw new Error('Could not infer SFP profile from proxy GATT');
    best = { serviceUuid: notifySvc.uuid, notifyCharUuid: notifyChar.uuid, writeCharUuid: writeChar.uuid };
  }
  return best;
}

export async function connectViaProxyAddress(address: string, adapter?: string) {
  const proxy = new BLEProxyClient(buildDefaultProxyWsUrl('/api/v1/ble/ws'));
  await proxy.connect();
  const insp = await inspectDeviceViaProxy(address);
  const profile = selectProfileFromGatt(insp.gatt);
  const full: SfpProfile = { ...profile, deviceAddress: address, deviceName: insp?.device?.name || 'Unknown' };
  saveActiveProfile(full);
  const device = await proxy.requestDevice({ services: [profile.serviceUuid], deviceAddress: address, adapter: adapter || null });
  const gatt = await device.gatt.connect();
  const svc = await gatt.getPrimaryService(profile.serviceUuid);
  const writeCharacteristic = await svc.getCharacteristic(profile.writeCharUuid);
  const notifyCharacteristic = await svc.getCharacteristic(profile.notifyCharUuid);
  active = { mode: 'proxy', write: writeCharacteristic, notify: notifyCharacteristic, proxy };
  await startNotifications(notifyCharacteristic, handleNotifications);
  setConnected(true);
  setConnectionType('Proxy (via Backend)');
  await getDeviceVersion();
  scheduleStatusMonitoring();
}

export async function discoverProxyDevices({ timeout = 5, adapter }: { timeout?: number; adapter?: string }) {
  // Use an existing proxy connection if present; otherwise create a transient one
  let proxy = active?.proxy;
  if (!proxy) {
    proxy = new BLEProxyClient(buildDefaultProxyWsUrl('/api/v1/ble/ws'));
    await proxy.connect();
  } else if (!proxy.connected) {
    await proxy.connect();
  }
  const results = await proxy.discoverDevices({ serviceUuid: null, timeout, adapter: adapter ?? null });
  return results as Array<{ name?: string; address?: string; rssi?: number }>;
}

export function waitForMessage(pattern: string | RegExp, timeoutMs = 5000) {
  return new Promise<string>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const idx = listeners.findIndex((x) => x.resolve === resolve);
      if (idx >= 0) listeners.splice(idx, 1);
      reject(new Error(`Timeout waiting for message: ${String(pattern)}`));
    }, timeoutMs);
    listeners.push({ pattern, resolve, reject, timeoutId });
  });
}

export async function writeSfpFromModuleId(moduleId: string) {
  try {
    const repository = getModuleRepository();

    // 1. Fetch binary EEPROM using repository
    const buf = await repository.getEEPROMData(moduleId);
    logLine(`Retrieved ${buf.byteLength} bytes of EEPROM data.`);

    // 2. Initiate write
    await sendBleCommand('[POST] /sif/write');

    // 3. Optional ack wait
    try {
      await waitForMessage('SIF write start', 5000);
      logLine('Device ready to receive EEPROM data.');
    } catch (e: any) {
      logLine(`Warning: ${e?.message || String(e)}. Proceeding anyway...`);
    }

    // 4. Chunk write
    await writeSfpFromBuffer(buf);

    // 5. Completion ack
    try {
      await Promise.race([
        waitForMessage('SIF write stop', 10000),
        waitForMessage('SIF write complete', 10000),
      ]);
      logLine('Write operation completed.');
    } catch (e: any) {
      logLine(`Warning: ${e?.message || String(e)}. Write may have completed.`);
    }
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError('Failed to write module', undefined, error);
  }
}
