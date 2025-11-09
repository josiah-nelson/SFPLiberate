'use client';

/**
 * Module Details Page
 *
 * View detailed information about a community module and download the EEPROM data.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { isAppwrite } from '@/lib/features-client';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Download, ArrowLeft, Image as ImageIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import {
    CommunityModule,
    getCommunityModule,
    downloadModuleBlob,
    incrementModuleDownloads,
    getModulePhotoUrl,
} from '@/lib/community';

export default function ModuleDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const moduleId = params.id as string;

    const [module, setModule] = useState<CommunityModule | null>(null);
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Redirect if not in Appwrite mode
    useEffect(() => {
        if (!isAppwrite()) {
            router.push('/');
        }
    }, [router]);

    // Load module details
    useEffect(() => {
        if (!isAppwrite() || !moduleId) return;

        async function loadModule() {
            try {
                setLoading(true);
                const data = await getCommunityModule(moduleId);
                setModule(data);

                // Load photo if available
                if (data.photoId) {
                    const url = await getModulePhotoUrl(data.photoId);
                    setPhotoUrl(url);
                }

                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load module');
            } finally {
                setLoading(false);
            }
        }

        loadModule();
    }, [moduleId]);

    const handleDownload = async () => {
        if (!module) return;

        try {
            setDownloading(true);

            // Download blob
            const blob = await downloadModuleBlob(module.blobId);

            // Create download link
            const url = URL.createObjectURL(new Blob([blob]));
            const a = document.createElement('a');
            a.href = url;
            a.download = `${module.name.replace(/[^a-z0-9]/gi, '_')}_${module.sha256.substring(0, 8)}.bin`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Increment download counter
            await incrementModuleDownloads(module.$id);
            setModule({ ...module, downloads: module.downloads + 1 });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to download module');
        } finally {
            setDownloading(false);
        }
    };

    if (!isAppwrite()) {
        return null;
    }

    if (loading) {
        return (
            <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
                <div className="text-center py-12">
                    <p className="text-muted-foreground">Loading module details...</p>
                </div>
            </div>
        );
    }

    if (error || !module) {
        return (
            <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
                <Alert variant="destructive">
                    <AlertDescription>{error || 'Module not found'}</AlertDescription>
                </Alert>
                <Button variant="outline" className="mt-4" onClick={() => router.push('/community')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Community
                </Button>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
            <Button variant="outline" className="mb-6" onClick={() => router.push('/community')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Community
            </Button>

            <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div>
                                    <CardTitle className="text-2xl">{module.name}</CardTitle>
                                    <CardDescription className="mt-2">
                                        {module.vendor && <div>Vendor: {module.vendor}</div>}
                                        {module.model && <div>Model: {module.model}</div>}
                                    </CardDescription>
                                </div>
                                <Badge variant={module.verified ? 'default' : 'secondary'} className="ml-4">
                                    {module.verified ? (
                                        <>
                                            <CheckCircle2 className="mr-1 h-3 w-3" />
                                            Verified
                                        </>
                                    ) : (
                                        <>
                                            <AlertCircle className="mr-1 h-3 w-3" />
                                            Unverified
                                        </>
                                    )}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {!module.verified && (
                                <Alert>
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription>
                                        This module has not been verified by administrators. Always test with
                                        non-critical hardware first.
                                    </AlertDescription>
                                </Alert>
                            )}

                            <div className="space-y-3">
                                <h3 className="font-semibold">Technical Details</h3>
                                <div className="grid gap-2 text-sm">
                                    {module.serial && (
                                        <div className="flex justify-between py-1 border-b">
                                            <span className="text-muted-foreground">Serial Number:</span>
                                            <span className="font-mono">{module.serial}</span>
                                        </div>
                                    )}
                                    {module.wavelength && (
                                        <div className="flex justify-between py-1 border-b">
                                            <span className="text-muted-foreground">Wavelength:</span>
                                            <span>{module.wavelength}</span>
                                        </div>
                                    )}
                                    {module.maxDistance && (
                                        <div className="flex justify-between py-1 border-b">
                                            <span className="text-muted-foreground">Max Distance:</span>
                                            <span>{module.maxDistance}</span>
                                        </div>
                                    )}
                                    {module.linkType && (
                                        <div className="flex justify-between py-1 border-b">
                                            <span className="text-muted-foreground">Link Type:</span>
                                            <span>{module.linkType}</span>
                                        </div>
                                    )}
                                    {module.formFactor && (
                                        <div className="flex justify-between py-1 border-b">
                                            <span className="text-muted-foreground">Form Factor:</span>
                                            <span>{module.formFactor}</span>
                                        </div>
                                    )}
                                    {module.connectorType && (
                                        <div className="flex justify-between py-1 border-b">
                                            <span className="text-muted-foreground">Connector Type:</span>
                                            <span>{module.connectorType}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between py-1 border-b">
                                        <span className="text-muted-foreground">EEPROM Size:</span>
                                        <span>{module.size} bytes</span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b">
                                        <span className="text-muted-foreground">Downloads:</span>
                                        <span>{module.downloads}</span>
                                    </div>
                                </div>
                            </div>

                            {module.comments && (
                                <div className="space-y-2">
                                    <h3 className="font-semibold">Comments</h3>
                                    <p className="text-sm text-muted-foreground">{module.comments}</p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <h3 className="font-semibold">Verification</h3>
                                <p className="text-xs font-mono break-all text-muted-foreground">
                                    SHA256: {module.sha256}
                                </p>
                            </div>

                            {module.submittedBy && (
                                <div className="text-xs text-muted-foreground">
                                    Submitted by {module.submittedBy} on{' '}
                                    {new Date(module.submittedAt).toLocaleDateString()}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="md:col-span-1 space-y-6">
                    {photoUrl && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">Module Photo</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <img
                                    src={photoUrl}
                                    alt={module.name}
                                    className="w-full rounded-md border"
                                />
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Download</CardTitle>
                            <CardDescription>Get the EEPROM data for this module</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button onClick={handleDownload} disabled={downloading} className="w-full">
                                {downloading ? (
                                    <>
                                        <Download className="mr-2 h-4 w-4 animate-pulse" />
                                        Downloading...
                                    </>
                                ) : (
                                    <>
                                        <Download className="mr-2 h-4 w-4" />
                                        Download EEPROM
                                    </>
                                )}
                            </Button>
                            <p className="text-xs text-muted-foreground mt-2">
                                This will download the binary EEPROM data that you can write to your SFP module using the
                                SFP Wizard.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
