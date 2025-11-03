'use client';

/**
 * BLE Proxy Settings Component
 * 
 * Admin-only component for configuring custom BLE proxy WebSocket endpoint.
 * Stores configuration in localStorage for persistence.
 */

import { useAuthContext } from '@/components/providers/AuthProvider';
import { isAuthEnabled } from '@/lib/features';
import { Alert, AlertDescription, AlertTitle } from '@/registry/new-york-v4/ui/alert';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { CheckCircle2, Info, Loader2, Shield, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

const BLE_PROXY_URL_KEY = 'sfp_ble_proxy_url';
const DEFAULT_PROXY_URL = 'ws://localhost:8081/ble/ws';

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

export function BleProxySettings() {
    const auth = useAuthContext();
    const [proxyUrl, setProxyUrl] = useState('');
    const [status, setStatus] = useState<ConnectionStatus>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [hasChanges, setHasChanges] = useState(false);

    // Load saved URL on mount
    useEffect(() => {
        const saved = localStorage.getItem(BLE_PROXY_URL_KEY);
        setProxyUrl(saved || DEFAULT_PROXY_URL);
    }, []);

    // Check for admin access if auth is enabled
    if (isAuthEnabled() && !auth.isAdmin) {
        return (
            <Card>
                <CardHeader>
                    <div className="flex items-center space-x-2">
                        <Shield className="h-5 w-5 text-destructive" />
                        <CardTitle>Admin Access Required</CardTitle>
                    </div>
                    <CardDescription>
                        BLE Proxy settings are restricted to administrators
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Alert variant="destructive">
                        <Shield className="h-4 w-4" />
                        <AlertTitle>Access Denied</AlertTitle>
                        <AlertDescription>
                            You don't have permission to modify BLE proxy settings.
                            {auth.user && (
                                <span className="block mt-2 text-sm">
                                    Your role: <strong>{auth.role || 'none'}</strong>
                                </span>
                            )}
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>
        );
    }

    const handleUrlChange = (value: string) => {
        setProxyUrl(value);
        setHasChanges(true);
        setStatus('idle');
        setErrorMessage('');
    };

    const testConnection = async () => {
        setStatus('testing');
        setErrorMessage('');

        try {
            // Create WebSocket connection with timeout
            const ws = new WebSocket(proxyUrl);

            const timeout = setTimeout(() => {
                ws.close();
                setStatus('error');
                setErrorMessage('Connection timeout (5s)');
            }, 5000);

            ws.onopen = () => {
                clearTimeout(timeout);
                setStatus('success');
                ws.close();
            };

            ws.onerror = () => {
                clearTimeout(timeout);
                setStatus('error');
                setErrorMessage('Failed to connect. Check URL and proxy status.');
            };

            ws.onclose = (event) => {
                clearTimeout(timeout);
                if (status !== 'success' && !event.wasClean) {
                    setStatus('error');
                    setErrorMessage('Connection closed unexpectedly');
                }
            };
        } catch (error) {
            setStatus('error');
            setErrorMessage(error instanceof Error ? error.message : 'Invalid WebSocket URL');
        }
    };

    const saveSettings = () => {
        localStorage.setItem(BLE_PROXY_URL_KEY, proxyUrl);
        setHasChanges(false);

        // Show success message briefly
        setStatus('success');
        setTimeout(() => {
            if (status === 'success') setStatus('idle');
        }, 3000);
    };

    const resetToDefault = () => {
        setProxyUrl(DEFAULT_PROXY_URL);
        setHasChanges(true);
        setStatus('idle');
        setErrorMessage('');
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>BLE Proxy Configuration</CardTitle>
                        <CardDescription>
                            Configure custom WebSocket endpoint for standalone BLE proxy
                        </CardDescription>
                    </div>
                    {isAuthEnabled() && auth.isAdmin && (
                        <Badge variant="secondary" className="ml-auto">
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>About BLE Proxy</AlertTitle>
                    <AlertDescription>
                        The standalone BLE proxy enables iOS/Safari users to connect to SFP Wizard devices.
                        Run the proxy locally with: <code className="text-xs bg-muted px-1 py-0.5 rounded">docker run --network host ghcr.io/sfpliberate/ble-proxy:latest</code>
                    </AlertDescription>
                </Alert>

                <div className="space-y-2">
                    <Label htmlFor="proxy-url">WebSocket URL</Label>
                    <Input
                        id="proxy-url"
                        type="text"
                        placeholder="ws://localhost:8081/ble/ws"
                        value={proxyUrl}
                        onChange={(e) => handleUrlChange(e.target.value)}
                        className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                        Enter your local BLE proxy WebSocket endpoint. Use your machine's local IP (e.g., ws://192.168.1.100:8081/ble/ws) for mobile access.
                    </p>
                </div>

                {errorMessage && (
                    <Alert variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertTitle>Connection Failed</AlertTitle>
                        <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                )}

                {status === 'success' && !errorMessage && (
                    <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <AlertTitle>Connection Successful</AlertTitle>
                        <AlertDescription>
                            Successfully connected to BLE proxy
                        </AlertDescription>
                    </Alert>
                )}

                <div className="flex space-x-2">
                    <Button
                        onClick={testConnection}
                        disabled={status === 'testing' || !proxyUrl}
                        variant="outline"
                        className="flex-1"
                    >
                        {status === 'testing' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {status === 'success' && <CheckCircle2 className="mr-2 h-4 w-4" />}
                        {status === 'error' && <XCircle className="mr-2 h-4 w-4" />}
                        Test Connection
                    </Button>

                    <Button
                        onClick={resetToDefault}
                        variant="ghost"
                        disabled={proxyUrl === DEFAULT_PROXY_URL}
                    >
                        Reset to Default
                    </Button>
                </div>
            </CardContent>

            <CardFooter>
                <Button
                    onClick={saveSettings}
                    disabled={!hasChanges}
                    className="w-full"
                >
                    {hasChanges ? 'Save Changes' : 'Saved'}
                </Button>
            </CardFooter>
        </Card>
    );
}
