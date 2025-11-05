# Bluetooth Discovery Documentation

This directory contains comprehensive documentation for the Bluetooth discovery system refactor.

## 📚 Documentation Index

### For Developers

1. **[Migration Guide](./BLUETOOTH_MIGRATION_GUIDE.md)** - **START HERE if you have existing code**
   - Old API → New API comparison
   - Breaking changes
   - Code examples
   - Migration checklist

2. **[Refactor Summary](./BLUETOOTH_DISCOVERY_REFACTOR.md)** - **Read this to understand WHY**
   - Problem statement
   - Solution architecture
   - Technical details
   - Design decisions

3. **[Testing Guide](./BLUETOOTH_TESTING_GUIDE.md)** - **Follow this to validate**
   - Test flows
   - Browser compatibility
   - Troubleshooting
   - Success criteria

### For Reviewers

Read in this order:
1. Refactor Summary (understand the problem)
2. Migration Guide (see the solution)
3. Testing Guide (validate it works)

## 🎯 Quick Start

### Using the New API

```typescript
import { discoverAndConnectSfpDevice } from '@/lib/ble/discovery';
import { connect } from '@/lib/ble/manager';

try {
  // One call: show chooser, enumerate profile, save to localStorage
  const { device, profile } = await discoverAndConnectSfpDevice();
  
  // Connect via manager
  await connect('web-bluetooth');
  
  console.log(`Connected to ${device.name}`);
  console.log(`Service: ${profile.serviceUuid}`);
  
} catch (error: any) {
  if (error.code === 'user-cancelled') {
    // User closed chooser - no error needed
    return;
  }
  
  // Show helpful error message
  console.error(error.message);
}
```

That's it! No scanning, no manual UUID discovery, no fragile advertisement parsing.

## 🔧 Testing

```bash
# Start dev server
cd frontend && npm run dev

# Open in Chrome/Edge (best support)
open http://localhost:3000

# Click "Discover and Connect"
# Select device from chooser
# Should connect automatically
```

See [Testing Guide](./BLUETOOTH_TESTING_GUIDE.md) for detailed test cases.

## 📁 Related Files

### Implementation
- `frontend/src/lib/ble/discovery.ts` - Core discovery logic (218 lines)
- `frontend/src/components/ble/DirectDiscovery.tsx` - UI component (230 lines)
- `frontend/src/lib/ble/manager.ts` - Connection management
- `frontend/src/lib/ble/profile.ts` - Profile persistence
- `frontend/src/lib/ble/types.ts` - TypeScript interfaces

### Documentation
- `.github/copilot-instructions.md` - AI agent guide (needs update)
- `CONTRIBUTING.md` - Contributor guidelines (needs update)
- `docs/SIDECAR_SITE_TODO.md` - Project planning

## 🚨 Important Notes

### What Changed
- ✅ **Removed** experimental `requestLEScan` API (unreliable)
- ✅ **Removed** advertisement UUID harvesting (fragile)
- ✅ **Added** automatic service/characteristic enumeration
- ✅ **Added** typed error handling with helpful messages
- ✅ **Simplified** from 4 buttons → 2 buttons in UI

### What Stayed the Same
- ✅ Profile storage format (localStorage)
- ✅ Connection management (manager.ts)
- ✅ BLE Manager API
- ✅ Proxy mode (backend WebSocket)

### Browser Support
| Browser | Status | Notes |
|---------|--------|-------|
| Chrome | ✅ Full support | Recommended |
| Edge | ✅ Full support | Recommended |
| Safari Desktop | ⚠️ Limited | Basic support, may have quirks |
| Safari iOS | ❌ Not supported | Web Bluetooth unavailable |
| Firefox | ❌ Not supported | Requires flag, not recommended |

## 🐛 Known Issues

### None Yet!

This is a brand new implementation. Please report issues with:
1. Browser version
2. OS version
3. Device name (if applicable)
4. Error message from UI
5. Console logs

## 📝 TODO

- [ ] Browser testing on actual hardware
- [ ] Update `.github/copilot-instructions.md` with new architecture
- [ ] Update `CONTRIBUTING.md` with new discovery flow
- [ ] Add integration tests
- [ ] Consider adding device name pattern validation
- [ ] Document firmware-specific quirks as discovered

## 🤝 Contributing

When making changes to Bluetooth discovery:

1. **Don't break the API** - Add new functions, deprecate old ones
2. **Test on hardware** - Simulator isn't enough for BLE
3. **Update docs** - All three files (Migration, Refactor, Testing)
4. **Add error handling** - BLE has many failure modes
5. **Keep it simple** - Complexity is the enemy of reliability

See [CONTRIBUTING.md](../CONTRIBUTING.md) for general guidelines.

## 📖 Further Reading

### Web Bluetooth API
- [MDN Web Bluetooth Guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- [Web Bluetooth Spec](https://webbluetoothcg.github.io/web-bluetooth/)
- [Chrome Status](https://chromestatus.com/feature/5264933985976320)

### SFP/EEPROM Standards
- SFF-8472 Specification (EEPROM layout)
- SFF-8436 Specification (QSFP+)
- See `artifacts/` directory for reference captures

### Ubiquiti SFP Wizard
- This is **unofficial** software for UACC-SFP-Wizard
- Official app available on iOS/Android
- See `artifacts/nRFscanner Output.txt` for protocol analysis

## ❓ FAQ

### "Why not use scanning?"

Scanning via `requestLEScan` is experimental, unreliable, and not widely supported. The standard `requestDevice` with service enumeration is more reliable.

### "Why not save UUIDs in the profile immediately?"

We do! The `discoverAndConnectSfpDevice()` function automatically saves the discovered profile to localStorage.

### "What if my device has a different name?"

The current implementation uses `namePrefix: 'SFP'` filter. If your device has a different name pattern, you'll need to modify the filter in `discovery.ts` or add configuration options.

### "Can I discover multiple devices?"

Not currently. The API is designed for single-device workflows. For multi-device support, call `discoverAndConnectSfpDevice()` multiple times with different profile storage keys.

### "What about security?"

Web Bluetooth requires HTTPS (except localhost). User must explicitly grant permission via browser chooser. No automatic pairing.

## 🏗️ Architecture Overview

```
User clicks "Discover and Connect"
           ↓
  discoverAndConnectSfpDevice()
           ↓
  navigator.bluetooth.requestDevice()
  (Browser shows device chooser)
           ↓
  User selects device
           ↓
  device.gatt.connect()
           ↓
  Enumerate all services
           ↓
  Find notify + write characteristics
           ↓
  Build SfpProfile object
           ↓
  saveActiveProfile() → localStorage
           ↓
  device.gatt.disconnect()
           ↓
  Return { device, profile }
           ↓
  Caller uses BLE Manager to reconnect
```

Simple, linear, predictable.

## 📞 Support

- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions  
- **Email:** See CONTRIBUTING.md for contact info

---

**Last Updated:** 2024-01-19  
**Refactor Version:** v1.0  
**Status:** ✅ Implementation complete, testing in progress
