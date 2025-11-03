'use client';

/**
 * Settings Page
 * 
 * Admin-only page for configuring BLE proxy and user preferences
 */

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { BleProxySettings } from '@/components/ble/BleProxySettings';
import { useAuthContext } from '@/components/providers/AuthProvider';
import { isAuthEnabled } from '@/lib/features';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Separator } from '@/registry/new-york-v4/ui/separator';
import { Bluetooth, Shield, User } from 'lucide-react';

export default function SettingsPage() {
    return (
        <ProtectedRoute requireAdmin={isAuthEnabled()}>
            <SettingsContent />
        </ProtectedRoute>
    );
}

function SettingsContent() {
    const auth = useAuthContext();

    return (
        <div className="container max-w-4xl py-8 space-y-8">
            {/* Header */}
            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground">
                    Manage your account and configure BLE proxy settings
                </p>
            </div>

            <Separator />

            {/* User Profile Section */}
            {isAuthEnabled() && auth.user && (
                <div className="space-y-4">
                    <h2 className="text-2xl font-semibold tracking-tight flex items-center">
                        <User className="mr-2 h-5 w-5" />
                        User Profile
                    </h2>

                    <Card>
                        <CardHeader>
                            <CardTitle>Account Information</CardTitle>
                            <CardDescription>
                                Your SFPLiberate account details
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Name</p>
                                    <p className="text-base">{auth.user.name || 'Not set'}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Email</p>
                                    <p className="text-base">{auth.user.email}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Role</p>
                                    <div className="flex items-center space-x-2">
                                        <Badge variant={auth.isAdmin ? 'default' : 'secondary'}>
                                            {auth.isAdmin && <Shield className="mr-1 h-3 w-3" />}
                                            {auth.role || 'none'}
                                        </Badge>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">User ID</p>
                                    <p className="text-xs font-mono">{auth.user.$id}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* BLE Proxy Settings Section */}
            <div className="space-y-4">
                <h2 className="text-2xl font-semibold tracking-tight flex items-center">
                    <Bluetooth className="mr-2 h-5 w-5" />
                    BLE Proxy Configuration
                </h2>

                <BleProxySettings />
            </div>

            {/* Additional sections can be added here */}
        </div>
    );
}
