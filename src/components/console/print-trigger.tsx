'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Print control for label and manifest pages.
 *
 * Deliberately does NOT auto-print on mount. A dialog that opens by itself
 * steals focus, and a seller who opened the tab to check an address before
 * printing ends up cancelling a dialog they did not ask for. One obvious
 * button, hidden from the printed sheet itself.
 */
export function PrintTrigger({ label = 'Print' }: { label?: string }) {
  return (
    <div className="mx-auto flex w-[4in] justify-end pt-4 print:hidden">
      <Button
        type="button"
        onClick={() => window.print()}
        size="sm"
      >
        <Printer className="size-3.5" aria-hidden />
        {label}
      </Button>
    </div>
  );
}
