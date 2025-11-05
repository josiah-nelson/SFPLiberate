"use client";
import { useSyncExternalStore } from 'react';
import { getBleState, subscribe } from '@/lib/ble/store';

// Server snapshot that returns stable initial state
const getServerSnapshot = () => ({
  connected: false,
  connectionType: 'Not Connected' as const,
  resolvedMode: 'none' as const,
  deviceVersion: null,
  sfpPresent: undefined,
  batteryPct: undefined,
  rawEepromData: null,
  logs: [],
});

export function ConnectionStatus() {
  const st = useSyncExternalStore(subscribe, getBleState, getServerSnapshot);
  const badge = (value: string, kind: 'ok' | 'warn' | 'off' = 'ok') => (
    <span
      style={{
        padding: '2px 6px',
        borderRadius: 6,
        fontSize: 12,
        background:
          kind === 'ok' ? 'rgba(16,185,129,0.15)' : kind === 'warn' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
        border: '1px solid rgba(0,0,0,0.1)',
      }}
    >
      {value}
    </span>
  );

  return (
    <div className="grid gap-2 text-sm">
      <div>
        <strong>BLE:</strong> {badge(st.connected ? 'Connected' : 'Disconnected', st.connected ? 'ok' : 'off')}
      </div>
      <div>
        <strong>Type:</strong> {st.connectionType}
      </div>
      <div>
        <strong>Firmware:</strong> {st.deviceVersion ?? '—'}
      </div>
      <div>
        <strong>SFP Present:</strong>{' '}
        {st.sfpPresent === undefined ? 'Unknown' : st.sfpPresent ? badge('Yes', 'ok') : badge('No', 'off')}
      </div>
      <div>
        <strong>Battery:</strong> {st.batteryPct === undefined ? '—' : `${st.batteryPct}%`}
      </div>
    </div>
  );
}

