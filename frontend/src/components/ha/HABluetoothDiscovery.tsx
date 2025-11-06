/**
 * Home Assistant Bluetooth device discovery component.
 *
 * Polls the HA Bluetooth API and displays auto-discovered SFP Wizard devices
 * with a simplified click-to-connect interface.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { haBluetoothClient } from '@/lib/api/ha/haBluetoothClient';
import type { HABluetoothDevice } from '@/types/ha-bluetooth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SignalStrength } from './SignalStrength';
import { Bluetooth, RefreshCw, Wifi } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface HABluetoothDiscoveryProps {
  onDeviceConnect?: (device: HABluetoothDevice) => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function HABluetoothDiscovery({
  onDeviceConnect,
  autoRefresh = true,
  refreshInterval = 5000,
}: HABluetoothDiscoveryProps) {
  const [devices, setDevices] = useState<HABluetoothDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  // Fetch devices from backend
  const fetchDevices = useCallback(async () => {
    try {
      setError(null);
      const discoveredDevices = await haBluetoothClient.getDevices();
      setDevices(discoveredDevices);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch devices:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch devices');
      setLoading(false);
    }
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    // Initial fetch
    fetchDevices();

    if (!autoRefresh) return;

    // Set up polling interval
    const interval = setInterval(fetchDevices, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchDevices, autoRefresh, refreshInterval]);

  // Handle device connection
  const handleConnect = async (device: HABluetoothDevice) => {
    setConnecting(device.mac);
    setError(null);

    try {
      const result = await haBluetoothClient.connect(device.mac);

      // Cache UUIDs in localStorage for future use
      localStorage.setItem('sfp_service_uuid', result.service_uuid);
      localStorage.setItem('sfp_notify_char_uuid', result.notify_char_uuid);
      localStorage.setItem('sfp_write_char_uuid', result.write_char_uuid);

      // Notify parent component
      if (onDeviceConnect) {
        onDeviceConnect(device);
      }

      console.log('Connected to device:', device.name, result);
    } catch (err) {
      console.error('Connection failed:', err);
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bluetooth className="h-5 w-5" />
            Discovering Devices...
          </CardTitle>
          <CardDescription>
            Scanning for SFP Wizard devices via Home Assistant Bluetooth
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bluetooth className="h-5 w-5" />
              Discovered Devices
            </CardTitle>
            <CardDescription>
              Auto-discovered via Home Assistant Bluetooth
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDevices()}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {devices.length === 0 ? (
          <div className="text-center py-8">
            <Bluetooth className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-2">
              No SFP devices found
            </p>
            <p className="text-sm text-muted-foreground">
              Make sure your SFP Wizard is powered on and advertising
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {devices.map((device) => (
              <Card key={device.mac} className="overflow-hidden">
                <div className="flex items-center justify-between p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{device.name}</h3>
                      <SignalStrength rssi={device.rssi} />
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="font-mono">{device.mac}</span>
                      {device.last_seen && (
                        <span>
                          • {formatDistanceToNow(new Date(device.last_seen), { addSuffix: true })}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Wifi className="h-3 w-3" />
                        {device.source}
                      </Badge>
                      <Badge variant="secondary">
                        {device.rssi} dBm
                      </Badge>
                    </div>
                  </div>

                  <Button
                    onClick={() => handleConnect(device)}
                    disabled={connecting === device.mac}
                    className="ml-4"
                  >
                    {connecting === device.mac ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Bluetooth className="h-4 w-4 mr-2" />
                        Connect
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
