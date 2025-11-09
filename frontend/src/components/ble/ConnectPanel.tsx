"use client";
import { useEffect, useSyncExternalStore, useState } from 'react';
import { ConnectionModeSelector } from './ConnectionModeSelector';
import type { ConnectionMode } from '@/lib/ble/types';
import { connect, requestSfpRead, saveCurrentModule, listModules, connectViaProxyAddress, writeSfpFromModuleId } from '@/lib/ble/manager';
import { getBleState, subscribe } from '@/lib/ble/store';
import { ProxyDiscovery } from '@/components/ble/ProxyDiscovery';
import { ConnectionStatus } from '@/components/ble/ConnectionStatus';
import { DirectDiscovery } from '@/components/ble/DirectDiscovery';
import { ESPHomeDiscovery } from '@/components/esphome/ESPHomeDiscovery';
import { loadActiveProfile, saveActiveProfile } from '@/lib/ble/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { isIOS, isSafari, isWebBluetoothAvailable } from '@/lib/ble/webbluetooth';
import { toast } from 'sonner';
import { detectBluetoothSupport } from '@/lib/ble/support';
import { isStandalone } from '@/lib/features-client';

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

export function ConnectPanel() {
  const [mode, setMode] = useState<ConnectionMode>('auto');
  const state = useSyncExternalStore(subscribe, getBleState, getServerSnapshot);
  const [busy, setBusy] = useState(false);
  const [modules, setModules] = useState<any[]>([]);
  const [svc, setSvc] = useState('');
  const [wrt, setWrt] = useState('');
  const [ntf, setNtf] = useState('');
  const [proxyAddr, setProxyAddr] = useState('');
  const [support, setSupport] = useState<{ summary: string; reasons: string[] } | null>(null);
  const [esphomeEnabled, setEsphomeEnabled] = useState(false);

  useEffect(() => {
    const loadModules = async () => {
      // Only available in standalone/HA modes
      if (!isStandalone()) return;
      try {
        const list = await listModules();
        setModules(list);
      } catch (error) {
        console.error('Failed to load modules', error);
      }
    };

    const runSupportProbe = async () => {
      try {
        const res = await detectBluetoothSupport();
        const points = [
          `Secure Context: ${res.secureContext ? 'yes' : 'no'}`,
          `Loopback Host: ${res.loopbackHost ? 'yes' : 'no'}`,
          `navigator.bluetooth: ${res.hasNavigatorBluetooth ? 'present' : 'missing'}`,
          `requestDevice: ${res.hasRequestDevice ? 'present' : 'missing'}`,
          `availability: ${res.availability === null ? 'unknown' : res.availability ? 'available' : 'unavailable'}`,
        ].join(' · ');
        setSupport({ summary: points, reasons: res.reasons });
      } catch (error) {
        console.error('Failed to detect Bluetooth support', error);
      }
    };

    const checkEsphomeStatus = async () => {
      // ESPHome API only available in standalone/HA modes
      if (!isStandalone()) {
        setEsphomeEnabled(false);
        return;
      }

      try {
        const res = await fetch('/api/v1/esphome/status');
        const data = await res.json();
        setEsphomeEnabled(Boolean(data.enabled));
      } catch (error) {
        console.error('Failed to determine ESPHome status', error);
        setEsphomeEnabled(false);
      }
    };

    void loadModules();
    void runSupportProbe();
    const p = loadActiveProfile();
    if (p) {
      setSvc(p.serviceUuid);
      setWrt(p.writeCharUuid);
      setNtf(p.notifyCharUuid);
    }
    void checkEsphomeStatus();
  }, []);

  const onConnect = async () => {
    try {
      setBusy(true);
      await connect(mode);
      toast.success('Connected');
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const onRead = async () => {
    try {
      setBusy(true);
      await requestSfpRead();
      toast('Requested SFP read');
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    try {
      setBusy(true);
      await saveCurrentModule();
      const list = await listModules();
      setModules(list);
      toast.success('Module saved');
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const onWriteModule = async (id: string) => {
    const confirmed = window.confirm(
      'WARNING: Writing EEPROM data can permanently damage your SFP module if incorrect data is used.\n\n' +
        'Before proceeding:\n' +
        '✓ Ensure you have backed up the original module data\n' +
        '✓ Verify this is the correct module profile\n' +
        '✓ Use test/non-critical modules first\n\n' +
        'Do you want to continue?'
    );
    if (!confirmed) return;
    try {
      setBusy(true);
      await writeSfpFromModuleId(id);
      toast.success('Write completed', { description: 'Consider reading back to verify' });
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSaveProfile = () => {
    try {
      if (!svc || !wrt || !ntf) throw new Error('All UUIDs are required');
      saveActiveProfile({ serviceUuid: svc, writeCharUuid: wrt, notifyCharUuid: ntf });
      toast.success('Profile saved');
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  const onLoadDefaultProfile = async () => {
    // Config API only available in standalone/HA modes
    if (!isStandalone()) {
      toast.error('Default profile loading only available in standalone/HA mode');
      return;
    }

    try {
      const res = await fetch('/api/v1/config');
      const cfg = await res.json();
      if (cfg?.default_profile) {
        saveActiveProfile(cfg.default_profile);
        setSvc(cfg.default_profile.serviceUuid);
        setWrt(cfg.default_profile.writeCharUuid);
        setNtf(cfg.default_profile.notifyCharUuid);
        toast.success('Default profile loaded');
      } else {
        toast('No default profile provided by backend');
      }
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  const onProxyConnectAddress = async () => {
    try {
      setBusy(true);
      if (!proxyAddr) throw new Error('Enter device address');
      await connectViaProxyAddress(proxyAddr);
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <Alert>
          <AlertDescription>
            {support ? (
              <>
                <div className="mb-1">Web Bluetooth environment check:</div>
                <div className="text-xs text-neutral-500">{support.summary}</div>
                {support.reasons.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-xs">
                    {support.reasons.map((r, i) => (<li key={i}>{r}</li>))}
                  </ul>
                )}
                {support.reasons.length === 0 && (
                  <div className="mt-2 text-xs text-emerald-600">Looks good. Prefer Web Bluetooth or Auto mode.</div>
                )}
              </>
            ) : 'Checking Web Bluetooth support…'}
          </AlertDescription>
        </Alert>
      </div>
      <ConnectionModeSelector value={mode} onChange={setMode} />
      <div className="flex items-center gap-2">
        <Button onClick={onConnect} disabled={busy} id="connectButton">
          {state.connected ? 'Reconnect' : 'Connect'}
        </Button>
        <Button onClick={onRead} disabled={!state.connected || busy} id="readSfpButton" variant="secondary">
          Read SFP
        </Button>
        <Button onClick={onSave} disabled={!state.rawEepromData || busy} id="saveModuleButton" variant="outline">
          Save Module
        </Button>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <ConnectionStatus />
          <div className="mt-2 text-sm">
            <strong>EEPROM:</strong> {state.rawEepromData ? `${state.rawEepromData.byteLength} bytes` : '—'}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <strong>Modules</strong>
          <ul className="grid gap-1">
            {modules?.map((m) => (
              <li key={m.id} className="flex items-center justify-between">
                <div>
                  #{m.id} {m.vendor} {m.model} {m.serial}
                </div>
                <div className="ml-3">
                  <Button onClick={() => onWriteModule(m.id)} disabled={busy || !state.connected} size="sm">
                    Write
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {(mode === 'web-bluetooth' || mode === 'auto') && (
        <div>
          <strong>Direct Discovery</strong>
          <DirectDiscovery />
        </div>
      )}
      {mode === 'esphome-proxy' && esphomeEnabled && (
        <div>
          <strong>ESPHome Proxy Discovery</strong>
          <ESPHomeDiscovery />
        </div>
      )}
      {mode === 'proxy' && (
        <div>
          <strong>Proxy Discovery (Legacy)</strong>
          <ProxyDiscovery />
        </div>
      )}
    </div>
  );
}
