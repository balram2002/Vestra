'use client';

import { Printer } from 'lucide-react';

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
      <button
        type="button"
        onClick={() => window.print()}
        className="bg-ink text-canvas inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium"
      >
        <Printer className="size-3.5" aria-hidden />
        {label}
      </button>
    </div>
  );
}
