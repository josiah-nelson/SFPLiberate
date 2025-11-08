'use client';

/**
 * Module Submission Page
 *
 * Submit a new SFP module profile to the community database.
 * Requires authentication. Only available in Appwrite deployment mode.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuthContext } from '@/components/providers/AuthProvider';
import { isAppwrite } from '@/lib/features-client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { submitCommunityModule, ModuleSubmission } from '@/lib/community';

export default function SubmitModulePage() {
    const router = useRouter();
    const auth = useAuthContext();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [eepromFile, setEepromFile] = useState<File | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);

    const [formData, setFormData] = useState<Partial<ModuleSubmission>>({
        name: '',
        comments: '',
        wavelength: '',
        maxDistance: '',
        linkType: '',
        formFactor: '',
        connectorType: '',
    });

    // Redirect if not in Appwrite mode or not authenticated
    useEffect(() => {
        if (!isAppwrite()) {
            router.push('/');
        } else if (!auth.loading && !auth.isAuthenticated) {
            router.push('/login');
        }
    }, [auth.isAuthenticated, auth.loading, router]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'eeprom' | 'photo') => {
        const file = e.target.files?.[0];
        if (file) {
            if (type === 'eeprom') {
                setEepromFile(file);
            } else {
                setPhotoFile(file);
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        if (!eepromFile) {
            setError('EEPROM file is required');
            return;
        }

        if (!formData.name?.trim()) {
            setError('Module name is required');
            return;
        }

        try {
            setLoading(true);

            const submission: ModuleSubmission = {
                name: formData.name!,
                comments: formData.comments || '',
                wavelength: formData.wavelength || undefined,
                maxDistance: formData.maxDistance || undefined,
                linkType: formData.linkType || undefined,
                formFactor: formData.formFactor || undefined,
                connectorType: formData.connectorType || undefined,
                eepromFile,
                photoFile: photoFile || undefined,
            };

            await submitCommunityModule(submission);

            setSuccess(true);
            setFormData({
                name: '',
                comments: '',
                wavelength: '',
                maxDistance: '',
                linkType: '',
                formFactor: '',
                connectorType: '',
            });
            setEepromFile(null);
            setPhotoFile(null);

            // Reset file inputs
            const eepromInput = document.getElementById('eeprom-file') as HTMLInputElement;
            const photoInput = document.getElementById('photo-file') as HTMLInputElement;
            if (eepromInput) eepromInput.value = '';
            if (photoInput) photoInput.value = '';

            setTimeout(() => {
                router.push('/community');
            }, 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to submit module');
        } finally {
            setLoading(false);
        }
    };

    if (!isAppwrite() || auth.loading) {
        return null;
    }

    if (!auth.isAuthenticated) {
        return null;
    }

    return (
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
            <section className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight">Submit Module</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Share your SFP module profile with the community
                </p>
            </section>

            {success && (
                <Alert className="mb-6">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>
                        Module submitted successfully! Redirecting to community page...
                    </AlertDescription>
                </Alert>
            )}

            {error && (
                <Alert variant="destructive" className="mb-6">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Module Information</CardTitle>
                    <CardDescription>
                        Provide details about the SFP module. Your submission will be reviewed before appearing in the
                        community database.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Required Fields */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">
                                    Module Name <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="name"
                                    name="name"
                                    placeholder="e.g., Cisco GLC-SX-MMD"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    required
                                    disabled={loading}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="eeprom-file">
                                    EEPROM File (.bin) <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="eeprom-file"
                                    type="file"
                                    accept=".bin"
                                    onChange={(e) => handleFileChange(e, 'eeprom')}
                                    required
                                    disabled={loading}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Upload the binary EEPROM dump from your SFP module
                                </p>
                            </div>
                        </div>

                        {/* Optional Fields */}
                        <div className="space-y-4 pt-4 border-t">
                            <h3 className="text-sm font-medium">Optional Information</h3>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="wavelength">Wavelength</Label>
                                    <Input
                                        id="wavelength"
                                        name="wavelength"
                                        placeholder="e.g., 850nm"
                                        value={formData.wavelength}
                                        onChange={handleInputChange}
                                        disabled={loading}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="maxDistance">Max Distance</Label>
                                    <Input
                                        id="maxDistance"
                                        name="maxDistance"
                                        placeholder="e.g., 550m"
                                        value={formData.maxDistance}
                                        onChange={handleInputChange}
                                        disabled={loading}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="linkType">Link Type</Label>
                                    <Input
                                        id="linkType"
                                        name="linkType"
                                        placeholder="e.g., Multi-mode"
                                        value={formData.linkType}
                                        onChange={handleInputChange}
                                        disabled={loading}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="formFactor">Form Factor</Label>
                                    <Input
                                        id="formFactor"
                                        name="formFactor"
                                        placeholder="e.g., SFP+"
                                        value={formData.formFactor}
                                        onChange={handleInputChange}
                                        disabled={loading}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="connectorType">Connector Type</Label>
                                    <Input
                                        id="connectorType"
                                        name="connectorType"
                                        placeholder="e.g., LC"
                                        value={formData.connectorType}
                                        onChange={handleInputChange}
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="photo-file">Photo (Optional)</Label>
                                <Input
                                    id="photo-file"
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleFileChange(e, 'photo')}
                                    disabled={loading}
                                />
                                <p className="text-xs text-muted-foreground">Upload a photo of the module label</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="comments">Comments / Notes</Label>
                                <Textarea
                                    id="comments"
                                    name="comments"
                                    placeholder="Any additional notes about this module..."
                                    value={formData.comments}
                                    onChange={handleInputChange}
                                    rows={4}
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <Button type="submit" disabled={loading} className="flex-1">
                                {loading ? (
                                    <>
                                        <Upload className="mr-2 h-4 w-4 animate-pulse" />
                                        Submitting...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="mr-2 h-4 w-4" />
                                        Submit Module
                                    </>
                                )}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => router.push('/community')}
                                disabled={loading}
                            >
                                Cancel
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
