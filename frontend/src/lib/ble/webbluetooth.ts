import type { SfpProfile, GattLikeCharacteristic } from './types';

const textEncoder = new TextEncoder();

export async function requestDeviceWithFallback(serviceUuid: string) {
  // First try filtered request; if it fails, fall back to acceptAllDevices
  try {
    // @ts-expect-error Web Bluetooth typings not included by default
    return await navigator.bluetooth.requestDevice({
      filters: [{ services: [serviceUuid] }],
      optionalServices: [serviceUuid],
    });
  } catch (err) {
    // @ts-expect-error Web Bluetooth typings not included by default
    return navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [serviceUuid],
    });
  }
}

export async function requestAnyDeviceChooser() {
  // Open the native chooser without service filters. Note: accessing services will still
  // require declaring optionalServices ahead of time, so this is for selection only.
  // @ts-expect-error Web Bluetooth typings not included by default
  return await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
}

export async function connectDirect(profile: SfpProfile) {
  const device = await requestDeviceWithFallback(profile.serviceUuid);
  device.addEventListener('gattserverdisconnected', () => {
    // No-op; consumer can attach their own callbacks
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(profile.serviceUuid);
  const writeCharacteristic = await service.getCharacteristic(profile.writeCharUuid);
  const notifyCharacteristic = await service.getCharacteristic(profile.notifyCharUuid);
  return { device, server, service, writeCharacteristic, notifyCharacteristic } as const;
}

export async function startNotifications(
  notifyCharacteristic: GattLikeCharacteristic,
  handler: (ev: { target: { value: DataView } }) => void,
) {
  const notifier = await notifyCharacteristic.startNotifications();
  if (notifier && typeof (notifier as any).addEventListener === 'function') {
    (notifier as any).addEventListener('characteristicvaluechanged', handler);
  } else if (typeof notifyCharacteristic.addEventListener === 'function') {
    notifyCharacteristic.addEventListener('characteristicvaluechanged', handler);
  }
}

export async function writeText(
  writeCharacteristic: GattLikeCharacteristic,
  text: string,
) {
  const encoded = textEncoder.encode(text);
  await writeCharacteristic.writeValueWithoutResponse(encoded);
}

export async function writeChunks(
  writeCharacteristic: GattLikeCharacteristic,
  data: Uint8Array,
  chunkSize = 20,
  delayMs = 10,
  withResponse = false,
  onProgress?: (writtenChunks: number, totalChunks: number) => void,
) {
  const totalChunks = Math.ceil(data.length / chunkSize);
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, Math.min(i + chunkSize, data.length));
    if (withResponse) {
      await writeCharacteristic.writeValue(chunk);
    } else {
      await writeCharacteristic.writeValueWithoutResponse(chunk);
    }
    const written = Math.ceil((i + chunk.length) / chunkSize);
    if (onProgress) onProgress(written, totalChunks);
    if (delayMs > 0 && i + chunkSize < data.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export function isWebBluetoothAvailable(): boolean {
  // @ts-expect-error Web Bluetooth typings not included by default
  return !!(navigator && navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function');
}

export function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua) && !/Edg\//.test(ua);
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
}
