"use client";
import { useEffect, useSyncExternalStore, useState } from 'react';
import { ConnectionModeSelector } from './ConnectionModeSelector';
import type { ConnectionMode } from '@/lib/ble/types';
import { connect, requestSfpRead, saveCurrentModule, listModules, connectViaProxyAddress, writeSfpFromModuleId } from '@/lib/ble/manager';
import { getBleState, subscribe } from '@/lib/ble/store';
import { ProxyDiscovery } from '@/components/ble/ProxyDiscovery';
import { ConnectionStatus } from '@/components/ble/ConnectionStatus';
import { DirectDiscovery } from '@/components/ble/DirectDiscovery';
import { loadActiveProfile, saveActiveProfile } from '@/lib/ble/profile';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Alert, AlertDescription } from '@/registry/new-york-v4/ui/alert';
import { isIOS, isSafari, isWebBluetoothAvailable } from '@/lib/ble/webbluetooth';
import { toast } from 'sonner';
import { detectBluetoothSupport } from '@/lib/ble/support';

export function ConnectPanel() {
  const [mode, setMode] = useState<ConnectionMode>('auto');
  const state = useSyncExternalStore(subscribe, getBleState, getBleState);
  const [busy, setBusy] = useState(false);
  const [modules, setModules] = useState<any[]>([]);
  const [svc, setSvc] = useState('');
  const [wrt, setWrt] = useState('');
  const [ntf, setNtf] = useState('');
  const [proxyAddr, setProxyAddr] = useState('');
  const [support, setSupport] = useState<{ summary: string; reasons: string[] } | null>(null);

  useEffect(() => {
    // Load module list initially (non-blocking)
    listModules().then(setModules).catch(() => {});
    // Run a smoke test for Web Bluetooth environment capabilities
    detectBluetoothSupport().then((res) => {
      const points = [
        `Secure Context: ${res.secureContext ? 'yes' : 'no'}`,
        `Loopback Host: ${res.loopbackHost ? 'yes' : 'no'}`,
        `navigator.bluetooth: ${res.hasNavigatorBluetooth ? 'present' : 'missing'}`,
        `requestDevice: ${res.hasRequestDevice ? 'present' : 'missing'}`,
        `availability: ${res.availability === null ? 'unknown' : res.availability ? 'available' : 'unavailable'}`,
      ].join(' · ');
      setSupport({ summary: points, reasons: res.reasons });
    }).catch((error) => console.error('Failed to detect Bluetooth support:', error));
    const p = loadActiveProfile();
    if (p) {
      setSvc(p.serviceUuid);
      setWrt(p.writeCharUuid);
      setNtf(p.notifyCharUuid);
    }
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

  const onWriteModule = async (id: number) => {
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
      <div>
        <strong>Direct Discovery</strong>
        <DirectDiscovery />
      </div>
      <div>
        <strong>Proxy Discovery</strong>
        <ProxyDiscovery />
      </div>
      <div>
        <strong>Profile</strong>
        <div className="mt-2 grid gap-3 sm:grid-cols-3" style={{ maxWidth: 880 }}>
          <div className="grid gap-1">
            <Label>Service UUID</Label>
            <Input placeholder="Service UUID" value={svc} onChange={(e) => setSvc(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Write Char UUID</Label>
            <Input placeholder="Write Char UUID" value={wrt} onChange={(e) => setWrt(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Notify Char UUID</Label>
            <Input placeholder="Notify Char UUID" value={ntf} onChange={(e) => setNtf(e.target.value)} />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button onClick={onSaveProfile}>Save Profile</Button>
          <Button onClick={onLoadDefaultProfile} variant="secondary">
            Load Default from Backend
          </Button>
        </div>
      </div>
      <div>
        <strong>Proxy</strong>
        <div className="mt-2 flex items-center gap-2">
          <Input placeholder="Device Address (optional)" value={proxyAddr} onChange={(e) => setProxyAddr(e.target.value)} />
          <Button onClick={onProxyConnectAddress} disabled={busy}>Connect via Proxy (by address)</Button>
        </div>
      </div>
      
    </div>
  );
}
