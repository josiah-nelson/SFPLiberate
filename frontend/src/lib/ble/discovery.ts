import { saveActiveProfile } from './profile';

type AdvResult = {
  name?: string;
  uuids: string[];
};

export function canScan(): boolean {
  try {
    return !!(navigator && (navigator as any).bluetooth && typeof (navigator as any).bluetooth.requestLEScan === 'function');
  } catch {
    return false;
  }
}

export async function scanForSfp(timeoutMs = 6000): Promise<AdvResult | null> {
  // Use requestLEScan to harvest advertised service UUID(s) for devices with name containing "sfp"
  // This API may prompt for extra permission depending on platform/version.
  const bluetooth: any = (navigator as any).bluetooth;
  if (!bluetooth || typeof bluetooth.requestLEScan !== 'function') return null;

  let resolveFn: (v: AdvResult | null) => void;
  const done = new Promise<AdvResult | null>((resolve) => (resolveFn = resolve));

  // Prefer namePrefix filter if supported; also accept all and filter in handler as fallback.
  let scan: any;
  try {
    scan = await bluetooth.requestLEScan({ filters: [{ namePrefix: 'SFP' }, { namePrefix: 'sfp' }], keepRepeatedDevices: false });
  } catch {
    scan = await bluetooth.requestLEScan({ acceptAllAdvertisements: true, keepRepeatedDevices: false });
  }

  const onAdv = (event: any) => {
    try {
      const name = String(event.device?.name || '').toLowerCase();
      if (!name.includes('sfp')) return;
      const serviceUuids: string[] = Array.from(new Set([...(event.uuids || event.serviceUuids || [])]));
      // Stop scanning ASAP
      try { scan?.stop && scan.stop(); } catch {}
      try { bluetooth.removeEventListener?.('advertisementreceived', onAdv); } catch {}
      resolveFn!({ name: event.device?.name, uuids: serviceUuids });
    } catch {
      // ignore
    }
  };

  try { bluetooth.addEventListener?.('advertisementreceived', onAdv); } catch {}

  setTimeout(() => {
    try { scan?.stop && scan.stop(); } catch {}
    try { bluetooth.removeEventListener?.('advertisementreceived', onAdv); } catch {}
    resolveFn!(null);
  }, timeoutMs);

  return done;
}

export async function connectAndInferProfileFromServices(device: any, discoveredUuids: string[]): Promise<boolean> {
  // Try to connect and enumerate characteristics for one of the discovered services
  // In order to access a service, it must have been included in optionalServices of requestDevice.
  // We assume caller re-opened chooser with these uuids included.
  const gatt = await (device.gatt as any).connect();
  for (const uuid of discoveredUuids) {
    try {
      const service = await gatt.getPrimaryService(uuid);
      const chars = await service.getCharacteristics();
      const notify = chars.find((c: any) => c.properties?.notify);
      const write = chars.find((c: any) => c.properties?.writeWithoutResponse) || chars.find((c: any) => c.properties?.write);
      if (notify && write) {
        saveActiveProfile({ serviceUuid: uuid, writeCharUuid: write.uuid, notifyCharUuid: notify.uuid });
        try { await (device.gatt as any).disconnect(); } catch {}
        return true;
      }
    } catch {
      // continue next service
    }
  }
  try { await (device.gatt as any).disconnect(); } catch {}
  return false;
}
