import * as React from 'react';
import { cn } from '../../lib/utils';

interface DriftBannerProps {
  count: number;
  className?: string;
}

export default function DriftBanner({ count, className }: DriftBannerProps) {
  if (count === 0) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900',
        className
      )}
    >
      {count} {count === 1 ? 'event' : 'events'} with unexpected shape — schema validation failed
    </div>
  );
}
