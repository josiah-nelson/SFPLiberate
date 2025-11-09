"use client";
import { useEffect, useMemo, useState } from 'react';
import type { ConnectionMode } from '@/lib/ble/types';
import { BLEProxyClient } from '@/lib/ble/proxyClient';
import { isWebBluetoothAvailable } from '@/lib/ble/webbluetooth';
import { getESPHomeClient } from '@/lib/esphome/esphomeClient';
import { isAppwrite } from '@/lib/features-client';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ConnectionModeSelector(props: { value: ConnectionMode; onChange: (v: ConnectionMode) => void }) {
  const [proxyAvailable, setProxyAvailable] = useState(false);
  const [esphomeAvailable, setEsphomeAvailable] = useState(false);
  const webBluetooth = useMemo(() => isWebBluetoothAvailable(), []);

  useEffect(() => {
    setProxyAvailable(BLEProxyClient.isAvailable());

    if (isAppwrite()) {
      setEsphomeAvailable(false);
      return;
    }
    // Check ESPHome availability
    const client = getESPHomeClient();
    client.isEnabled().then(setEsphomeAvailable).catch(() => setEsphomeAvailable(false));
  }, []);

  function hint(value: ConnectionMode) {
    if (value === 'web-bluetooth') return webBluetooth ? 'Direct via Web Bluetooth' : 'Not supported in this browser';
    if (value === 'proxy') return 'Proxy via backend WebSocket (legacy)';
    if (value === 'esphome-proxy') return 'ESPHome Bluetooth Proxy (Safari/iOS compatible)';
    // auto
    if (webBluetooth) return 'Direct via Web Bluetooth';
    if (esphomeAvailable) return 'ESPHome Proxy via network';
    if (proxyAvailable) return 'Proxy via backend (Safari/iOS compatible)';
    return 'No supported BLE method available';
  }

  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="connectionMode">Connection Mode</Label>
      <Select value={props.value} onValueChange={(v) => props.onChange(v as ConnectionMode)}>
        <SelectTrigger id="connectionMode" className="w-[200px]">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">Auto</SelectItem>
          <SelectItem value="web-bluetooth">Web Bluetooth</SelectItem>
          {esphomeAvailable && <SelectItem value="esphome-proxy">ESPHome Proxy</SelectItem>}
          {proxyAvailable && <SelectItem value="proxy">Proxy (legacy)</SelectItem>}
        </SelectContent>
      </Select>
      <span className="text-sm text-neutral-500">{hint(props.value)}</span>
    </div>
  );
}
