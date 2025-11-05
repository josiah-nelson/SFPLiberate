import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConnectPanel } from '@/components/ble/ConnectPanel';
import { ConnectionStatus } from '@/components/ble/ConnectionStatus';
import { ActivityTabs } from '@/components/ble/ActivityTabs';

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <section className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">SFPLiberate</h1>
        <p className="mt-1 text-sm text-neutral-500">Modern Next.js + shadcn UI for SFP Wizard BLE capture and module management.</p>
      </section>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Connection</CardTitle>
            <CardDescription>Current status and device information</CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectionStatus />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>BLE Control</CardTitle>
            <CardDescription>Connect, read EEPROM, save modules, and proxy discovery</CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectPanel />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Activity Log</CardTitle>
            <CardDescription>Recent actions and device messages</CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityTabs />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
