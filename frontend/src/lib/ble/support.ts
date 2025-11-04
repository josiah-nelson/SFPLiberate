export type BluetoothSupport = {
  supported: boolean;
  secureContext: boolean;
  loopbackHost: boolean;
  hasNavigatorBluetooth: boolean;
  hasRequestDevice: boolean;
  availability: boolean | null;
  reasons: string[];
};

export async function detectBluetoothSupport(): Promise<BluetoothSupport> {
  const reasons: string[] = [];
  const secureContext = typeof window !== 'undefined' ? !!window.isSecureContext : false;
  const currentLocation = typeof window !== 'undefined' ? window.location : undefined;
  const host = currentLocation?.hostname ?? '';
  const loopbackHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const hasNavigatorBluetooth = typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;
  const hasRequestDevice = hasNavigatorBluetooth && typeof (navigator as any).bluetooth?.requestDevice === 'function';

  let availability: boolean | null = null;
  try {
    if (hasNavigatorBluetooth && typeof (navigator as any).bluetooth.getAvailability === 'function') {
      availability = await (navigator as any).bluetooth.getAvailability();
    }
  } catch {
    availability = null;
  }

  if (!secureContext) reasons.push('Page is not a secure context (use HTTPS or localhost).');
  if (!loopbackHost && currentLocation && currentLocation.protocol !== 'https:') {
    reasons.push('Non-loopback HTTP origin; use https:// or http://localhost.');
  }
  if (!hasNavigatorBluetooth) reasons.push('navigator.bluetooth missing');
  if (hasNavigatorBluetooth && !hasRequestDevice) reasons.push('navigator.bluetooth.requestDevice missing');
  if (availability === false) reasons.push('Bluetooth adapter reported unavailable');

  const supported = secureContext && hasNavigatorBluetooth && hasRequestDevice && (availability !== false);

  return { supported, secureContext, loopbackHost, hasNavigatorBluetooth, hasRequestDevice, availability, reasons };
}
