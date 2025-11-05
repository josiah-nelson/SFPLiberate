'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getESPHomeClient } from '@/lib/esphome/esphomeClient';
import { getSignalStrength, getSignalColor } from '@/lib/esphome/esphomeTypes';
import type { DiscoveredDevice } from '@/lib/esphome/esphomeTypes';
import { saveActiveProfile } from '@/lib/ble/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Wifi, WifiOff } from 'lucide-react';

export function ESPHomeDiscovery() {
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [manualMac, setManualMac] = useState<string>('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [scanTimeout, setScanTimeout] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectingMac, setConnectingMac] = useState<string | null>(null);

  useEffect(() => {
    const client = getESPHomeClient();
    const unsubscribe = client.subscribeToDevices(setDevices);

    // Show manual entry after 10s if no devices found
    const timeout = setTimeout(() => {
      if (devices.length === 0) {
        setScanTimeout(true);
        setShowManualEntry(true);
      }
    }, 10000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleConnect = async (mac: string, deviceName?: string) => {
    setConnecting(true);
    setConnectingMac(mac);

    try {
      const client = getESPHomeClient();
      const result = await client.connectToDevice(mac);

      // Store UUIDs in profile
      saveActiveProfile({
        serviceUuid: result.serviceUuid,
        notifyCharUuid: result.notifyCharUuid,
        writeCharUuid: result.writeCharUuid,
        deviceName: deviceName || result.deviceName || 'SFP Device',
      });

      toast.success('UUIDs Retrieved!', {
        description: `Connected via ${result.proxyUsed}. You can now connect to the device.`,
      });
    } catch (error: any) {
      toast.error('Connection Failed', {
        description: error?.message || String(error),
      });
    } finally {
      setConnecting(false);
      setConnectingMac(null);
    }
  };

  const isValidMac = (mac: string): boolean => {
    return /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(mac);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>ESPHome Proxy Discovery</CardTitle>
          <CardDescription>
            Discovering SFP devices via ESPHome Bluetooth proxies on your network
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Auto-discovery list */}
          {devices.length > 0 ? (
            <div className="space-y-2">
              {devices.map((device) => {
                const strength = getSignalStrength(device.rssi);
                const colorClass = getSignalColor(strength);
                const isConnecting = connectingMac === device.macAddress;

                return (
                  <Card
                    key={device.macAddress}
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Wifi className={`h-4 w-4 ${colorClass}`} />
                            <span className="font-medium">{device.name}</span>
                            <span className={`text-xs ${colorClass}`}>
                              {device.rssi} dBm ({strength})
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {device.macAddress}
                            <span className="mx-2">•</span>
                            via {device.bestProxy}
                          </div>
                        </div>
                        <Button
                          onClick={() => handleConnect(device.macAddress, device.name)}
                          disabled={connecting}
                          size="sm"
                        >
                          {isConnecting ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            'Get UUIDs'
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p>Scanning for SFP devices...</p>
              <p className="text-xs mt-1">This may take up to 10 seconds</p>
            </div>
          )}

          {/* Manual MAC entry fallback */}
          {showManualEntry ? (
            <Card className="border-dashed">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <WifiOff className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    {scanTimeout && (
                      <p className="text-sm font-medium mb-2">No devices found automatically</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      The SFP Wizard displays its MAC address on the device screen. Enter it below
                      to connect manually.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="AA:BB:CC:DD:EE:FF"
                    value={manualMac}
                    onChange={(e) => setManualMac(e.target.value.toUpperCase())}
                    disabled={connecting}
                    className="font-mono"
                  />
                  <Button
                    onClick={() => handleConnect(manualMac)}
                    disabled={!isValidMac(manualMac) || connecting}
                  >
                    {connecting && connectingMac === manualMac ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      'Connect'
                    )}
                  </Button>
                </div>
                {manualMac && !isValidMac(manualMac) && (
                  <p className="text-xs text-destructive">
                    Invalid MAC address format. Expected: AA:BB:CC:DD:EE:FF
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowManualEntry(true)}
              className="w-full"
            >
              Enter MAC address manually
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
