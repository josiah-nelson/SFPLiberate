import type { ReactNode } from 'react';

import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';

import { ThemeProvider } from 'next-themes';
import { getAppwriteEndpoint, getAppwriteProjectId } from '@/lib/features';

import '@/app/globals.css';
import { AppHeader } from '@/components/layout/AppHeader';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { Toaster } from '@/components/ui/sonner';

const geistSans = localFont({
    src: './fonts/GeistVF.woff',
    variable: '--font-geist-sans',
    weight: '100 900'
});
const geistMono = localFont({
    src: './fonts/GeistMonoVF.woff',
    variable: '--font-geist-mono',
    weight: '100 900'
});

export const metadata: Metadata = {
    title: 'SFPLiberate',
    description: 'Bluetooth companion for Ubiquiti SFP Wizard - capture, clone, and manage SFP module EEPROM profiles',
    icons: {
        icon: '/favicon.ico',
        apple: '/apple-touch-icon.png',
    },
    manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
    themeColor: '#1E88E5',
};

const Layout = async ({ children }: Readonly<{ children: ReactNode }>) => {
    // Inject client runtime config for Appwrite Web SDK
    const endpoint = getAppwriteEndpoint();
    const projectId = getAppwriteProjectId();
    const inlineConfig = {
        endpoint,
        projectId,
        authEnabled: true,
    };
    return (
        // ? https://github.com/pacocoursey/next-themes?tab=readme-ov-file#with-app
        // ? https://react.dev/reference/react-dom/client/hydrateRoot#suppressing-unavoidable-hydration-mismatch-errors
        <html suppressHydrationWarning lang='en'>
            <body
                className={`${geistSans.variable} ${geistMono.variable} bg-background text-foreground overscroll-none antialiased`}>
                <script
                    // Safe JSON injection of client config
                    dangerouslySetInnerHTML={{
                        __html: `window.__APPWRITE_CONFIG__ = ${JSON.stringify(inlineConfig)};`,
                    }}
                />
                <ThemeProvider attribute='class'>
                    <AuthProvider>
                        <AppHeader />
                        {children}
                        <Toaster />
                    </AuthProvider>
                </ThemeProvider>
            </body>
        </html>
    );
};

export default Layout;
