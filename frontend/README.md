# SFPLiberate - Next.js Frontend

Modern Next.js 16 frontend for SFPLiberate SFP Wizard companion tool, built with shadcn/ui and TypeScript.

## 🎯 Overview

This is a complete rewrite of the SFPLiberate frontend using modern technologies:

- **Next.js 16** (App Router) with React 19
- **TypeScript 5** (strict mode)
- **Tailwind CSS 4** for styling
- **shadcn/ui** component library
- **Dual deployment support** (Standalone Docker + Appwrite Cloud)

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ (see `.nvmrc`)
- npm 10+

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Start development server
npm run dev
```

Visit http://localhost:3000

### Available Scripts

```bash
npm run dev          # Start dev server with Turbopack
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Lint code
npm run type-check   # TypeScript type checking
```

## ⚙️ Environment Variables

See `.env.example` for all available configuration options.

## 📚 Documentation

- [Epic Plan](../docs/NEXTJS_REWRITE_EPIC.md) - Complete rewrite epic
- [File Structure](../docs/NEXTJS_FILE_STRUCTURE.md) - Detailed folder mapping
- [GitHub Issues](../docs/ISSUES_CREATED.md) - All implementation stories

---

**Part of:** [EPIC-001 Next.js Frontend Rewrite](../docs/NEXTJS_REWRITE_EPIC.md)
**Status:** Phase 1 - Foundation

## Appwrite Mode Notes

- Hosted on Appwrite Sites (SSR) with native Web SDK; no Appwrite Functions required.
- Client config (endpoint/projectId) is injected at runtime into `window.__APPWRITE_CONFIG__` from `layout.tsx`.
- After login, the client creates a short-lived JWT and sends it to `/api/auth/set-jwt` so SSR server actions can authorize with `node-appwrite`.
- Modules page uses Appwrite Realtime; no manual refresh button in Appwrite mode.
- BLE/ESPHome checks are disabled in Appwrite mode (no `/api/*` calls in cloud).
- CSP `connect-src` includes Appwrite (`https://*.appwrite.io`, `https://nyc.cloud.appwrite.io`, and `wss://*.appwrite.io`) and `https://*.sfplib.com` for future custom APIs.
