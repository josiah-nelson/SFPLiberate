/**
 * Signal strength indicator component.
 *
 * Displays RSSI as visual bars with color coding.
 */

import { getSignalStrength } from '@/types/ha-bluetooth';
import { Signal, SignalHigh, SignalLow, SignalMedium } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SignalStrengthProps {
  rssi: number;
  className?: string;
  showValue?: boolean;
}

export function SignalStrength({ rssi, className, showValue = false }: SignalStrengthProps) {
  const signal = getSignalStrength(rssi);

  // Color classes based on signal level
  const colorClass = {
    excellent: 'text-green-600',
    good: 'text-blue-600',
    fair: 'text-yellow-600',
    poor: 'text-red-600',
  }[signal.level];

  // Icon based on bars
  const Icon = {
    4: SignalHigh,
    3: SignalMedium,
    2: SignalLow,
    1: Signal,
  }[signal.bars] || Signal;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Icon className={cn('h-4 w-4', colorClass)} />
      {showValue && (
        <span className={cn('text-sm font-medium', colorClass)}>
          {rssi} dBm
        </span>
      )}
    </div>
  );
}

/**
 * Signal strength bars (alternative visual).
 */
export function SignalBars({ rssi, className }: SignalStrengthProps) {
  const signal = getSignalStrength(rssi);

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {[1, 2, 3, 4].map((bar) => (
        <div
          key={bar}
          className={cn(
            'w-1 rounded-sm transition-colors',
            bar <= signal.bars
              ? {
                  excellent: 'bg-green-600',
                  good: 'bg-blue-600',
                  fair: 'bg-yellow-600',
                  poor: 'bg-red-600',
                }[signal.level]
              : 'bg-gray-300'
          )}
          style={{
            height: `${bar * 4}px`,
          }}
        />
      ))}
    </div>
  );
}
