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

export function LogsPanel() {
  const st = useSyncExternalStore(subscribe, getBleState, getServerSnapshot);
  return (
    <div className="h-[320px] overflow-auto rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      {st.logs.length === 0 && <div className="text-neutral-500">No logs yet.</div>}
      {st.logs.map((l, i) => (
        <div key={i} className="whitespace-pre-wrap">
          {l}
        </div>
      ))}
    </div>
  );
}

