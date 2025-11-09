"use client";

import { useMemo, useState, useEffect } from 'react';
import type { ModuleRow } from '@/app/modules/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { writeSfpFromModuleId } from '@/lib/ble/manager';
import { features } from '@/lib/features';
import { isAppwrite } from '@/lib/features-client';
import { mapDocumentToModuleRow } from '@/app/modules/types';
import { appwriteResourceIds } from '@/lib/appwrite/config';

interface ModulesTableProps {
  initialData: ModuleRow[];
}

export function ModulesTable({ initialData }: ModulesTableProps) {
  const [rows, setRows] = useState<ModuleRow[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'id', desc: true }]);
  const [pageSize, setPageSize] = useState(10);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const base = features.api.baseUrl;

  // Update rows when initialData changes
  useEffect(() => {
    setRows(initialData);
  }, [initialData]);

  // Realtime updates in Appwrite mode
  useEffect(() => {
    if (!isAppwrite()) return;
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
          const row = mapDocumentToModuleRow(payload);
          setRows((prev) => {
            // upsert on create/update, remove on delete
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
  }, []);

  // Standalone refresh function (no-op in Appwrite mode)
  async function refreshData() {
    if (isAppwrite()) return; // gated, button hidden anyway
    setLoading(true);
    try {
      const res = await fetch(`${base}/v1/modules`, {
        next: { revalidate: 60 },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      setRows(list || []);
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  const onWrite = async (id: string) => {
    try {
      toast('Starting write...', { description: `Module #${id}` });
      await writeSfpFromModuleId(id);
      toast.success('Write flow completed', { description: 'Consider reading back to verify' });
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  const filtered = rows.filter((m) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      String(m.id).toLowerCase().includes(q) ||
      (m.vendor || '').toLowerCase().includes(q) ||
      (m.model || '').toLowerCase().includes(q) ||
      (m.serial || '').toLowerCase().includes(q)
    );
  });

  const columns = useMemo<ColumnDef<ModuleRow>[]>(
    () => [
      { accessorKey: 'id', header: 'ID', cell: (info) => `#${info.getValue<string>()}` },
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
                  Writing EEPROM can permanently damage your module if incorrect data is used. Make sure you have a
                  backup and the correct profile is selected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onWrite(row.original.id)}>Write</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ),
      },
    ],
    []
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Modules</h1>
          <p className="mt-1 text-sm text-neutral-500">Saved EEPROM captures</p>
        </div>
        {!isAppwrite() && (
          <Button onClick={refreshData} variant="secondary" disabled={loading}>
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
              onChange={(e) => {
                setQuery(e.target.value);
                table.setPageIndex(0);
              }}
              className="max-w-sm"
            />
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-3 mr-2 text-sm">
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
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
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
                  {table.getHeaderGroups().map((hg) =>
                    hg.headers.map((header) => (
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
                    <TableCell colSpan={5} className="text-neutral-500">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && table.getRowModel().rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-neutral-500">
                      No modules found.
                    </TableCell>
                  </TableRow>
                )}
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
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
