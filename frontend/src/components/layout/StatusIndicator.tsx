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

export function StatusIndicator() {
  const st = useSyncExternalStore(subscribe, getBleState, getServerSnapshot);
  const color = st.connected ? 'bg-emerald-500' : 'bg-zinc-400';
  const label = st.connected ? st.connectionType : 'Disconnected';
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
      <span className={`inline-block size-2 rounded-full ${color}`} />
      <span>{label}</span>
      {st.deviceVersion ? <span className="text-neutral-500">• fw {st.deviceVersion}</span> : null}
    </div>
  );
}

