# Contributing to SFPLiberate

Thanks for your interest in contributing to SFPLiberate! We welcome contributions from the community, whether it's bug fixes, new features, documentation improvements, or BLE protocol discoveries.

**Priority Areas:**
- Reverse-engineering and implementing the SFP write path via BLE
- Community module repository integration
- DDM (Digital Diagnostics Monitoring) capture and CSV export
- Testing and browser compatibility improvements

## Table of Contents
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)
- [Coding Standards](#coding-standards)
- [BLE Protocol Research](#ble-protocol-research)
- [Documentation](#documentation)
- [Community Guidelines](#community-guidelines)

## Getting Started

### Prerequisites
- Docker and Docker Compose
- For BLE testing: Ubiquiti SFP Wizard (UACC-SFP-Wizard) hardware
- For protocol research: nRF Connect app (mobile or desktop)
- Supported browser: Chrome/Edge (Safari has limited Web Bluetooth support)

### Quick Start
```bash
# Clone the repository
git clone https://github.com/josiah-nelson/SFPLiberate.git
cd SFPLiberate

# Start the full stack
docker-compose up --build

# Access the app
open http://localhost:8080

# View API documentation
open http://localhost:8080/api/docs
```

### Exploring the Codebase
- **Frontend**: `frontend/` - Next.js 16 + shadcn/ui (TypeScript)
- **Backend**: `backend/` - Python FastAPI with SQLite
- **Configuration**: `docker-compose.yml`
- **Docs**: `README.md`, `docs/NEXTJS_REWRITE_SUMMARY.md`, `docs/NEXTJS_REWRITE_EPIC.md`

Read `.github/copilot-instructions.md` for comprehensive architecture details.

## Development Setup

### Backend Development
```bash
# Run backend with live reload (optional, for faster iteration)
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# In another terminal, access at http://localhost:8000/api/docs
```

### Frontend Development
The frontend is a Next.js app in `frontend/`.

Local (without Docker):
```bash
cd frontend
npm install
npm run dev
# or npm run build
```

Pages:
- `/` Dashboard (Connection, BLE Control, Activity Tabs)
- `/modules` Module Library (search/sort/pagination, write confirmation)

Discovery & Web Bluetooth
- The Dashboard includes “Discover SFP and Connect” which first tries Web Bluetooth Scanning to detect devices named “sfp”, infer service/write/notify UUIDs, and connect directly; if scanning is unavailable, it falls back to proxy discovery/connection.
- Web Bluetooth requires a secure context (HTTPS or http://localhost). The app includes a banner that explains precise reasons when direct mode is blocked (secure context, navigator.bluetooth presence, adapter availability).

### Database Access
```bash
# Connect to SQLite database
docker exec -it sfpliberate-backend sqlite3 /app/data/sfp_library.db

# View schema
.schema

# Query modules
SELECT id, name, vendor, model, created_at FROM sfp_modules;
```

### Viewing Logs
```bash
# All services
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Frontend only
docker-compose logs -f frontend
```

## Making Changes

### Branch Naming
- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `ble/description` - BLE protocol work

### Commit Messages
Follow conventional commits format:
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ble`: BLE protocol discoveries

**Examples:**
```
feat(frontend): add client-side SHA-256 duplicate detection

fix(backend): handle malformed Base64 in module submission

docs(readme): update BLE testing workflow

ble: document write command sequence for firmware v1.2.3
```

## Appwrite Sites Deployments

When working on the Appwrite deployment target (cloud site):

- Use the Appwrite CLI from `frontend/` to push site code:
  ```bash
  cd frontend
  appwrite sites create-deployment --site-id sfpliberate --code . --activate true
  ```
- The frontend uses the native Appwrite Web SDK directly (no Appwrite Functions). Server actions use `node-appwrite` and accept either the Appwrite session cookie or a short‑lived JWT cookie set via `/api/auth/set-jwt` after login.
- The modules page uses Appwrite Realtime; there is no manual "Refresh" in Appwrite mode.
- Do not call `/api/*` in Appwrite mode. BLE/ESPHome checks are disabled for cloud.
- CSP is configured in `frontend/next.config.ts` to allow:
  - `connect-src`: `https://*.appwrite.io https://nyc.cloud.appwrite.io` and `wss://*.appwrite.io` for realtime
  - `https://*.sfplib.com` for future custom APIs (HTTP and WebSocket)

## Testing Guidelines

### Manual Testing Requirements
Before submitting a PR, verify:

**Backend Changes:**
- [ ] API endpoints return expected status codes and payloads
- [ ] Database operations don't corrupt existing data
- [ ] Duplicate detection works correctly (SHA-256)
- [ ] Malformed inputs are handled gracefully (try invalid Base64, oversized payloads)
- [ ] Check FastAPI docs at `/api/docs` render correctly

**Frontend Changes:**
- [ ] Test in Chrome/Edge (primary browsers)
- [ ] Test Safari compatibility if touching BLE code
- [ ] Verify Web Bluetooth connection flow
- [ ] Check UI responsiveness and error states
- [ ] Browser console shows no errors

**BLE Changes:**
- [ ] Test with actual SFP Wizard hardware
- [ ] Document firmware version tested
- [ ] Capture nRF Connect logs showing command/response
- [ ] Verify behavior across multiple read/write cycles
- [ ] Check for edge cases (no module, bad module, connection loss)

### Integration Testing
```bash
# Full stack test
docker-compose down -v  # Clean slate
docker-compose up --build
# Verify at http://localhost:8080
# Test: Connect → Read → Save → Load Library → Delete
```

### Automated Tests (Future)
We plan to add:
- Backend: `pytest` with coverage for API endpoints and database operations
- Frontend: Browser-based integration tests
- CI: Lint checks (currently: Python compile check in `.github/workflows/ci.yml`)

If adding tests, follow these patterns:
```python
# backend/tests/test_api.py
def test_save_module_duplicate_detection():
    """Verify SHA-256 duplicate returns existing ID."""
    # First save
    response1 = client.post("/api/modules", json=payload)
    assert response1.status_code == 200
    id1 = response1.json()["id"]
    
    # Duplicate save
    response2 = client.post("/api/modules", json=payload)
    assert response2.json()["status"] == "duplicate"
    assert response2.json()["id"] == id1
```

## Pull Request Process

### Before Submitting
1. **Read the PR template** at `.github/pull_request_template.md`
2. **Test locally** with `docker-compose up --build`
3. **Update documentation** if behavior changes
4. **Add TODOs** for known follow-up work (function suffix: `TODO`)
5. **Check for sensitive data** (API keys, personal info)

### PR Checklist
- [ ] Changes are focused and minimal (single concern per PR)
- [ ] Commit messages follow conventional format
- [ ] Documentation updated (README, TODO.md, inline comments)
- [ ] Tested locally end-to-end
- [ ] No breaking changes to existing APIs (or documented in PR)
- [ ] Added TODOs for incomplete work
- [ ] Screenshots/logs included for UI changes

### PR Title Format
```
<type>(<scope>): <description>

Examples:
feat(backend): add /api/modules/import endpoint
fix(frontend): safari acceptAllDevices fallback
docs: update BLE testing workflow in CONTRIBUTING
```

### Review Process
- Maintainers will review within 3-5 days
- Address feedback by pushing new commits (no force-push during review)
- Once approved, maintainers will merge (squash merge preferred for multi-commit PRs)
- After merge, your branch will be deleted automatically

## Issue Guidelines

### Before Creating an Issue
- Search existing issues to avoid duplicates
- Check `TODO.md` for planned work
- Review `.github/copilot-instructions.md` for known limitations

### Bug Reports
Use the bug report template (`.github/ISSUE_TEMPLATE/bug_report.md`).

**Required Information:**
- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Environment details:
  - OS and version
  - Browser and version
  - SFP Wizard firmware version (if applicable)
- Screenshots or browser console logs
- Docker logs if backend-related: `docker-compose logs backend`

**Good Bug Report Example:**
```markdown
## Describe the bug
Module library fails to load after saving 10+ modules

## To Reproduce
1. Connect to SFP Wizard
2. Read and save 12 different modules
3. Click "Load Library"
4. Browser console shows: "TypeError: Cannot read property 'name' of null"

## Expected behavior
All saved modules should display in the library list

## Environment
- OS: macOS 14.2
- Browser: Chrome 120.0.6099.129
- SFP Wizard: Firmware v1.2.3

## Logs
[Attach backend logs or browser console output]
```

### Feature Requests
Use the feature request template (`.github/ISSUE_TEMPLATE/feature_request.md`).

**Include:**
- Problem you're trying to solve
- Proposed solution with examples
- Alternative approaches considered
- Impact on existing functionality
- Relevant references (specs, similar tools)

### BLE Protocol Discoveries
For BLE research findings, create an issue with:
- **Title**: `[BLE] Discovery: <brief description>`
- **Firmware version** tested
- **Commands/characteristics** discovered
- **nRF Connect logs** or traffic captures
- **Expected behavior** vs observed
- **Validation steps** for others to reproduce

## Coding Standards

### Frontend (JavaScript)

**Style:**
- Vanilla JS (ES6+), no frameworks
- Use `async/await` for asynchronous code
- Prefer `const` and `let` over `var`
- Use template literals for string interpolation
- Single quotes for strings

**Browser Compatibility:**
- **Primary**: Chrome, Edge (Chromium)
- **Secondary**: Safari (limited Web Bluetooth support)
- Always convert `DataView` to `Uint8Array` for Safari compatibility
- Use feature detection: `isWebBluetoothAvailable()`, `isSafari()`
- Provide fallbacks: `acceptAllDevices` when UUID filtering fails

**Naming Conventions:**
- Functions: `camelCase` (e.g., `handleNotifications`, `parseAndDisplaySfpData`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `API_BASE_URL`, `SFP_SERVICE_UUID`)
- DOM references: `camelCase` (e.g., `connectButton`, `moduleList`)
- Suffix placeholder functions with `TODO` (e.g., `loadCommunityModulesTODO()`)

**Comments:**
- Use JSDoc for complex functions
- Explain BLE protocol quirks inline
- Reference SFF-8472 spec offsets when parsing EEPROM

**Example:**
```javascript
/**
 * Parses SFP EEPROM data based on SFF-8472 spec.
 * @param {ArrayBuffer} arrayBuffer - Raw EEPROM data (min 96 bytes)
 * @returns {Object} Parsed vendor, model, serial
 */
function parseAndDisplaySfpData(arrayBuffer) {
    // SFF-8472: Vendor name at bytes 20-36
    const vendor = asciiDecoder.decode(arrayBuffer.slice(20, 36)).trim();
    // ...
}
```

### Backend (Python)

**Style:**
- Python 3.11+ features encouraged
- Type hints preferred (but not enforced)
- FastAPI patterns: Pydantic models for validation
- Keep functions focused and testable

**Naming Conventions:**
- Functions: `snake_case` (e.g., `add_module`, `get_all_modules`)
- Classes: `PascalCase` (e.g., `SfpModuleIn`, `StatusMessage`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `DATABASE_FILE`)
- Private functions: `_leading_underscore`

**Error Handling:**
- Use FastAPI's `HTTPException` for API errors
- Catch specific exceptions (`sqlite3.IntegrityError`, `base64.Error`)
- Return meaningful error messages to frontend

**Database Patterns:**
- Use context managers for connections: `with get_db_connection() as conn:`
- Add migrations in `setup_database()` with `PRAGMA table_info` checks
- Never break existing column contracts

**Example:**
```python
def add_module(name: str, vendor: str, model: str, serial: str, 
               eeprom_data: bytes) -> Tuple[int, bool]:
    """
    Adds a new SFP module with duplicate detection via SHA-256.
    
    Returns:
        Tuple of (module_id, is_duplicate)
    """
    digest = hashlib.sha256(eeprom_data).hexdigest()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("INSERT INTO ...", (...))
            return cursor.lastrowid, False
        except sqlite3.IntegrityError:
            # Handle duplicate
            return existing_id, True
```

### Configuration Files

**Docker:**
- Use explicit versions in base images (e.g., `python:3.11-slim`)
- Mount volumes for persistent data (`backend_data:/app/data`)
- Expose ports only where needed (`backend` exposes 80 internally)

**NGINX:**
- Keep reverse proxy config minimal
- Always set proxy headers (`X-Real-IP`, `X-Forwarded-For`)
- Comment location blocks clearly

## BLE Protocol Research

### Critical Context
- **Core operations happen on-device**: The SFP Wizard reads/writes EEPROM internally
- **BLE broadcasts data**: Device sends logs and binary dumps over notifications
- **Commands are speculative**: Text commands like `[POST] /sfp/write/start` are guesses—verify before relying on them

### Research Workflow
1. **Setup**: Install nRF Connect (mobile or desktop)
2. **Discover**: Connect to SFP Wizard while using official app
3. **Sniff**: Monitor BLE traffic during read/write operations
4. **Document**: Capture characteristic UUIDs, data formats, command sequences
5. **Validate**: Test discovered commands across firmware versions
6. **Share**: Create issue or PR with findings

### What to Document
- Service and characteristic UUIDs
- Command format (ASCII text vs binary)
- Response patterns and timing
- Chunking requirements for large payloads
- Error conditions and recovery
- Firmware version tested (critical—behavior may change)

### Tools
- **nRF Connect**: [Mobile](https://www.nordicsemi.com/Products/Development-tools/nRF-Connect-for-mobile), [Desktop](https://www.nordicsemi.com/Products/Development-tools/nrf-connect-for-desktop)
- **Wireshark with Bluetooth plugin**: Desktop packet capture
- **Browser DevTools**: Monitor Web Bluetooth API calls

### Safety
- Test with non-critical modules first
- Never force-write to unknown modules
- Validate checksums before writing
- Document any bricking risks discovered

## Documentation

### When to Update Docs

**Always update when:**
- Adding/removing API endpoints → update `README.md` API section and `.github/copilot-instructions.md`
- Changing BLE behavior → update inline comments and `CONTRIBUTING.md`
- Discovering new constraints → update `.github/copilot-instructions.md` pitfalls section
- Completing TODO items → update `TODO.md` and remove `TODO` suffixes from code

- **`README.md`**: User-facing features, setup, roadmap
- **`TODO.md`**: Task tracking, backlog, known issues
- **`CONTRIBUTING.md`**: This file—development process
- **`.github/copilot-instructions.md`**: Architecture, patterns, pitfalls for AI agents

### Documentation Style
- Use clear, active voice
- Include code examples for complex concepts
- Reference specific files and line numbers when helpful
- Update inline comments when code changes
- Add JSDoc/docstrings for public APIs

## Community Guidelines

### Code of Conduct
- Be respectful and constructive
- Welcome newcomers and answer questions patiently
- Focus on technical merit, not personal preferences
- Credit others for their contributions

### Communication
- **Issues**: Technical discussions, bug reports, feature requests
- **Pull Requests**: Code review and implementation details
- **Discussions** (if enabled): General questions, ideas, community modules

### Community Module Contributions
When the community repo is live:
1. Read modules using this app
2. Submit via "Upload to Community" button (no GitHub account needed initially)
3. Maintainers review submissions in `/app/data/submissions` inbox
4. Approved modules are added to `SFPLiberate/modules` repo via PR
5. CI validates schema, checksums, and blob integrity

## Legal & Disclaimer

**This project is not affiliated with or endorsed by Ubiquiti Inc.**

- Use at your own risk
- Firmware updates may break functionality
- Writing to SFP modules can brick hardware
- Respect intellectual property and licensing
- Do not submit proprietary or copyrighted EEPROM data without permission

By contributing, you agree that your contributions will be licensed under the same license as this project (see LICENSE file).

---

## Questions?

- Check `.github/copilot-instructions.md` for architecture details
- Review existing issues and PRs for context
- Open a discussion or issue if stuck

**Thank you for contributing to SFPLiberate!** 🚀
