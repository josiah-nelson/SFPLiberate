# Authentication & Role-Based Access Control (RBAC)

Complete implementation of Appwrite-based authentication system with `admin` and `alpha` roles.

## Overview

SFPLiberate supports two deployment modes:

1. **Standalone** (Docker, no auth) - Default for self-hosted deployments
2. **Appwrite** (Cloud with auth) - Invite-only access with role-based permissions

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Frontend (Next.js 16)                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              AuthProvider (React Context)                  │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │           useAuth() Hook                             │  │ │
│  │  │  - user: AppwriteUser | null                         │  │ │
│  │  │  - isAdmin: boolean                                  │  │ │
│  │  │  - isAlpha: boolean                                  │  │ │
│  │  │  - role: 'admin' | 'alpha' | null                    │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │           ProtectedRoute Component                         │ │
│  │  - requireAdmin: boolean                                   │ │
│  │  - requireAuth: boolean                                    │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ WebSocket / HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Appwrite Cloud (or Self-Hosted)               │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │   Accounts     │  │     Teams      │  │    Database      │  │
│  │  (Users)       │  │  (admin/alpha) │  │ (Module Library) │  │
│  └────────────────┘  └────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Role Definitions

### Admin Role (`admin` label/team)
- **Full access** to all features
- Can configure BLE proxy settings
- Can review/approve community submissions
- Can manage users (invite-only)
- Can access system health monitoring

### Alpha Role (`alpha` label/team)
- **Early access users**
- Can read/write to module library
- Can submit modules to community (pending admin approval)
- **Cannot** modify global settings
- **Cannot** approve community submissions

## Files Created

### Core Auth System

1. **`src/lib/auth.ts`** (325 lines)
   - Appwrite client initialization
   - `useAuth()` hook for component-level auth state
   - `login()`, `logout()` functions
   - Role checking helpers: `isAdmin()`, `isAlpha()`, `hasRole()`
   - User preference management

2. **`src/components/providers/AuthProvider.tsx`** (35 lines)
   - React Context provider for auth state
   - Wraps entire app in `layout.tsx`
   - Provides `useAuthContext()` hook

### UI Components

3. **`src/components/auth/LoginForm.tsx`** (100 lines)
   - Email/password login form
   - Error handling and loading states
   - Redirects to home after successful login
   - **No signup** - invite-only (admins create accounts in Appwrite)

4. **`src/components/auth/ProtectedRoute.tsx`** (165 lines)
   - HOC for protecting routes/components
   - `requireAdmin` and `requireAuth` props
   - Graceful error states with helpful messages
   - Shows user role in error messages
   - Exports `withProtectedRoute()` HOC wrapper

5. **`src/components/ble/BleProxySettings.tsx`** (230 lines)
   - **Admin-only** BLE proxy configuration
   - WebSocket URL input with validation
   - Test connection button (creates WebSocket, checks connectivity)
   - Saves to localStorage (`sfp_ble_proxy_url`)
   - Reset to default functionality
   - Helpful error messages and status indicators

### Pages

6. **`src/app/login/page.tsx`** (50 lines)
   - Login page route
   - Redirects if already authenticated
   - Redirects to home if auth is disabled (standalone mode)

7. **`src/app/settings/page.tsx`** (105 lines)
   - Admin-only settings page
   - User profile section (name, email, role, ID)
   - BLE proxy configuration section
   - Protected with `ProtectedRoute` wrapper

### Integration

8. **`src/app/layout.tsx`** (updated)
   - Added `<AuthProvider>` wrapper around app
   - Auth state now available to all components

9. **`src/lib/ble/manager.ts`** (updated)
   - `connectViaProxy()` checks `localStorage.getItem('sfp_ble_proxy_url')`
   - Falls back to default `/api/v1/ble/ws` if not set
   - Enables custom proxy URLs for standalone BLE proxy service

10. **`package.json`** (updated)
    - Added `appwrite@^16.0.2` dependency

## Environment Variables

Already configured in `.env.example`:

```bash
# Deployment Mode
NEXT_PUBLIC_DEPLOYMENT_MODE=standalone  # or "appwrite"

# Authentication (Appwrite only)
NEXT_PUBLIC_ENABLE_AUTH=false  # Set to "true" for Appwrite mode

# Appwrite Configuration
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=your-project-id
```

## Usage Examples

### Protecting a Page (Admin-Only)

```tsx
// app/admin/page.tsx
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export default function AdminPage() {
  return (
    <ProtectedRoute requireAdmin>
      <AdminDashboard />
    </ProtectedRoute>
  );
}
```

### Using Auth in Components

```tsx
'use client';

import { useAuthContext } from '@/components/providers/AuthProvider';

export function MyComponent() {
  const { user, isAdmin, isAlpha, loading } = useAuthContext();

  if (loading) return <Spinner />;
  
  if (!user) return <LoginPrompt />;

  return (
    <div>
      <h1>Welcome, {user.name}!</h1>
      {isAdmin && <AdminPanel />}
      {isAlpha && <AlphaFeatures />}
    </div>
  );
}
```

### HOC Pattern

```tsx
import { withProtectedRoute } from '@/components/auth/ProtectedRoute';

function AdminSettings() {
  return <div>Admin Settings</div>;
}

export default withProtectedRoute(AdminSettings, { requireAdmin: true });
```

### Conditional Rendering Based on Role

```tsx
'use client';

import { useAuthContext } from '@/components/providers/AuthProvider';
import { isAuthEnabled } from '@/lib/features';

export function Toolbar() {
  const { isAdmin } = useAuthContext();

  return (
    <div>
      <Button>Home</Button>
      <Button>Modules</Button>
      {isAuthEnabled() && isAdmin && (
        <Button>Settings</Button>
      )}
    </div>
  );
}
```

## Appwrite Setup

### 1. Create Appwrite Project

1. Go to [cloud.appwrite.io](https://cloud.appwrite.io) or your self-hosted instance
2. Create a new project
3. Copy Project ID to `NEXT_PUBLIC_APPWRITE_PROJECT_ID`

### 2. Configure Teams

Create two teams in Appwrite console:

1. **admin team**
   - Create team with name: `admin`
   - Invite admin users

2. **alpha team**
   - Create team with name: `alpha`
   - Invite alpha users (early access)

### 3. Alternative: Use Labels

Instead of teams, you can use user labels:

1. Go to Auth → Users
2. Select a user
3. Add label: `admin` or `alpha`

The auth system checks both teams and labels.

### 4. Configure Platform

1. Go to Settings → Platforms
2. Add Web Platform
3. Add your domain(s):
   - `http://localhost:8080` (development)
   - `https://yourdomain.com` (production)

## Security Considerations

### Why Settings Are Admin-Only

1. **Malicious Proxy Risk**: Users could be tricked into connecting to a malicious WebSocket server
2. **Service Disruption**: Misconfigured endpoints break functionality
3. **Network Security**: Exposed internal IPs could leak topology information

### LocalStorage Security

- `sfp_ble_proxy_url` stored in localStorage (not cookies)
- Only accessible to same-origin JavaScript
- Not sent with HTTP requests (no CSRF risk)
- Admin-only UI prevents unauthorized modification

### Best Practices

- ✅ Always validate WebSocket URLs before connecting
- ✅ Use HTTPS/WSS in production
- ✅ Implement rate limiting on login endpoint
- ✅ Monitor failed login attempts
- ✅ Rotate Appwrite API keys regularly
- ✅ Use environment-specific Appwrite projects (dev/staging/prod)

## Testing

### Local Testing (Auth Disabled)

```bash
cd frontend
NEXT_PUBLIC_ENABLE_AUTH=false npm run dev
```

- Auth provider returns `{ isAuthenticated: false, isAdmin: false, loading: false }`
- Protected routes render children directly
- No login required

### Local Testing (Auth Enabled)

```bash
cd frontend
NEXT_PUBLIC_ENABLE_AUTH=true \
NEXT_PUBLIC_DEPLOYMENT_MODE=appwrite \
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1 \
NEXT_PUBLIC_APPWRITE_PROJECT_ID=your-project-id \
npm run dev
```

- Create test users in Appwrite console
- Assign `admin` or `alpha` labels/teams
- Test login at `http://localhost:3000/login`
- Verify settings page at `http://localhost:3000/settings` (admin-only)

## Troubleshooting

### "Cannot find module 'appwrite'"

```bash
cd frontend
npm install
```

### "Appwrite configuration missing"

Check `.env.local` or `.env`:

```bash
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=your-project-id
```

### "User has no role"

1. Check user labels in Appwrite console
2. Ensure user is in `admin` or `alpha` team
3. Verify team names are lowercase

### "WebSocket connection failed"

1. Check BLE proxy is running: `docker ps | grep ble-proxy`
2. Verify URL format: `ws://localhost:8081/ble/ws`
3. Check firewall settings

## Migration from Previous System

No previous auth system existed - this is the initial implementation.

## Future Enhancements

- [ ] Password reset flow
- [ ] Email verification
- [ ] Two-factor authentication (2FA)
- [ ] Audit logging for admin actions
- [ ] User management UI (admin can invite/remove users)
- [ ] Session timeout configuration
- [ ] OAuth providers (Google, GitHub)

## Related Documentation

- [PUBLIC_DEPLOYMENT.md](../docs/PUBLIC_DEPLOYMENT.md) - Public server deployment with auth
- [Appwrite Authentication Docs](https://appwrite.io/docs/products/auth)
- [Next.js App Router](https://nextjs.org/docs/app)
