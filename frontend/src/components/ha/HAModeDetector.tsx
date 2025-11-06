/**
 * Home Assistant mode detector and router component.
 *
 * Detects if running in HA add-on mode and renders appropriate UI.
 */

'use client';

import { useState, useEffect } from 'react';
import { isHAAddonMode } from '@/lib/api/ha/haBluetoothClient';
import { HABluetoothDiscovery } from './HABluetoothDiscovery';
import { ConnectPanel } from '@/components/ble/ConnectPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Home, Loader2 } from 'lucide-react';
import type { HABluetoothDevice } from '@/types/ha-bluetooth';

export function HAModeDetector() {
  const [isHA, setIsHA] = useState<boolean | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<HABluetoothDevice | null>(null);

  useEffect(() => {
    // Detect HA addon mode
    isHAAddonMode().then(setIsHA).catch(() => setIsHA(false));
  }, []);

  const handleDeviceConnect = (device: HABluetoothDevice) => {
    setSelectedDevice(device);
    console.log('Device connected in HA mode:', device);
  };

  // Loading state
  if (isHA === null) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Home Assistant Add-On mode
  if (isHA) {
    return (
      <div className="space-y-6">
        <Alert>
          <Home className="h-4 w-4" />
          <AlertDescription>
            Running in <strong>Home Assistant Add-On</strong> mode. Devices are auto-discovered via HA Bluetooth integration.
          </AlertDescription>
        </Alert>

        <HABluetoothDiscovery onDeviceConnect={handleDeviceConnect} />

        {selectedDevice && (
          <Card>
            <CardHeader>
              <CardTitle>Connected Device</CardTitle>
              <CardDescription>
                {selectedDevice.name} ({selectedDevice.mac})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Device operations will be available here. Integration with existing BLE components coming soon.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Standalone mode (Web Bluetooth or ESPHome proxy)
  return (
    <Card>
      <CardHeader>
        <CardTitle>BLE Control</CardTitle>
        <CardDescription>Connect, read EEPROM, save modules, and proxy discovery</CardDescription>
      </CardHeader>
      <CardContent>
        <ConnectPanel />
      </CardContent>
    </Card>
  );
}
