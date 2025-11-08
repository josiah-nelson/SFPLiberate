# Appwrite Security Action Plan

**Generated:** 2025-11-08
**Based on:** APPWRITE_E2E_ADVERSARIAL_REVIEW.md

---

## 🎯 Executive Summary

This document provides a prioritized action plan for implementing security improvements identified in the comprehensive Appwrite E2E security review.

**Current Status:** 🟡 MODERATE SECURITY POSTURE
**Target Status:** 🟢 PRODUCTION-READY SECURITY

**Issues Identified:**
- 🔴 Critical: 5 issues
- 🟠 High: 7 issues
- 🟡 Medium: 4 issues
- ℹ️ Informational: 3 issues

**Estimated Implementation Time:** 3-4 days for critical + high priority issues

---

## 📋 Implementation Roadmap

### Phase 1: Critical Security Fixes (Day 1 - REQUIRED before public launch)

#### 1.1 Rate Limiting & DDoS Protection

**Priority:** CRITICAL
**Effort:** 4 hours
**Files:** `auth.ts`, Appwrite Console

**Implementation:**

```typescript
// frontend/src/lib/security/rateLimiter.ts
export class RateLimiter {
  private attempts = new Map<string, { count: number; resetAt: Date }>();

  check(key: string, limit: number, windowMs: number): boolean {
    const now = new Date();
    const record = this.attempts.get(key);

    if (record && record.resetAt > now) {
      if (record.count >= limit) {
        return false; // Rate limit exceeded
      }
      record.count++;
      return true;
    }

    // Create new window
    this.attempts.set(key, {
      count: 1,
      resetAt: new Date(now.getTime() + windowMs)
    });
    return true;
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

// Usage in auth.ts
const loginLimiter = new RateLimiter();

export async function login(email: string, password: string) {
  const key = email.toLowerCase();

  if (!loginLimiter.check(key, 5, 15 * 60 * 1000)) {
    throw new AuthError('Too many login attempts. Try again in 15 minutes.', 'RATE_LIMIT');
  }

  try {
    const result = await account.createEmailPasswordSession(email, password);
    loginLimiter.reset(key); // Success - reset counter
    return result;
  } catch (error) {
    handleAuthError(error, 'login');
  }
}
```

**Appwrite Console Configuration:**
1. Go to Settings → Security
2. Set "Max Login Attempts": 10 per IP per hour
3. Set "API Rate Limit": 60 requests per minute per IP

---

#### 1.2 Session Limits & Cleanup

**Priority:** CRITICAL
**Effort:** 2 hours
**Files:** `auth.ts`, Appwrite Console

**Implementation:**

```typescript
// auth.ts - Add session cleanup
export async function login(email: string, password: string) {
  const account = await getAccount();

  try {
    // Get existing sessions
    const sessions = await account.listSessions();

    // Cleanup old sessions if approaching limit
    if (sessions.total >= 4) {
      const oldSessions = sessions.sessions
        .sort((a, b) => new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime())
        .slice(0, sessions.total - 3);

      await Promise.allSettled(
        oldSessions.map(s => account.deleteSession(s.$id))
      );
    }

    // Create new session
    await account.createEmailPasswordSession(email, password);
    const user = await account.get();
    const role = await getUserRole(user);

    return { ...user, role };
  } catch (error) {
    handleAuthError(error, 'login');
  }
}
```

**Appwrite Console:**
1. Settings → Auth → Max Sessions Per User: 5

---

#### 1.3 Multi-Factor Authentication (MFA)

**Priority:** CRITICAL
**Effort:** 8 hours
**Files:** `auth.ts`, `LoginForm.tsx`, new MFA components

**Implementation:**

**Step 1: Add MFA enrollment**

```typescript
// auth.ts
export async function enrollMFA(type: 'totp'): Promise<{ secret: string; qrCode: string }> {
  const account = await getAccount();

  try {
    const factor = await account.createMfaChallenge(type);
    return {
      secret: factor.secret,
      qrCode: factor.uri
    };
  } catch (error) {
    handleAuthError(error, 'mfa-enroll');
  }
}

export async function verifyMFAEnrollment(code: string): Promise<void> {
  const account = await getAccount();

  try {
    await account.updateMfaChallenge(code);
  } catch (error) {
    handleAuthError(error, 'mfa-verify');
  }
}
```

**Step 2: Update login flow**

```typescript
// auth.ts
export async function login(email: string, password: string) {
  const account = await getAccount();

  try {
    // Create session
    await account.createEmailPasswordSession(email, password);

    // Check if MFA is enabled
    const factors = await account.listFactors();

    if (factors.totp || factors.phone) {
      // Return challenge state - UI will prompt for code
      return {
        status: 'mfa_required',
        factors: factors
      };
    }

    // No MFA - complete login
    const user = await account.get();
    const role = await getUserRole(user);

    return {
      status: 'success',
      user: { ...user, role }
    };
  } catch (error) {
    handleAuthError(error, 'login');
  }
}

export async function completeMFALogin(code: string) {
  const account = await getAccount();

  try {
    await account.updateMfaChallenge(code);

    const user = await account.get();
    const role = await getUserRole(user);

    return { ...user, role };
  } catch (error) {
    handleAuthError(error, 'mfa-login');
  }
}
```

**Step 3: Update UI**

```typescript
// LoginForm.tsx
const [mfaRequired, setMfaRequired] = useState(false);
const [mfaCode, setMfaCode] = useState('');

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);
  setLoading(true);

  try {
    if (mfaRequired) {
      await completeMFALogin(mfaCode);
      router.push('/');
    } else {
      const result = await login(email, password);

      if (result.status === 'mfa_required') {
        setMfaRequired(true);
      } else {
        router.push('/');
      }
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Authentication failed');
  } finally {
    setLoading(false);
  }
};

// Render MFA input if required
{mfaRequired && (
  <div className="space-y-2">
    <Label htmlFor="mfa">Authentication Code</Label>
    <Input
      id="mfa"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={6}
      placeholder="000000"
      value={mfaCode}
      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
      required
    />
    <p className="text-sm text-muted-foreground">
      Enter the 6-digit code from your authenticator app
    </p>
  </div>
)}
```

**Step 4: Create settings page for MFA enrollment**

```typescript
// app/settings/security/page.tsx
export default function SecuritySettings() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');

  const handleEnrollMFA = async () => {
    const result = await enrollMFA('totp');
    setQrCode(result.qrCode);
    setSecret(result.secret);
  };

  const handleVerifyMFA = async () => {
    await verifyMFAEnrollment(verifyCode);
    toast.success('MFA enabled successfully');
  };

  // Render QR code and verification form
}
```

---

#### 1.4 Invite Code Validation

**Priority:** CRITICAL
**Effort:** 6 hours
**Files:** `appwrite.json`, Appwrite Function, `auth.ts`

**Option A: Appwrite Function (Recommended)**

**Step 1: Create invite codes collection**

```json
// appwrite.json
{
  "collections": [
    {
      "$id": "invite_codes",
      "$permissions": [],
      "databaseId": "lib-core",
      "name": "Invite Codes",
      "enabled": true,
      "documentSecurity": true,
      "attributes": [
        { "$id": "code", "type": "string", "size": 64, "required": true },
        { "$id": "used", "type": "boolean", "required": true, "default": false },
        { "$id": "usedBy", "type": "string", "size": 36, "required": false },
        { "$id": "usedAt", "type": "datetime", "required": false },
        { "$id": "createdBy", "type": "string", "size": 36, "required": true },
        { "$id": "maxUses", "type": "integer", "required": true, "default": 1 },
        { "$id": "expiresAt", "type": "datetime", "required": false }
      ],
      "indexes": [
        { "$id": "idx_code", "type": "unique", "attributes": ["code"] }
      ]
    }
  ]
}
```

**Step 2: Create Appwrite Function**

```javascript
// functions/validateInvite/src/index.js
import { Client, Databases, Users, Query } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const users = new Users(client);

  const { email, password, name, inviteCode } = JSON.parse(req.body);

  if (!inviteCode) {
    return res.json({ error: 'Invite code required' }, 400);
  }

  try {
    // Find invite code
    const invites = await databases.listDocuments(
      'lib-core',
      'invite_codes',
      [Query.equal('code', inviteCode), Query.equal('used', false)]
    );

    if (invites.total === 0) {
      return res.json({ error: 'Invalid or expired invite code' }, 403);
    }

    const invite = invites.documents[0];

    // Check expiration
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return res.json({ error: 'Invite code expired' }, 403);
    }

    // Create user
    const user = await users.create('unique()', email, password, name);

    // Mark invite as used
    await databases.updateDocument(
      'lib-core',
      'invite_codes',
      invite.$id,
      {
        used: true,
        usedBy: user.$id,
        usedAt: new Date().toISOString()
      }
    );

    return res.json({
      success: true,
      userId: user.$id,
      message: 'Account created successfully'
    });
  } catch (err) {
    error(err);
    return res.json({ error: err.message }, 500);
  }
};
```

**Step 3: Update frontend signup**

```typescript
// auth.ts
export async function signup(
  email: string,
  password: string,
  name: string,
  inviteCode: string
) {
  try {
    // Call Appwrite Function to validate and create user
    const response = await fetch('/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, inviteCode })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new AuthError(error.error || 'Signup failed', 'SIGNUP_ERROR');
    }

    // Now login
    return await login(email, password);
  } catch (error) {
    handleAuthError(error, 'signup');
  }
}
```

---

#### 1.5 HTTPS Enforcement & Security Headers

**Priority:** CRITICAL
**Effort:** 2 hours
**Files:** `next.config.ts`

**Implementation:**

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  // ... existing config

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Force HTTPS
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          // Prevent clickjacking
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          // Prevent MIME sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          // Referrer policy
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          // Permissions policy
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.appwrite.io https://nyc.cloud.appwrite.io",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'"
            ].join('; ')
          }
        ],
      },
    ];
  },

  async redirects() {
    // Redirect HTTP to HTTPS in production
    if (process.env.NODE_ENV === 'production') {
      return [
        {
          source: '/:path*',
          has: [
            {
              type: 'header',
              key: 'x-forwarded-proto',
              value: 'http',
            },
          ],
          destination: 'https://:host/:path*',
          permanent: true,
        },
      ];
    }
    return [];
  },
};
```

---

### Phase 2: High Priority Fixes (Day 2-3)

#### 2.1 Password Strength Validation

**Effort:** 2 hours
**Files:** `LoginForm.tsx`, `SignupForm.tsx`, new validation utility

```bash
npm install zxcvbn @types/zxcvbn
```

```typescript
// lib/security/passwordValidation.ts
import zxcvbn from 'zxcvbn';

export interface PasswordValidation {
  valid: boolean;
  score: number; // 0-4
  strength: string;
  errors: string[];
  suggestions: string[];
}

export function validatePassword(
  password: string,
  userInputs: string[] = []
): PasswordValidation {
  const errors: string[] = [];

  // Basic requirements
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain a lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain a number');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain a special character');
  }

  // Check against common passwords and user data
  const result = zxcvbn(password, userInputs);

  return {
    valid: errors.length === 0 && result.score >= 3,
    score: result.score,
    strength: ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'][result.score],
    errors,
    suggestions: result.feedback.suggestions || []
  };
}
```

**Usage in signup form:**

```typescript
// components/auth/SignupForm.tsx
const [passwordValidation, setPasswordValidation] = useState<PasswordValidation | null>(null);

const handlePasswordChange = (value: string) => {
  setPassword(value);
  const validation = validatePassword(value, [email, name]);
  setPasswordValidation(validation);
};

// Render password strength indicator
{password && passwordValidation && (
  <div className="space-y-2">
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded">
        <div
          className={`h-full rounded transition-all ${
            passwordValidation.score === 0 ? 'bg-red-500 w-1/5' :
            passwordValidation.score === 1 ? 'bg-orange-500 w-2/5' :
            passwordValidation.score === 2 ? 'bg-yellow-500 w-3/5' :
            passwordValidation.score === 3 ? 'bg-green-500 w-4/5' :
            'bg-green-600 w-full'
          }`}
        />
      </div>
      <span className="text-sm">{passwordValidation.strength}</span>
    </div>

    {passwordValidation.errors.length > 0 && (
      <ul className="text-sm text-red-600 list-disc list-inside">
        {passwordValidation.errors.map((error, i) => (
          <li key={i}>{error}</li>
        ))}
      </ul>
    )}

    {passwordValidation.suggestions.length > 0 && (
      <ul className="text-sm text-muted-foreground list-disc list-inside">
        {passwordValidation.suggestions.map((suggestion, i) => (
          <li key={i}>{suggestion}</li>
        ))}
      </ul>
    )}
  </div>
)}
```

---

#### 2.2 Error Sanitization

**Effort:** 3 hours
**Files:** `auth.ts`, `AppwriteRepository.ts`

```typescript
// lib/errors/AuthError.ts
export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export function handleAuthError(error: any, context: string): never {
  // Log full error for debugging (will go to error tracking)
  if (process.env.NODE_ENV === 'development') {
    console.error(`Auth error (${context}):`, error);
  }

  // Sanitize for user display
  if (error.code) {
    const userMessage = getAuthErrorMessage(error.code);
    throw new AuthError(userMessage, error.code, error);
  }

  // Generic fallback
  throw new AuthError(
    'An error occurred during authentication. Please try again.',
    'UNKNOWN_ERROR',
    error
  );
}

function getAuthErrorMessage(code: number | string): string {
  const messages: Record<string, string> = {
    '401': 'Invalid email or password',
    '409': 'An account with this email already exists',
    '429': 'Too many attempts. Please try again later',
    '503': 'Service temporarily unavailable',
    'user_unauthorized': 'Invalid email or password',
    'user_already_exists': 'An account with this email already exists',
  };

  return messages[code] || 'Authentication failed. Please try again';
}
```

---

#### 2.3 Input Sanitization

**Effort:** 3 hours
**Files:** `AppwriteRepository.ts`, all form components

```bash
npm install isomorphic-dompurify html-escaper
```

```typescript
// lib/security/sanitization.ts
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeText(input: string, maxLength?: number): string {
  // Remove all HTML tags
  let sanitized = DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });

  // Trim whitespace
  sanitized = sanitized.trim();

  // Apply max length if specified
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

export function sanitizeHTML(input: string, maxLength?: number): string {
  // Allow safe HTML tags for rich text
  let sanitized = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOWED_URI_REGEXP: /^https?:\/\//
  });

  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

// Validation schemas
export interface ModuleDataValidation {
  name: string;
  vendor?: string;
  model?: string;
  serial?: string;
  comments?: string;
}

export function validateModuleData(data: any): ModuleDataValidation {
  return {
    name: sanitizeText(data.name, 255),
    vendor: data.vendor ? sanitizeText(data.vendor, 100) : undefined,
    model: data.model ? sanitizeText(data.model, 100) : undefined,
    serial: data.serial ? sanitizeText(data.serial, 100) : undefined,
    comments: data.comments ? sanitizeHTML(data.comments, 1000) : undefined,
  };
}
```

**Usage:**

```typescript
// AppwriteRepository.ts
import { validateModuleData } from '@/lib/security/sanitization';

async createModule(data: CreateModuleData) {
  // Sanitize all user inputs
  const sanitized = validateModuleData(data);

  // ... proceed with sanitized data
  await databases.createDocument(/* ... */, {
    name: sanitized.name,
    vendor: sanitized.vendor,
    // ...
  });
}
```

---

#### 2.4 Optimize getUserRole()

**Effort:** 1 hour
**Files:** `auth.ts`

```typescript
// auth.ts - Cache role in preferences
export async function getUserRole(user: Models.User<Models.Preferences>): Promise<UserRole> {
  // Check preferences cache first (instant)
  const cachedRole = user.prefs.role as UserRole | undefined;
  if (cachedRole) {
    return cachedRole;
  }

  // Determine role from labels/teams
  const role = await determineUserRole(user);

  // Cache for next time (fire and forget)
  updatePreferences({ ...user.prefs, role }).catch((error) => {
    console.warn('Failed to cache role:', error);
  });

  return role;
}

async function determineUserRole(user: Models.User<Models.Preferences>): Promise<UserRole> {
  // Check labels first (fastest)
  if (user.labels?.includes('admin')) return 'admin';
  if (user.labels?.includes('alpha')) return 'alpha';

  // Fallback: Check teams (only if no labels)
  try {
    const teams = await getTeams();
    const memberships = await teams.list();
    const teamNames = memberships.teams.map((t) => t.name.toLowerCase());

    if (teamNames.includes('admin')) return 'admin';
    if (teamNames.includes('alpha')) return 'alpha';

    return null;
  } catch (error) {
    console.error('Error fetching teams:', error);
    return null;
  }
}
```

---

### Phase 3: Medium Priority (Week 2)

#### 3.1 Audit Logging
- Create audit_logs collection
- Implement logging utility
- Add logs to sensitive operations

#### 3.2 CORS Documentation
- Document allowed origins
- Add validation helper

#### 3.3 Environment Validation
- Add startup checks
- Create middleware

#### 3.4 Request Timeouts
- Configure Appwrite Client timeout
- Add timeout wrapper utility

---

## 🧪 Testing Checklist

After implementing each phase:

### Phase 1 Tests

- [ ] Attempt 6 failed logins - verify lockout
- [ ] Create 6 sessions - verify oldest deleted
- [ ] Enable MFA - verify login requires code
- [ ] Try invalid invite code - verify rejection
- [ ] Access via HTTP - verify HTTPS redirect
- [ ] Check security headers with https://securityheaders.com

### Phase 2 Tests

- [ ] Test weak password - verify rejection
- [ ] Test XSS in comments - verify sanitization
- [ ] Trigger auth errors - verify user-friendly messages
- [ ] Check getUserRole performance (before/after)

### Phase 3 Tests

- [ ] Verify audit logs created for admin actions
- [ ] Test CORS from unauthorized origin
- [ ] Deploy with missing env vars - verify error
- [ ] Test request timeout handling

---

## 📊 Progress Tracking

| Issue # | Priority | Status | Est. Time | Actual Time | Notes |
|---------|----------|--------|-----------|-------------|-------|
| 1 | Critical | 🔲 Todo | 4h | - | Rate limiting |
| 2 | Critical | 🔲 Todo | 2h | - | Session limits |
| 3 | Critical | 🔲 Todo | 8h | - | MFA implementation |
| 4 | Critical | 🔲 Todo | 6h | - | Invite validation |
| 5 | Critical | 🔲 Todo | 2h | - | HTTPS enforcement |
| 6 | High | 🔲 Todo | 2h | - | Password validation |
| 7 | High | 🔲 Todo | 1h | - | Account lockout |
| 8 | High | 🔲 Todo | 1h | - | getUserRole() optimization |
| 9 | High | 🔲 Todo | 3h | - | Error sanitization |
| 12 | High | 🔲 Todo | 3h | - | Input sanitization |

**Total Critical Time:** 22 hours (~3 days)
**Total High Priority Time:** 10 hours (~1.5 days)

---

## 🚀 Deployment Checklist

Before deploying to production:

### Pre-Deployment

- [ ] All Phase 1 (Critical) issues resolved
- [ ] All tests passing
- [ ] Security headers verified
- [ ] MFA enabled for all admin accounts
- [ ] Invite codes generated
- [ ] Rate limits configured in Appwrite Console
- [ ] Session limits configured in Appwrite Console

### Deployment

- [ ] Deploy Appwrite collections (invite_codes, audit_logs)
- [ ] Deploy Appwrite Functions (invite validation)
- [ ] Deploy frontend with security fixes
- [ ] Update environment variables
- [ ] Enable HTTPS redirect

### Post-Deployment

- [ ] Verify HTTPS working
- [ ] Test complete auth flow
- [ ] Verify rate limiting working
- [ ] Check error tracking/logging
- [ ] Monitor for issues

---

## 📚 Resources

- [Appwrite Security Docs](https://appwrite.io/docs/advanced/security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security Headers](https://nextjs.org/docs/advanced-features/security-headers)
- [Password Hashing Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

---

**Status Key:**
- 🔲 Todo
- 🔄 In Progress
- ✅ Complete
- ⏸️ Blocked
- ❌ Won't Fix
