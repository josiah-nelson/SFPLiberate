"use client";
import { useCallback, useMemo, useState } from 'react';
import { isWebBluetoothAvailable, requestAnyDeviceChooser } from '@/lib/ble/webbluetooth';
import { loadActiveProfile } from '@/lib/ble/profile';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Alert, AlertDescription } from '@/registry/new-york-v4/ui/alert';
import { Label } from '@/registry/new-york-v4/ui/label';
import { toast } from 'sonner';
import { connect } from '@/lib/ble/manager';
import type { ConnectionMode } from '@/lib/ble/types';
import { canScan, scanForSfp, connectAndInferProfileFromServices } from '@/lib/ble/discovery';
import { discoverProxyDevices, connectViaProxyAddress } from '@/lib/ble/manager';

export function DirectDiscovery() {
  const supported = useMemo(() => isWebBluetoothAvailable(), []);
  const [selected, setSelected] = useState<{ name?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const onScan = useCallback(async () => {
    try {
      setBusy(true);
      // Open native chooser without requiring a profile
      const device = await requestAnyDeviceChooser();
      setSelected({ name: device?.name });
      toast.success('Device selected');
    } catch (e: any) {
      if (e && e.name === 'NotFoundError') return; // user canceled chooser
      toast.error(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const onConnectNow = useCallback(async () => {
    try {
      setBusy(true);
      const profile = loadActiveProfile();
      if (!profile?.serviceUuid || !profile?.writeCharUuid || !profile?.notifyCharUuid) {
        toast('No profile set yet. Use Proxy Discovery below to resolve UUIDs, then connect.');
        return;
      }
      await connect('web-bluetooth' as ConnectionMode);
      toast.success('Connected');
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const onQuickSfpConnect = useCallback(async () => {
    try {
      setBusy(true);
      if (!canScan()) {
        toast('This browser does not support Web Bluetooth Scanning; use Proxy Discovery once to resolve UUIDs.');
        return;
      }
      const adv = await scanForSfp(7000);
      if (!adv || !adv.uuids || adv.uuids.length === 0) {
        toast('No SFP advertisements with service UUIDs detected. Try Proxy Discovery.');
        return;
      }
      // Reopen chooser with namePrefix and discovered optionalServices
      // @ts-expect-error Web Bluetooth typings not included by default
      const device = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'SFP' }, { namePrefix: 'sfp' }], optionalServices: adv.uuids });
      const ok = await connectAndInferProfileFromServices(device, adv.uuids);
      if (!ok) {
        toast('Could not infer notify/write characteristics. Use Proxy Discovery to resolve UUIDs.');
        return;
      }
      toast.success('Profile inferred from SFP device');
    } catch (e: any) {
      if (e && e.name === 'NotFoundError') return; // chooser canceled
      toast.error(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const onDiscoverAndConnect = useCallback(async () => {
    try {
      setBusy(true);
      let connectedViaScan = false;
      // 1) Try scanning path (best UX for direct connect)
      if (canScan()) {
        try {
          const adv = await scanForSfp(7000);
          if (adv && adv.uuids && adv.uuids.length > 0) {
            // Reopen chooser with namePrefix and discovered optionalServices
            // @ts-expect-error Web Bluetooth typings not included by default
            const device = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'SFP' }, { namePrefix: 'sfp' }], optionalServices: adv.uuids });
            const ok = await connectAndInferProfileFromServices(device, adv.uuids);
            if (ok) {
              await connect('web-bluetooth' as ConnectionMode);
              toast.success('Connected (Direct)');
              connectedViaScan = true;
            }
          }
        } catch (e: any) {
          // If the user cancels the chooser, stop without falling back
          if (e && e.name === 'NotFoundError') {
            setBusy(false);
            return;
          }
          // Otherwise, continue to proxy fallback
          console.warn('Direct scan/connect failed; falling back to proxy.', e);
        }
      }

      if (connectedViaScan) {
        setBusy(false);
        return;
      }

      // 2) Fallback silently to proxy discovery + connect
      try {
        const results = await discoverProxyDevices({ timeout: 5 });
        const sfps = (results || []).filter((d) => (d.name || '').toLowerCase().includes('sfp'));
        if (sfps.length === 0) {
          toast('No SFP devices found via proxy');
          return;
        }
        const chosen = sfps[0];
        if (!chosen.address) {
          toast('Proxy discovery found SFP, but no address available to connect');
          return;
        }
        await connectViaProxyAddress(chosen.address);
        toast.success('Connected (Proxy)');
      } catch (e: any) {
        toast.error(e?.message || String(e));
      }
    } catch (e: any) {
      if (e && e.name === 'NotFoundError') return;
      toast.error(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  if (!supported) {
    return (
      <Alert>
        <AlertDescription>
          Web Bluetooth is not available in this browser. Use Proxy mode (recommended for Safari/iOS) or a browser that supports Web Bluetooth.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="text-sm text-neutral-600 dark:text-neutral-300">
        Use your browser's native device chooser to select the SFP Wizard, then connect.
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={onDiscoverAndConnect} disabled={busy}>
          Discover SFP and Connect
        </Button>
        <Button onClick={onScan} disabled={busy} id="scanButton">
          {busy ? 'Opening Chooser…' : 'Scan (Open Chooser)'}
        </Button>
        <Button onClick={onConnectNow} disabled={!selected || busy} variant="secondary">
          Connect Now
        </Button>
        <Button onClick={onQuickSfpConnect} disabled={busy} variant="outline">
          Quick SFP Connect (beta)
        </Button>
      </div>
      {selected && (
        <div className="text-sm text-neutral-500">
          <Label className="mr-2">Selected:</Label>
          <span>{selected.name || 'Unknown device'}</span>
          <div className="mt-1 text-xs">
            Tip: If Connect is disabled, use <strong>Proxy Discovery</strong> below to resolve service/write/notify UUIDs, then return to direct connect.
          </div>
        </div>
      )}
    </div>
  );
}
