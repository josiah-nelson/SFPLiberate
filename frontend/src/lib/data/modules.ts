/**
 * Server-side data fetching for modules
 * Uses Next.js 16 "use cache" directive for automatic caching
 */

'use cache';

import { features } from '@/lib/features';

export type Module = {
  id: number;
  vendor?: string;
  model?: string;
  serial?: string;
  size?: number;
  created_at?: string;
};

/**
 * Fetch modules from backend with automatic caching
 * Cache revalidation: 60 seconds
 */
export async function getModules(): Promise<Module[]> {
  const baseUrl = features.api.baseUrl;

  try {
    const res = await fetch(`${baseUrl}/v1/modules`, {
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch modules: HTTP ${res.status}`);
    }

    const data = await res.json();
    return data || [];
  } catch (error) {
    console.error('Error fetching modules:', error);
    // Return empty array instead of throwing - better UX
    return [];
  }
}
