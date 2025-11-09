'use client';

/**
 * Community Module Browser Page
 *
 * Browse the public database of SFP module profiles submitted by the community.
 * Only available in Appwrite deployment mode.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { isAppwrite } from '@/lib/features-client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Search, Plus, Download, Info } from 'lucide-react';
import { CommunityModule, listCommunityModules } from '@/lib/community';

export default function CommunityPage() {
    const router = useRouter();
    const [modules, setModules] = useState<CommunityModule[]>([]);
    const [filteredModules, setFilteredModules] = useState<CommunityModule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Redirect if not in Appwrite mode
    useEffect(() => {
        if (!isAppwrite()) {
            router.push('/');
        }
    }, [router]);

    // Load community modules
    useEffect(() => {
        if (!isAppwrite()) return;

        async function loadModules() {
            try {
                setLoading(true);
                const data = await listCommunityModules();
                setModules(data);
                setFilteredModules(data);
                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load community modules');
            } finally {
                setLoading(false);
            }
        }

        loadModules();
    }, []);

    // Filter modules based on search query
    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredModules(modules);
            return;
        }

        const query = searchQuery.toLowerCase();
        const filtered = modules.filter(
            (mod) =>
                mod.name.toLowerCase().includes(query) ||
                mod.vendor?.toLowerCase().includes(query) ||
                mod.model?.toLowerCase().includes(query)
        );
        setFilteredModules(filtered);
    }, [searchQuery, modules]);

    if (!isAppwrite()) {
        return null;
    }

    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
            <section className="mb-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">Community Modules</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Browse and download SFP module profiles shared by the community
                        </p>
                    </div>
                    <Button onClick={() => router.push('/community/submit')}>
                        <Plus className="mr-2 h-4 w-4" />
                        Submit Module
                    </Button>
                </div>
            </section>

            <Alert className="mb-6">
                <Info className="h-4 w-4" />
                <AlertDescription>
                    Community modules are user-submitted and may not be verified. Always test with non-critical
                    hardware first.
                </AlertDescription>
            </Alert>

            <Card className="mb-6">
                <CardContent className="pt-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search by name, vendor, or model..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                </CardContent>
            </Card>

            {loading && (
                <div className="text-center py-12">
                    <p className="text-muted-foreground">Loading community modules...</p>
                </div>
            )}

            {error && (
                <Alert variant="destructive" className="mb-6">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {!loading && !error && filteredModules.length === 0 && (
                <Card>
                    <CardContent className="py-12 text-center">
                        <p className="text-muted-foreground">
                            {searchQuery
                                ? 'No modules found matching your search.'
                                : 'No community modules available yet. Be the first to submit one!'}
                        </p>
                    </CardContent>
                </Card>
            )}

            {!loading && !error && filteredModules.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredModules.map((module) => (
                        <Card key={module.$id} className="hover:shadow-md transition-shadow">
                            <CardHeader>
                                <CardTitle className="text-lg">{module.name}</CardTitle>
                                <CardDescription>
                                    {module.vendor && <div>Vendor: {module.vendor}</div>}
                                    {module.model && <div>Model: {module.model}</div>}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2 text-sm">
                                    {module.serial && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Serial:</span>
                                            <span className="font-mono">{module.serial}</span>
                                        </div>
                                    )}
                                    {module.wavelength && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Wavelength:</span>
                                            <span>{module.wavelength}</span>
                                        </div>
                                    )}
                                    {module.maxDistance && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Max Distance:</span>
                                            <span>{module.maxDistance}</span>
                                        </div>
                                    )}
                                    {module.linkType && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Link Type:</span>
                                            <span>{module.linkType}</span>
                                        </div>
                                    )}
                                    {module.formFactor && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Form Factor:</span>
                                            <span>{module.formFactor}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Size:</span>
                                        <span>{module.size} bytes</span>
                                    </div>
                                    {module.submittedBy && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Submitted by:</span>
                                            <span>{module.submittedBy}</span>
                                        </div>
                                    )}
                                </div>

                                {module.comments && (
                                    <div className="pt-2 border-t">
                                        <p className="text-sm text-muted-foreground">{module.comments}</p>
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <Badge variant={module.verified ? 'default' : 'secondary'}>
                                        {module.verified ? 'Verified' : 'Unverified'}
                                    </Badge>
                                    {module.downloads && module.downloads > 0 && (
                                        <Badge variant="outline">{module.downloads} downloads</Badge>
                                    )}
                                </div>

                                <Button
                                    className="w-full"
                                    onClick={() => router.push(`/community/module/${module.$id}`)}
                                >
                                    <Download className="mr-2 h-4 w-4" />
                                    View Details
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
