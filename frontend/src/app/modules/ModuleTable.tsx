'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { toast } from 'sonner';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { DeploymentMode } from '@/lib/features-client';
import { writeSfpFromModuleId } from '@/lib/ble/manager';
import { appwriteResourceIds } from '@/lib/appwrite/config';
import { mapDocumentToModuleRow, type ModuleRow as Row } from './types';

import { loadModulesAction } from './actions';
import type { ModuleRow } from './types';

type ModuleTableProps = {
  initialModules: ModuleRow[];
  deploymentMode: DeploymentMode;
  initialError?: string | null;
};

export function ModuleTable({ initialModules, deploymentMode, initialError }: ModuleTableProps) {
  const [rows, setRows] = useState<ModuleRow[]>(initialModules);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'id', desc: true }]);
  const [pageSize, setPageSize] = useState(10);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  useEffect(() => {
    setRows(initialModules);
  }, [initialModules]);

  useEffect(() => {
    if (initialError) {
      toast.error(initialError);
    }
  }, [initialError]);

  // Appwrite realtime updates (no manual refresh needed)
  useEffect(() => {
    if (deploymentMode !== 'appwrite') return;
    let subscription: any;
    (async () => {
      try {
        const { Realtime } = await import('appwrite');
        const { getAppwriteClient } = await import('@/lib/auth');
        const client = await getAppwriteClient();
        const rt = new Realtime(client);
        const channel = `databases.${appwriteResourceIds.databaseId}.collections.${appwriteResourceIds.userModulesCollectionId}.documents`;
        subscription = await rt.subscribe(channel, (event: any) => {
          const { events, payload } = event || {};
          if (!events || !payload) return;
          const row = mapDocumentToModuleRow(payload as any) as Row;
          setRows((prev) => {
            const idx = prev.findIndex((r) => r.id === row.id);
            if (events.some((e: string) => e.endsWith('.delete'))) {
              if (idx >= 0) return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
              return prev;
            }
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], ...row };
              return next;
            }
            return [row, ...prev];
          });
        });
      } catch (e) {
        console.error('Failed to subscribe to Appwrite realtime:', e);
      }
    })();
    return () => {
      try {
        if (subscription?.unsubscribe) subscription.unsubscribe();
        else if (subscription?.close) subscription.close();
      } catch {}
    };
  }, [deploymentMode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const modules = await loadModulesAction();
      setRows(modules);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to refresh modules. Please try again.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const onWrite = useCallback(async (id: string) => {
    try {
      toast('Starting write...', { description: `Module #${id}` });
      await writeSfpFromModuleId(id);
      toast.success('Write flow completed', { description: 'Consider reading back to verify' });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to write module to device.';
      toast.error(message);
    }
  }, []);

    const filtered = useMemo(() => {
      if (!query) {

        return rows;
      }
      const q = query.toLowerCase();

      return rows.filter((module) =>
        [module.id, module.vendor, module.model, module.serial]
          .filter(Boolean)
          .some((value) => value!.toString().toLowerCase().includes(q))
      );
  }, [query, rows]);

  const columns = useMemo<ColumnDef<ModuleRow>[]>(
    () => [
        {
          accessorKey: 'id',
          header: 'ID',
          cell: (info) => {
            const id = info.getValue<string>();

            return id.length > 10 ? `#${id.substring(0, 8)}...` : `#${id}`;
          },
        },
      { accessorKey: 'vendor', header: 'Vendor' },
      { accessorKey: 'model', header: 'Model' },
      { accessorKey: 'serial', header: 'Serial' },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="default">
                Write
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Write module #{row.original.id} to device?</AlertDialogTitle>
                <AlertDialogDescription>
                  Writing EEPROM can permanently damage your module if incorrect data is used. Make sure you have a backup and the
                  correct profile is selected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onWrite(row.original.id)}>
                  Write
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ),
      },
    ],
    [onWrite]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  useEffect(() => {
    table.setPageSize(pageSize);
  }, [pageSize, table]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Modules</h1>
          <p className="mt-1 text-sm text-neutral-500">Saved EEPROM captures</p>
          <Badge variant="secondary" className="mt-2">
            {deploymentMode === 'appwrite' ? 'Appwrite Cloud Library' : 'Local Library'}
          </Badge>
        </div>
        {deploymentMode !== 'appwrite' && (
          <Button onClick={load} variant="secondary" disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Module Library</CardTitle>
          <CardDescription>Write to device or inspect details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <Input
              placeholder="Search modules (id, vendor, model, serial)"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                table.setPageIndex(0);
              }}
              className="max-w-sm"
            />
            <div className="flex items-center gap-2">
              <div className="mr-2 hidden items-center gap-3 text-sm md:flex">
                <div className="flex items-center gap-1">
                  <Checkbox
                    id="col-vendor"
                    checked={table.getColumn('vendor')?.getIsVisible() ?? true}
                    onCheckedChange={() => table.getColumn('vendor')?.toggleVisibility()}
                  />
                  <label htmlFor="col-vendor">Vendor</label>
                </div>
                <div className="flex items-center gap-1">
                  <Checkbox
                    id="col-model"
                    checked={table.getColumn('model')?.getIsVisible() ?? true}
                    onCheckedChange={() => table.getColumn('model')?.toggleVisibility()}
                  />
                  <label htmlFor="col-model">Model</label>
                </div>
                <div className="flex items-center gap-1">
                  <Checkbox
                    id="col-serial"
                    checked={table.getColumn('serial')?.getIsVisible() ?? true}
                    onCheckedChange={() => table.getColumn('serial')?.toggleVisibility()}
                  />
                  <label htmlFor="col-serial">Serial</label>
                </div>
              </div>
              <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue placeholder="Rows" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="25">25 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {table.getHeaderGroups().map((headerGroup) =>
                    headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={header.id === 'id' ? 'w-[80px] cursor-pointer' : 'cursor-pointer'}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-neutral-500">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && table.getRowModel().rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-neutral-500">
                      No modules found.
                    </TableCell>
                  </TableRow>
                )}
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 text-sm text-neutral-500">
            <span>
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
            </span>
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              Prev
            </Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
