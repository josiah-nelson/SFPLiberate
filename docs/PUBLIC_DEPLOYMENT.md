# Public Server Deployment Runbook

This guide covers deploying SFPLiberate as a **public-facing service** where users access the UI over the internet but run BLE communication locally on their own machines.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Public Internet                         │
│                                                              │
│  ┌──────────────┐                                           │
│  │  Appwrite    │  Hosts static UI files                    │
│  │  (or CDN)    │  No BLE functionality                     │
│  └──────┬───────┘                                           │
│         │ HTTPS                                             │
└─────────┼───────────────────────────────────────────────────┘
          │
          │
┌─────────▼───────────────────────────────────────────────────┐
│                     User's Local Network                     │
│                                                              │
│  ┌──────────────┐         WebSocket          ┌────────────┐ │
│  │   Browser    │◄──────────────────────────►│ BLE Proxy  │ │
│  │  (Safari/    │    ws://192.168.1.x:8081   │  Docker    │ │
│  │   Chrome)    │                            │ Container  │ │
│  └──────────────┘                            └──────┬─────┘ │
│                                                     │ BLE   │
│                                              ┌──────▼─────┐ │
│                                              │ SFP Wizard │ │
│                                              │   Device   │ │
│                                              └────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Key Benefits:**
- No server maintenance for end users
- Works on iOS/Safari (no Web Bluetooth API)
- Lightweight local container (~345MB)
- Public UI hosted on scalable infrastructure

## Configuration

### Environment Variables

For public deployment, set the following in your Appwrite configuration or static build environment:

```bash
# Disable backend BLE proxy (UI only)
BLE_PROXY_ENABLED=false

# Optional: Default BLE proxy URL hint for users
DEFAULT_BLE_PROXY_URL=ws://localhost:8081/ble/ws

# Enable authentication (Appwrite only)
NEXT_PUBLIC_ENABLE_AUTH=true
NEXT_PUBLIC_DEPLOYMENT_MODE=appwrite
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=your-project-id
```

### Access Control for Settings

**Important:** When deploying publicly with Appwrite authentication:

- **BLE Proxy Settings** (WebSocket URL configuration) should be **admin-only** to prevent users from misconfiguring or connecting to malicious proxies
- Implement role-based access control (RBAC) with Appwrite Teams/Labels:
  - `admin` role: Full access to settings, user management, community submissions review
  - `alpha` role: Early access users, read/write access to module library, can use app with default/configured proxy
- See [Auth Implementation TODO](#auth-implementation-todo) below for details

### Appwrite Database Setup

The public deployment uses **Appwrite's cloud database** to store the module library, replacing SQLite used in standalone mode. This provides:
- Automatic scaling and backups
- Row-level permissions with RBAC
- Real-time updates (future feature)
- Efficient BLOB storage for EEPROM data

**📚 Full Setup Instructions:** See [APPWRITE_DATABASE.md](./APPWRITE_DATABASE.md) for:
- Collection schema (attributes, indexes, permissions)
- Storage bucket configuration
- Environment variable setup
- Migration from SQLite (if needed)

**Quick Setup Checklist:**
1. ✅ Create Appwrite project
2. ✅ Create database `sfp_library` with collection `sfp_modules`
3. ✅ Create storage bucket `sfp_eeprom_data` for EEPROM files
4. ✅ Configure permissions (read: any, write: admins only)
5. ✅ Generate API key with database and storage scopes
6. ✅ Set environment variables (see `.env.example`)

**Static Export Mode** (for UI deployment):

1. Build static export:
   ```bash
   npm run build:static
   ```

2. Deploy to Appwrite Hosting:
   ```bash
   # Upload dist/ contents to Appwrite Storage
   # Configure bucket as public
   # Set up custom domain (optional)
   ```

3. Configure CORS (if needed):
   - Allow WebSocket connections from your domain to user's localhost
   - Modern browsers handle `ws://localhost` from `https://` origins

## User Setup Flow

### Step 1: User Pulls BLE Proxy Container

```bash
docker pull ghcr.io/sfpliberate/ble-proxy:latest
```

### Step 2: User Runs Container

**macOS:**
```bash
docker run -d \
  --name sfp-ble-proxy \
  --network host \
  --restart unless-stopped \
  ghcr.io/sfpliberate/ble-proxy:latest
```

**Linux:**
```bash
docker run -d \
  --name sfp-ble-proxy \
  --network host \
  --device=/dev/bus/usb \
  --cap-add=NET_ADMIN \
  --restart unless-stopped \
  ghcr.io/sfpliberate/ble-proxy:latest
```

**Windows (WSL2):**
```bash
docker run -d \
  --name sfp-ble-proxy \
  -p 8081:8081 \
  --restart unless-stopped \
  ghcr.io/sfpliberate/ble-proxy:latest
```

### Step 3: User Configures UI

1. Open public UI: `https://your-domain.com`
2. Navigate to Settings → BLE Proxy
3. Enter local proxy URL: `ws://192.168.1.100:8081/ble/ws` (replace with their local IP)
4. Click "Test Connection"
5. Start using SFP Wizard

## Scaling Considerations

### Expected Load (2-5 Concurrent Users)

**Public UI Hosting:**
- Static files (~5MB total)
- CDN recommended (Cloudflare, Appwrite)
- No backend processing required
- Cost: ~$0-5/month depending on traffic

**User-Side:**
- Each user runs their own BLE proxy container
- No shared resources between users
- No authentication/authorization needed on proxy (localhost only)

### Monitoring

**Public UI:**
- Monitor CDN/Appwrite uptime
- Track page load times (should be <1s globally)
- Monitor static asset delivery

**BLE Proxy (User-Side):**
- Health check endpoint: `GET http://localhost:8081/health`
- Logs available via: `docker logs sfp-ble-proxy`
- Container auto-restarts on failure

### Logging Best Practices

**Public UI (Minimal Logging):**
- No PII collection
- Optional analytics (privacy-respecting)
- Error reporting (Sentry, LogRocket)

**BLE Proxy (User-Controlled):**
```bash
# View logs
docker logs -f sfp-ble-proxy

# Adjust log level via environment variable
docker run -e LOG_LEVEL=DEBUG ...
```

## Security Considerations

### Public UI Security

✅ **Advantages:**
- No backend to compromise (when using standalone BLE proxy mode)
- Module library stored in Appwrite cloud database with row-level security
- Static file hosting for UI
- EEPROM data encrypted at rest in Appwrite Storage

⚠️ **Considerations:**
- Ensure HTTPS for UI hosting
- Use SRI (Subresource Integrity) for dependencies
- Content Security Policy (CSP) headers
- No sensitive data in client-side code

### BLE Proxy Security

✅ **Advantages:**
- Runs on user's local network only
- No internet exposure (localhost binding)
- No authentication needed (local trust)
- No USB/DBus mounts on public server

⚠️ **Considerations:**
- Users must trust the Docker image (verify signatures)
- Local network access only (firewall considerations)
- Container runs as non-root user (`bleproxy`)
- Regular security updates via Docker Hub

### Network Security

**Recommended User Setup:**
```bash
# Bind only to localhost (most secure)
docker run -p 127.0.0.1:8081:8081 ...

# Bind to specific local IP (for mobile access)
docker run -p 192.168.1.100:8081:8081 ...

# Avoid binding to 0.0.0.0 (exposes to entire network)
```

## Troubleshooting

### User Cannot Connect to BLE Proxy

**Check 1: Is container running?**
```bash
docker ps | grep sfp-ble-proxy
```

**Check 2: Health check**
```bash
curl http://localhost:8081/health
# Expected: {"status": "healthy", "ble_available": true}
```

**Check 3: Firewall**
```bash
# macOS
sudo lsof -i :8081

# Linux
sudo netstat -tulpn | grep 8081
```

**Check 4: WebSocket connection**
```bash
# Test with websocat
websocat ws://localhost:8081/ble/ws
```

### BLE Device Not Found

**Check 1: Bluetooth enabled**
```bash
# macOS
system_profiler SPBluetoothDataType

# Linux
hciconfig
bluetoothctl show
```

**Check 2: Container has Bluetooth access**
```bash
# Linux only - check device permissions
docker exec sfp-ble-proxy ls -la /dev/bus/usb
```

**Check 3: Increase discovery timeout**
- In UI settings, increase timeout from 5s to 10s
- Ensure SFP Wizard is powered on

### Container Won't Start

**Check logs:**
```bash
docker logs sfp-ble-proxy
```

**Common issues:**
- Port 8081 already in use → Change port: `-p 8082:8081`
- Missing bluez dependencies → Pull latest image
- Permission denied → Run with `--privileged` (last resort)

## Maintenance

### Updating BLE Proxy

```bash
# Stop and remove old container
docker stop sfp-ble-proxy
docker rm sfp-ble-proxy

# Pull latest image
docker pull ghcr.io/sfpliberate/ble-proxy:latest

# Start new container (use previous run command)
docker run -d --name sfp-ble-proxy ...
```

### Updating Public UI

**Appwrite:**
1. Build new static export: `npm run build:static`
2. Upload to Appwrite Storage
3. CDN automatically updates

**Custom CDN:**
1. Deploy to S3/equivalent
2. Invalidate CloudFront cache
3. Verify with cache-busting query params

## Cost Estimates

### Public Hosting Options

| Provider | Monthly Cost | Traffic Limit | Notes |
|----------|-------------|---------------|-------|
| Appwrite Cloud | $0-15 | 50GB bandwidth | Free tier available |
| Cloudflare Pages | $0 | Unlimited | Free for static sites |
| Netlify | $0-19 | 100GB bandwidth | Free tier available |
| Vercel | $0-20 | 100GB bandwidth | Free tier available |

### User Costs

- **Docker container**: Free
- **Bandwidth**: Negligible (local network only)
- **Storage**: ~345MB disk space

## Production Checklist

- [ ] Static UI build configured with `BLE_PROXY_ENABLED=false`
- [ ] HTTPS enabled on public domain
- [ ] Content Security Policy headers configured
- [ ] Error reporting setup (Sentry/LogRocket)
- [ ] Analytics configured (privacy-respecting)
- [ ] Documentation links updated in UI
- [ ] BLE proxy Docker image published to ghcr.io
- [ ] User setup guide published (README in ble-proxy-service/)
- [ ] Health check monitoring for public UI uptime
- [ ] Backup of static files configured
- [ ] CDN cache invalidation tested

## Support Resources

**For Public UI Issues:**
- GitHub Issues: `https://github.com/YourOrg/SFPLiberate/issues`
- Documentation: `https://your-domain.com/docs`

**For BLE Proxy Issues:**
- BLE Proxy README: `https://github.com/YourOrg/SFPLiberate/tree/main/ble-proxy-service`
- Docker Hub: `https://hub.docker.com/r/sfpliberate/ble-proxy`
- Community Forum: `https://forum.your-domain.com`

## Auth Implementation TODO

When implementing Appwrite authentication for public deployment, ensure:

### Role Definitions

1. **Admin Role** (`admin` label/team):
   - Access to Settings page (BLE proxy configuration)
   - Community submissions review/approval
   - User management (invite-only mode)
   - System health monitoring

2. **Alpha Role** (`alpha` label/team):
   - Module library read/write access
   - Can save personal modules (scoped to user)
   - Can submit modules to community (pending admin approval)
   - Cannot modify global settings
   - Cannot approve community submissions

### Implementation Checklist

- [ ] Create Appwrite Teams for `admin` and `alpha` roles
- [ ] Add authentication middleware to frontend (check user session)
- [ ] Create `useAuth()` and `useRole()` hooks
- [ ] Gate Settings page with `isAdmin()` check
- [ ] Add role-based routing guards
- [ ] Update API endpoints to verify user tokens and roles
- [ ] Add audit logging for admin actions
- [ ] Document invite-only user provisioning flow (assign `alpha` by default)

### Security Considerations

**Why Settings Should Be Admin-Only:**

1. **Malicious Proxy Risk:** Users could be tricked into connecting to a malicious WebSocket server that captures/modifies BLE data
2. **Service Disruption:** Misconfigured endpoints could break functionality for all users on shared machines
3. **Network Security:** Exposing internal network IPs in public settings could leak topology information

**Recommended Implementation:**

```typescript
// frontend/src/lib/auth.ts
export function useAuth() {
  const { user } = useAppwrite();
  return {
    isAuthenticated: !!user,
    isAdmin: user?.labels?.includes('admin'),
    isAlpha: user?.labels?.includes('alpha'),
    role: user?.labels?.includes('admin') ? 'admin' : 'alpha',
    user,
  };
}

// frontend/src/components/ble/BleProxySettings.tsx
export function BleProxySettings() {
  const { isAdmin } = useAuth();
  
  if (!isAdmin) {
    return <Unauthorized message="Admin access required" />;
  }
  
  // Settings form...
}
```

## Related Documentation

- [Main Deployment Guide](./DEPLOYMENT.md) - Full stack self-hosting
- [BLE Proxy Service README](../ble-proxy-service/README.md) - Standalone proxy setup
- [Build Optimization](./BUILD_OPTIMIZATION_SUMMARY.md) - Docker optimization details
