"use client";
import { discoverAndConnectSfpDevice, type DiscoveryError } from '@/lib/ble/discovery';
import { connect } from '@/lib/ble/manager';
import { loadActiveProfile } from '@/lib/ble/profile';
import type { ConnectionMode } from '@/lib/ble/types';
import { isWebBluetoothAvailable } from '@/lib/ble/webbluetooth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CheckCircle2, InfoIcon, XCircle } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

export function DirectDiscovery() {
  const supported = useMemo(() => isWebBluetoothAvailable(), []);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [profileConfigured, setProfileConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('');

  // Check if profile is already configured on mount
  useMemo(() => {
    const profile = loadActiveProfile();
    if (profile?.serviceUuid && profile?.writeCharUuid && profile?.notifyCharUuid) {
      setProfileConfigured(true);
      setDeviceName(profile.deviceName || 'Previously configured device');
    }
  }, []);

  /**
   * Main discovery and connect flow - one-click solution
   * This handles everything: device selection, service enumeration, profile saving, and connection
   */
  const onDiscoverAndConnect = useCallback(async () => {
    setBusy(true);
    setStatus('Opening device chooser...');

    try {
      // Step 1: Discover device and enumerate services
      setStatus('Discovering device and enumerating services...');
      const { device, profile } = await discoverAndConnectSfpDevice();

      setDeviceName(device.name || 'SFP Wizard');
      setProfileConfigured(true);
      setStatus(`Profile configured for ${device.name || 'device'}`);

      toast.success('Device discovered! Profile configured.', {
        description: `Service: ${profile.serviceUuid.slice(0, 8)}...`,
      });

      // Step 2: Connect using the discovered profile
      setStatus('Connecting to device...');
      await connect('web-bluetooth' as ConnectionMode);

      toast.success('Connected successfully!', {
        description: `Connected to ${device.name || 'SFP Wizard'}`,
      });

      setStatus('');

    } catch (error: any) {
      const err = error as DiscoveryError;

      // Handle different error types with helpful messages
      switch (err.code) {
        case 'user-cancelled':
          setStatus('');
          // Don't show error toast for user cancellation
          break;

        case 'not-supported':
          toast.error('Web Bluetooth Not Supported', {
            description: 'Your browser does not support Web Bluetooth. Try Chrome, Edge, or use Proxy mode.',
          });
          setStatus('');
          break;

        case 'no-device-found':
          toast.error('No Device Selected', {
            description: err.message || 'Please select a device with "SFP" in the name.',
          });
          setStatus('');
          break;

        case 'no-services-found':
          toast.error('Device Profile Not Found', {
            description: err.message || 'Could not find notify/write characteristics. Try Proxy Discovery.',
            duration: 8000,
          });
          setStatus('');
          break;

        case 'connection-failed':
          toast.error('Connection Failed', {
            description: 'Make sure the device is on, not connected elsewhere, and in range.',
            duration: 6000,
          });
          setStatus('');
          break;

        default:
          toast.error('Discovery Failed', {
            description: error?.message || String(error),
            duration: 5000,
          });
          setStatus('');
      }

      console.error('Discovery error:', err);
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * Reconnect using already-configured profile
   */
  const onReconnect = useCallback(async () => {
    setBusy(true);
    setStatus('Reconnecting...');

    try {
      const profile = loadActiveProfile();
      if (!profile?.serviceUuid || !profile?.writeCharUuid || !profile?.notifyCharUuid) {
        toast.warning('No Profile Configured', {
          description: 'Use "Discover and Connect" first to configure the device profile.',
        });
        return;
      }

      await connect('web-bluetooth' as ConnectionMode);

      toast.success('Reconnected!', {
        description: `Connected to ${profile.deviceName || 'device'}`,
      });

      setStatus('');
    } catch (error: any) {
      toast.error('Reconnection Failed', {
        description: error?.message || String(error),
      });
      setStatus('');
    } finally {
      setBusy(false);
    }
  }, []);

  if (!supported) {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertTitle>Web Bluetooth Not Available</AlertTitle>
        <AlertDescription>
          Your browser does not support Web Bluetooth.
          <br />
          <strong>Recommendations:</strong>
          <ul className="mt-2 ml-4 list-disc text-sm">
            <li>Use Chrome, Edge, or Opera (full support)</li>
            <li>Use Proxy mode (works on all browsers including Safari)</li>
            <li>Make sure you're on HTTPS or localhost</li>
          </ul>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-4">
      {/* Info banner */}
      <Alert>
        <InfoIcon className="h-4 w-4" />
        <AlertTitle>Direct Browser Connection</AlertTitle>
        <AlertDescription>
          Connect directly to your SFP Wizard using Web Bluetooth.
          The device will be automatically discovered and configured.
        </AlertDescription>
      </Alert>

      {/* Status display */}
      {profileConfigured && (
        <Alert>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle>Profile Configured</AlertTitle>
          <AlertDescription>
            Device: <strong>{deviceName}</strong>
            <br />
            <span className="text-xs text-neutral-500">
              You can now reconnect quickly without going through discovery again.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            onClick={onDiscoverAndConnect}
            disabled={busy}
            size="lg"
            className="flex-1"
          >
            {busy ? 'Working...' : 'Discover and Connect'}
          </Button>

          {profileConfigured && (
            <Button
              onClick={onReconnect}
              disabled={busy}
              variant="secondary"
              size="lg"
            >
              Reconnect
            </Button>
          )}
        </div>

        {status && (
          <div className="text-sm text-neutral-600 dark:text-neutral-400 flex items-center gap-2">
            <div className="animate-spin h-3 w-3 border-2 border-neutral-400 border-t-transparent rounded-full" />
            {status}
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="text-xs text-neutral-500 dark:text-neutral-400 space-y-1">
        <p><strong>First time?</strong> Click "Discover and Connect" to automatically find your SFP Wizard.</p>
        <p><strong>Already configured?</strong> Use "Reconnect" for a faster connection.</p>
        <p><strong>Need help?</strong> Make sure your device is powered on and not connected to another app.</p>
      </div>
    </div>
  );
}
