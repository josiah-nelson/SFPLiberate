'use client';

/**
 * Authentication Provider
 * 
 * Wraps the app with Appwrite session management and provides
 * auth context to all components via useAuth() hook.
 */

import { AuthState, useAuth as useAuthHook } from '@/lib/auth';
import { createContext, ReactNode, useContext } from 'react';

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const auth = useAuthHook();

    return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 * 
 * Must be used within AuthProvider
 */
export function useAuthContext(): AuthState {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuthContext must be used within AuthProvider');
    }

    return context;
}
