'use client';

/**
 * Login Page
 * 
 * Handles user authentication for invite-only access
 */

import { LoginForm } from '@/components/auth/LoginForm';
import { useAuthContext } from '@/components/providers/AuthProvider';
import { isAuthEnabled } from '@/lib/features';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
    const auth = useAuthContext();
    const router = useRouter();

    // Redirect if already authenticated
    useEffect(() => {
        if (auth.isAuthenticated && !auth.loading) {
            router.push('/');
        }
    }, [auth.isAuthenticated, auth.loading, router]);

    // If auth is disabled, redirect to home
    if (!isAuthEnabled()) {
        router.push('/');
        return null;
    }

    // Show loading state
    if (auth.loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p className="text-muted-foreground">Loading...</p>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center min-h-screen p-4">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold">SFPLiberate</h1>
                    <p className="text-muted-foreground">
                        Invite-only access
                    </p>
                </div>
                <LoginForm />
            </div>
        </div>
    );
}
