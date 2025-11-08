'use client';

/**
 * Admin Submissions Review Page
 *
 * Review, verify, and manage community-submitted modules.
 * Only accessible to users with admin role.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuthContext } from '@/components/providers/AuthProvider';
import { isAppwrite } from '@/lib/features-client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Eye, Trash2, AlertCircle } from 'lucide-react';
import {
    CommunityModule,
    listCommunityModules,
    verifyModule,
    deleteModule,
    getModulePhotoUrl,
} from '@/lib/community';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

export default function AdminSubmissionsPage() {
    const router = useRouter();
    const auth = useAuthContext();
    const [modules, setModules] = useState<CommunityModule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedModule, setSelectedModule] = useState<CommunityModule | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    // Redirect if not in Appwrite mode or not admin
    useEffect(() => {
        if (!isAppwrite()) {
            router.push('/');
        } else if (!auth.loading && (!auth.isAuthenticated || !auth.isAdmin)) {
            router.push('/');
        }
    }, [auth.isAuthenticated, auth.isAdmin, auth.loading, router]);

    // Load submissions
    useEffect(() => {
        if (!isAppwrite() || !auth.isAdmin) return;

        async function loadSubmissions() {
            try {
                setLoading(true);
                const data = await listCommunityModules();
                // Sort unverified first
                data.sort((a, b) => {
                    if (a.verified === b.verified) return 0;
                    return a.verified ? 1 : -1;
                });
                setModules(data);
                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load submissions');
            } finally {
                setLoading(false);
            }
        }

        loadSubmissions();
    }, [auth.isAdmin]);

    const handleVerify = async (moduleId: string) => {
        try {
            setActionLoading(true);
            await verifyModule(moduleId);

            // Update local state
            setModules(
                modules.map((mod) => (mod.$id === moduleId ? { ...mod, verified: true } : mod))
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to verify module');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedModule) return;

        try {
            setActionLoading(true);
            await deleteModule(selectedModule.$id);

            // Update local state
            setModules(modules.filter((mod) => mod.$id !== selectedModule.$id));
            setDeleteDialogOpen(false);
            setSelectedModule(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete module');
        } finally {
            setActionLoading(false);
        }
    };

    const openDeleteDialog = (module: CommunityModule) => {
        setSelectedModule(module);
        setDeleteDialogOpen(true);
    };

    if (!isAppwrite() || auth.loading) {
        return null;
    }

    if (!auth.isAdmin) {
        return null;
    }

    const unverifiedCount = modules.filter((m) => !m.verified).length;

    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
            <section className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight">Submission Review</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Review and manage community-submitted SFP modules
                </p>
            </section>

            {unverifiedCount > 0 && (
                <Alert className="mb-6">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        {unverifiedCount} unverified {unverifiedCount === 1 ? 'submission' : 'submissions'} pending
                        review
                    </AlertDescription>
                </Alert>
            )}

            {error && (
                <Alert variant="destructive" className="mb-6">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {loading && (
                <div className="text-center py-12">
                    <p className="text-muted-foreground">Loading submissions...</p>
                </div>
            )}

            {!loading && modules.length === 0 && (
                <Card>
                    <CardContent className="py-12 text-center">
                        <p className="text-muted-foreground">No submissions yet</p>
                    </CardContent>
                </Card>
            )}

            {!loading && modules.length > 0 && (
                <div className="space-y-4">
                    {modules.map((module) => (
                        <Card key={module.$id} className={!module.verified ? 'border-yellow-500 border-2' : ''}>
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <CardTitle className="text-lg">{module.name}</CardTitle>
                                        <CardDescription>
                                            {module.vendor && <div>Vendor: {module.vendor}</div>}
                                            {module.model && <div>Model: {module.model}</div>}
                                            {module.submittedBy && (
                                                <div className="mt-1">Submitted by: {module.submittedBy}</div>
                                            )}
                                        </CardDescription>
                                    </div>
                                    <Badge variant={module.verified ? 'default' : 'secondary'}>
                                        {module.verified ? 'Verified' : 'Pending'}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-2 text-sm">
                                    <div className="space-y-2">
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
                                    </div>
                                    <div className="space-y-2">
                                        {module.formFactor && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Form Factor:</span>
                                                <span>{module.formFactor}</span>
                                            </div>
                                        )}
                                        {module.connectorType && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Connector:</span>
                                                <span>{module.connectorType}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Size:</span>
                                            <span>{module.size} bytes</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Downloads:</span>
                                            <span>{module.downloads}</span>
                                        </div>
                                    </div>
                                </div>

                                {module.comments && (
                                    <div className="pt-2 border-t">
                                        <p className="text-sm">
                                            <span className="text-muted-foreground font-medium">Comments:</span>{' '}
                                            {module.comments}
                                        </p>
                                    </div>
                                )}

                                <div className="pt-2 border-t">
                                    <p className="text-xs text-muted-foreground font-mono">SHA256: {module.sha256}</p>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => router.push(`/community/module/${module.$id}`)}
                                    >
                                        <Eye className="mr-2 h-4 w-4" />
                                        View Details
                                    </Button>

                                    {!module.verified && (
                                        <Button
                                            size="sm"
                                            onClick={() => handleVerify(module.$id)}
                                            disabled={actionLoading}
                                        >
                                            <CheckCircle2 className="mr-2 h-4 w-4" />
                                            Verify
                                        </Button>
                                    )}

                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => openDeleteDialog(module)}
                                        disabled={actionLoading}
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Module</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete "{selectedModule?.name}"? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={actionLoading}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={actionLoading}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
