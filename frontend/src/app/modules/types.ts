import type { Module } from '@/lib/repositories';

export interface ModuleRow {
  id: string;
  name?: string;
  vendor?: string;
  model?: string;
  serial?: string;
  size?: number;
  createdAt?: string;
}

export function mapRepositoryModule(module: Module): ModuleRow {

  return {
    id: module.id,
    name: module.name,
    vendor: module.vendor ?? undefined,
    model: module.model ?? undefined,
    serial: module.serial ?? undefined,
    size: module.size ?? undefined,
    createdAt: module.created_at,
  };
}

export function mapDocumentToModuleRow(document: {
  $id: string;
  name?: string;
  vendor?: string;
  model?: string;
  serial?: string;
  size?: number;
  sha256?: string;
  eeprom_file_id?: string;
  $createdAt?: string;
}): ModuleRow {

  return {
    id: document.$id,
    name: document.name,
    vendor: document.vendor ?? undefined,
    model: document.model ?? undefined,
    serial: document.serial ?? undefined,
    size: document.size ?? undefined,
    createdAt: document.$createdAt,
  };
}
