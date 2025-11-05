'use client';

/**
 * Protected Route Component
 * 
 * Wraps components that require authentication and/or specific roles
 */

import { useAuthContext } from '@/components/providers/AuthProvider';
import { isAuthEnabled } from '@/lib/features';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ReactNode } from 'react';

interface ProtectedRouteProps {
    children: ReactNode;
    requireAdmin?: boolean;
    requireAuth?: boolean;
    fallbackPath?: string;
}

/**
 * Protected Route wrapper
 * 
 * @param requireAdmin - Requires admin role (default: false)
 * @param requireAuth - Requires any authenticated user (default: true)
 * @param fallbackPath - Redirect path for unauthorized users (default: '/login')
 * 
 * @example
 * ```tsx
 * <ProtectedRoute requireAdmin>
 *   <AdminSettings />
 * </ProtectedRoute>
 * ```
 */
export function ProtectedRoute({
    children,
    requireAdmin = false,
    requireAuth = true,
    fallbackPath = '/login',
}: ProtectedRouteProps) {
    const router = useRouter();
    const auth = useAuthContext();

    // If auth is disabled, render children directly
    if (!isAuthEnabled()) {
        return <>{children}</>;
    }

    // Loading state
    if (auth.loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Card className="w-full max-w-md">
                    <CardContent className="flex flex-col items-center justify-center p-6 space-y-4">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Not authenticated
    if (requireAuth && !auth.isAuthenticated) {
        return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <div className="flex items-center space-x-2">
                            <Lock className="h-5 w-5 text-muted-foreground" />
                            <CardTitle>Authentication Required</CardTitle>
                        </div>
                        <CardDescription>
                            You must be logged in to access this page
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Alert>
                            <AlertDescription>
                                Please sign in to continue
                            </AlertDescription>
                        </Alert>
                        <Button
                            onClick={() => router.push(fallbackPath)}
                            className="w-full"
                        >
                            Go to Login
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Admin required but user is not admin
    if (requireAdmin && !auth.isAdmin) {
        return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <div className="flex items-center space-x-2">
                            <Shield className="h-5 w-5 text-destructive" />
                            <CardTitle>Admin Access Required</CardTitle>
                        </div>
                        <CardDescription>
                            You don't have permission to access this page
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Alert variant="destructive">
                            <AlertTitle>Access Denied</AlertTitle>
                            <AlertDescription>
                                This page is restricted to administrators only.
                                {auth.user && (
                                    <span className="block mt-2 text-sm">
                                        Your role: <strong>{auth.role || 'none'}</strong>
                                    </span>
                                )}
                            </AlertDescription>
                        </Alert>
                        <Button
                            onClick={() => router.push('/')}
                            variant="outline"
                            className="w-full"
                        >
                            Back to Home
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Authorized - render children
    return <>{children}</>;
}

/**
 * Higher-order component version
 * 
 * @example
 * ```tsx
 * const ProtectedAdminPage = withProtectedRoute(AdminDashboard, { requireAdmin: true });
 * ```
 */
export function withProtectedRoute<P extends object>(
    Component: React.ComponentType<P>,
    options: Omit<ProtectedRouteProps, 'children'> = {}
) {
    return function ProtectedComponent(props: P) {
        return (
            <ProtectedRoute {...options}>
                <Component {...props} />
            </ProtectedRoute>
        );
    };
}
