/**
 * Authentication utilities for Appwrite integration
 * 
 * Provides hooks and helpers for role-based access control (RBAC)
 * with support for 'admin' and 'alpha' roles.
 */

import { Account, Client, Models, Teams } from 'appwrite';
import { useEffect, useState } from 'react';
import { getAppwriteEndpoint, getAppwriteProjectId, isAuthEnabled } from './features';

// Appwrite client singleton
let appwriteClient: Client | null = null;
let accountService: Account | null = null;
let teamsService: Teams | null = null;

/**
 * Initialize Appwrite client
 */
export function getAppwriteClient(): Client {
    if (!appwriteClient) {
        const endpoint = getAppwriteEndpoint();
        const projectId = getAppwriteProjectId();

        if (!endpoint || !projectId) {
            throw new Error('Appwrite configuration missing. Set NEXT_PUBLIC_APPWRITE_ENDPOINT and NEXT_PUBLIC_APPWRITE_PROJECT_ID');
        }

        appwriteClient = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId);
    }

    return appwriteClient;
}

/**
 * Get Appwrite Account service
 */
export function getAccount(): Account {
    if (!accountService) {
        accountService = new Account(getAppwriteClient());
    }
    return accountService;
}

/**
 * Get Appwrite Teams service
 */
export function getTeams(): Teams {
    if (!teamsService) {
        teamsService = new Teams(getAppwriteClient());
    }
    return teamsService;
}

/**
 * User role type
 */
export type UserRole = 'admin' | 'alpha' | null;

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
 */
async function getUserRole(user: Models.User<Models.Preferences>): Promise<UserRole> {
    try {
        // Check labels first (preferred method)
        if (user.labels?.includes('admin')) {
            return 'admin';
        }
        if (user.labels?.includes('alpha')) {
            return 'alpha';
        }

        // Fallback: Check team memberships
        const teams = getTeams();
        const memberships = await teams.list();

        const teamNames = memberships.teams.map(t => t.name.toLowerCase());
        if (teamNames.includes('admin')) {
            return 'admin';
        }
        if (teamNames.includes('alpha')) {
            return 'alpha';
        }

        return null;
    } catch (error) {
        console.error('Error fetching user role:', error);
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
        if (!isAuthEnabled()) {
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
                const account = getAccount();
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
 */
export async function login(email: string, password: string): Promise<AppwriteUser> {
    const account = getAccount();

    try {
        await account.createEmailPasswordSession(email, password);
        const user = await account.get();
        const role = await getUserRole(user);

        return {
            ...user,
            role,
        };
    } catch (error) {
        console.error('Login failed:', error);
        throw error;
    }
}

/**
 * Signup with email, password, and invite passphrase
 * 
 * Note: Actual invite validation should happen on backend
 */
export async function signup(
    email: string,
    password: string,
    name: string,
    inviteCode?: string
): Promise<AppwriteUser> {
    const account = getAccount();

    try {
        // Create account (ID will be auto-generated)
        await account.create('unique()', email, password, name);

        // Log in immediately
        await account.createEmailPasswordSession(email, password);

        const user = await account.get();

        // Note: Role assignment should be handled by backend/admin
        // For now, new users have no role until assigned
        const role = await getUserRole(user);

        return {
            ...user,
            role,
        };
    } catch (error) {
        console.error('Signup failed:', error);
        throw error;
    }
}

/**
 * Logout current session
 */
export async function logout(): Promise<void> {
    const account = getAccount();

    try {
        await account.deleteSession('current');
    } catch (error) {
        console.error('Logout failed:', error);
        throw error;
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
export async function updatePreferences(prefs: Models.Preferences): Promise<Models.User<Models.Preferences>> {
    const account = getAccount();
    return await account.updatePrefs(prefs);
}

/**
 * Get user preferences
 */
export async function getPreferences(): Promise<Models.Preferences> {
    const account = getAccount();
    const user = await account.get();
    return user.prefs;
}
