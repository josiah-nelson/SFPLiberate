import { getModules } from '@/lib/data/modules';
import { ModulesTable } from '@/components/modules/ModulesTable';

/**
 * Modules page - Server Component
 *
 * Fetches module data server-side with automatic caching.
 * Interactive table logic is delegated to ModulesTable (Client Component).
 */
export default async function ModulesPage() {
  // Fetch modules server-side with "use cache" directive
  const modules = await getModules();

  return <ModulesTable initialData={modules} />;
}
