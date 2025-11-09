/**
 * Authentication utilities for Appwrite integration
 *
 * Provides hooks and helpers for role-based access control (RBAC)
 * with support for 'admin' and 'alpha' roles.
 *
 * Security features:
 * - Rate limiting on login/signup
 * - Sanitized error messages
 * - Role caching for performance
 */

import type { Models } from 'appwrite';
import { useEffect, useState } from 'react';
import { getAppwriteEndpoint, getAppwriteProjectId } from './features';
import { getBrowserClientConfig } from './client-config';
import { isAuthEnabled as isAuthEnabledClient } from './features-client';
import { loginLimiter, signupLimiter } from './security/rateLimiter';
import { handleAuthError, AuthError } from './security/errors';

type AppwriteModule = typeof import('appwrite');
type AppwriteClient = import('appwrite').Client;
type AppwriteAccount = import('appwrite').Account;
type AppwriteTeams = import('appwrite').Teams;

let moduleLoader: Promise<AppwriteModule> | null = null;

async function loadAppwriteModule(): Promise<AppwriteModule> {
    if (!moduleLoader) {
        moduleLoader = import('appwrite');
    }

    return moduleLoader;
}

// Appwrite client singleton
let appwriteClient: AppwriteClient | null = null;
let accountService: AppwriteAccount | null = null;
let teamsService: AppwriteTeams | null = null;

/**
 * Initialize Appwrite client
 */
export async function getAppwriteClient(): Promise<AppwriteClient> {
    if (appwriteClient) {
        return appwriteClient;
    }

    const { Client } = await loadAppwriteModule();

    // Use dynamic runtime config in the browser; use server env on SSR
    if (typeof window !== 'undefined') {
        const cfg = await getBrowserClientConfig();
        const endpoint = cfg?.endpoint;
        const projectId = cfg?.projectId;
        if (!endpoint || !projectId) {
            throw new Error('Appwrite client configuration is missing in browser.');
        }
        appwriteClient = new Client().setEndpoint(endpoint).setProject(projectId);
    } else {
        const endpoint = getAppwriteEndpoint();
        const projectId = getAppwriteProjectId();
        if (!endpoint || !projectId) {
            throw new Error('Appwrite configuration missing on server environment.');
        }
        appwriteClient = new Client().setEndpoint(endpoint).setProject(projectId);
    }

    return appwriteClient;
}

/**
 * Get Appwrite Account service
 */
export async function getAccount(): Promise<AppwriteAccount> {
    if (accountService) {
        return accountService;
    }

    const { Account } = await loadAppwriteModule();
    const client = await getAppwriteClient();
    accountService = new Account(client);
    return accountService;
}

/**
 * Get Appwrite Teams service
 */
export async function getTeams(): Promise<AppwriteTeams> {
    if (teamsService) {
        return teamsService;
    }

    const { Teams } = await loadAppwriteModule();
    const client = await getAppwriteClient();
    teamsService = new Teams(client);
    return teamsService;
}

/**
 * User role type
 */
export type UserRole = 'admin' | 'alpha' | null;

type RoleCachingPreferences = Models.Preferences & {
    role?: UserRole;
};

/**
 * Extended user type with role information
 */
export interface AppwriteUser extends Models.User<Models.Preferences> {
    role?: UserRole;
    teams?: string[];
}

/**
 * Auth state
 */
export interface AuthState {
    user: AppwriteUser | null;
    loading: boolean;
    error: Error | null;
    isAuthenticated: boolean;
    isAdmin: boolean;
    isAlpha: boolean;
    role: UserRole;
}

/**
 * Get user role from labels or team memberships
 * Optimized with preference caching to avoid unnecessary API calls
 */
async function getUserRole(user: Models.User<Models.Preferences>): Promise<UserRole> {
    try {
        // Check preferences cache first (instant, no API call)
        const prefs = user.prefs as RoleCachingPreferences;
        const cachedRole = prefs.role as UserRole | undefined;
        if (cachedRole) {
            return cachedRole;
        }

        // Determine role from labels/teams
        const role = await determineUserRole(user);

        // Cache role in preferences for next time (fire and forget)
        if (role) {
            const updatedPrefs: RoleCachingPreferences = { ...prefs, role };
            updatePreferences(updatedPrefs).catch((error) => {
                if (process.env.NODE_ENV === 'development') {
                    console.warn('Failed to cache role in preferences:', error);
                }
            });
        }

        return role;
    } catch (error) {
        if (process.env.NODE_ENV === 'development') {
            console.error('Error fetching user role:', error);
        }
        return null;
    }
}

/**
 * Determine user role from labels and team memberships
 * This is the expensive operation we want to avoid repeating
 */
async function determineUserRole(user: Models.User<Models.Preferences>): Promise<UserRole> {
    // Check labels first (fastest - no API call)
    if (user.labels?.includes('admin')) {
        return 'admin';
    }
    if (user.labels?.includes('alpha')) {
        return 'alpha';
    }

    // Fallback: Check team memberships (requires API call)
    try {
        const teams = await getTeams();
        const memberships = await teams.list();

        const teamNames = memberships.teams.map((team) => team.name.toLowerCase());
        if (teamNames.includes('admin')) {
            return 'admin';
        }
        if (teamNames.includes('alpha')) {
            return 'alpha';
        }

        return null;
    } catch (error) {
        if (process.env.NODE_ENV === 'development') {
            console.error('Error fetching teams:', error);
        }
        return null;
    }
}

/**
 * Main authentication hook
 * 
 * @returns Auth state with user info and role checks
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, isAdmin, loading } = useAuth();
 *   
 *   if (loading) return <Spinner />;
 *   if (!user) return <LoginPrompt />;
 *   if (!isAdmin) return <Unauthorized />;
 *   
 *   return <AdminPanel />;
 * }
 * ```
 */
export function useAuth(): AuthState {
    const [state, setState] = useState<AuthState>({
        user: null,
        loading: true,
        error: null,
        isAuthenticated: false,
        isAdmin: false,
        isAlpha: false,
        role: null,
    });

    useEffect(() => {
        // Skip auth if not enabled
        if (!isAuthEnabledClient()) {
            setState({
                user: null,
                loading: false,
                error: null,
                isAuthenticated: false,
                isAdmin: false,
                isAlpha: false,
                role: null,
            });
            return;
        }

        let mounted = true;

        async function checkSession() {
            try {
                const account = await getAccount();
                const user = await account.get();

                if (!mounted) return;

                // Get role
                const role = await getUserRole(user);

                const appwriteUser: AppwriteUser = {
                    ...user,
                    role,
                };

                setState({
                    user: appwriteUser,
                    loading: false,
                    error: null,
                    isAuthenticated: true,
                    isAdmin: role === 'admin',
                    isAlpha: role === 'alpha',
                    role,
                });
            } catch (error) {
                if (!mounted) return;

                setState({
                    user: null,
                    loading: false,
                    error: error as Error,
                    isAuthenticated: false,
                    isAdmin: false,
                    isAlpha: false,
                    role: null,
                });
            }
        }

        checkSession();

        return () => {
            mounted = false;
        };
    }, []);

    return state;
}

/**
 * Login with email and password
 * Includes rate limiting and sanitized error messages
 */
export async function login(email: string, password: string): Promise<AppwriteUser> {
    const emailLower = email.toLowerCase().trim();

    // Check rate limit (5 attempts per 15 minutes, then 15 minute lockout)
    const rateLimit = loginLimiter.check(emailLower, 5, 15 * 60 * 1000, 15 * 60 * 1000);
    if (!rateLimit.allowed) {
        const minutes = Math.ceil((rateLimit.retryAfter || 0) / 60);
        throw new AuthError(
            `Too many login attempts. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
            'RATE_LIMIT_EXCEEDED'
        );
    }

    try {
        const account = await getAccount();
        await account.createEmailPasswordSession(emailLower, password);
        const user = await account.get();
        // Bridge SSR auth via short-lived JWT cookie
        try {
            const jwt = await account.createJWT();
            await fetch('/api/auth/set-jwt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jwt: jwt.jwt }),
            });
        } catch (e) {
            if (process.env.NODE_ENV === 'development') {
                console.warn('Failed to create bridge JWT', e);
            }
        }
        const role = await getUserRole(user);

        // Success - reset rate limit
        loginLimiter.reset(emailLower);

        return {
            ...user,
            role,
        };
    } catch (error) {
        // Failed login - rate limit will continue to track
        handleAuthError(error, 'login');
    }
}

/**
 * Signup with email, password, and name
 *
 * Note: Users are added manually by admins with appropriate roles.
 * This function exists for potential future self-service signup.
 */
export async function signup(
    email: string,
    password: string,
    name: string
): Promise<AppwriteUser> {
    const emailLower = email.toLowerCase().trim();

    // Check rate limit (3 signups per hour per email)
    const rateLimit = signupLimiter.check(emailLower, 3, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
        const minutes = Math.ceil((rateLimit.retryAfter || 0) / 60);
        throw new AuthError(
            `Too many signup attempts. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
            'RATE_LIMIT_EXCEEDED'
        );
    }

    try {
        const account = await getAccount();

        // Create account (ID will be auto-generated)
        await account.create('unique()', emailLower, password, name);

        // Log in immediately
        await account.createEmailPasswordSession(emailLower, password);

        const user = await account.get();

        // Note: Role assignment should be handled by admin
        // New users have no role until assigned
        const role = await getUserRole(user);

        // Success - reset rate limit
        signupLimiter.reset(emailLower);

        return {
            ...user,
            role,
        };
    } catch (error) {
        handleAuthError(error, 'signup');
    }
}

/**
 * Logout current session
 */
export async function logout(): Promise<void> {
    try {
        const account = await getAccount();
        await account.deleteSession('current');
        // Clear JWT bridge cookie
        await fetch('/api/auth/clear-jwt', { method: 'POST' });
    } catch (error) {
        handleAuthError(error, 'logout');
    }
}

/**
 * Check if user has admin role
 */
export function isAdmin(user: AppwriteUser | null): boolean {
    return user?.role === 'admin';
}

/**
 * Check if user has alpha role
 */
export function isAlpha(user: AppwriteUser | null): boolean {
    return user?.role === 'alpha';
}

/**
 * Check if user has any role (admin or alpha)
 */
export function hasRole(user: AppwriteUser | null): boolean {
    return user?.role !== null;
}

/**
 * Require admin role - throws if not admin
 */
export function requireAdmin(user: AppwriteUser | null): void {
    if (!isAdmin(user)) {
        throw new Error('Admin access required');
    }
}

/**
 * Update user preferences
 */
export async function updatePreferences(
    prefs: Models.Preferences
): Promise<Models.User<Models.Preferences>> {
    const account = await getAccount();
    return await account.updatePrefs(prefs);
}

/**
 * Get user preferences
 */
export async function getPreferences(): Promise<Models.Preferences> {
    const account = await getAccount();
    const user = await account.get();
    return user.prefs;
}
