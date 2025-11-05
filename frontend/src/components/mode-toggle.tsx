'use client';

import * as React from 'react';

import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';

import { MoonIcon, SunIcon } from 'lucide-react';

export function ModeToggle() {
    const { setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    const toggleTheme = React.useCallback(() => {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    }, [resolvedTheme, setTheme]);

    if (!mounted) {
        return (
            <Button variant='ghost' className='group/toggle h-8 w-8 px-0'>
                <span className='sr-only'>Toggle theme</span>
            </Button>
        );
    }

    return (
        <Button variant='ghost' className='group/toggle h-8 w-8 px-0' onClick={toggleTheme}>
            <SunIcon className='hidden [html.dark_&]:block' />
            <MoonIcon className='hidden [html.light_&]:block' />
            <span className='sr-only'>Toggle theme</span>
        </Button>
    );
}
