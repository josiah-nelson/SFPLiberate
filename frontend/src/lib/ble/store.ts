import type { ResolvedMode } from './types';

type Listener = () => void;

export type BleState = {
  connected: boolean;
  connectionType: 'Not Connected' | 'Direct (Web Bluetooth)' | 'Proxy (via Backend)' | 'ESPHome Proxy (WebSocket)';
  resolvedMode: ResolvedMode;
  deviceVersion?: string | null;
  sfpPresent?: boolean;
  batteryPct?: number;
  rawEepromData?: ArrayBuffer | null;
  logs: string[];
};

const state: BleState = {
  connected: false,
  connectionType: 'Not Connected',
  resolvedMode: 'none',
  deviceVersion: null,
  sfpPresent: undefined,
  batteryPct: undefined,
  rawEepromData: null,
  logs: [],
};

const listeners = new Set<Listener>();

export function getBleState(): BleState {
  return state;
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((l) => l());
}

export function setConnected(yes: boolean) {
  state.connected = yes;
  state.connectionType = yes ? state.connectionType : 'Not Connected';
  emit();
}

export function setConnectionType(text: BleState['connectionType']) {
  state.connectionType = text;
  emit();
}

export function setResolvedMode(mode: ResolvedMode) {
  state.resolvedMode = mode;
  emit();
}

export function setDeviceVersion(v: string | null) {
  state.deviceVersion = v;
  emit();
}

export function setSfpPresent(present: boolean | undefined) {
  state.sfpPresent = present;
  emit();
}

export function setBattery(pct: number | undefined) {
  state.batteryPct = pct;
  emit();
}

export function setRawEeprom(buf: ArrayBuffer | null) {
  state.rawEepromData = buf;
  emit();
}

export function log(line: string) {
  state.logs = [`[${new Date().toLocaleTimeString()}] ${line}`, ...state.logs].slice(0, 500);
  emit();
}
