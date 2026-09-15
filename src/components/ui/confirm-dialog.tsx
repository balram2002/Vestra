'use client';

import { useState } from 'react';

import { Button } from './button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from './dialog';
import { Input } from './input';

/**
 * Asking twice.
 *
 * For a change that reaches shoppers the moment it is made -- hiding a live
 * section, publishing an edit, putting a whole page back to how it shipped --
 * one click is one slip away from a broken homepage. This is the second step.
 *
 * TWO STRENGTHS, and the difference matters:
 *
 *   a confirmation     "Hide this section?" with a button. Enough for anything
 *                      that can be undone with one more click.
 *   type to confirm    for the few actions that undo a lot of work at once.
 *                      Typing a word cannot be done on autopilot, which is the
 *                      entire point: the muscle memory that clicks through a
 *                      confirmation cannot type RESET.
 *
 * It works uncontrolled, with its own trigger, or controlled -- opened by the
 * caller when the decision to ask depends on state, such as saving an edit to a
 * section that happens to be live.
 */
export function ConfirmDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'default',
  requireText,
  onConfirm,
  children,
}: {
  /** Omit to control it with `open`. */
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  /** A word that must be typed before the action is allowed. */
  requireText?: string;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const open = controlledOpen ?? innerOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInnerOpen(next);
    onOpenChange?.(next);
    // The word is asked for again every time: a confirmation that remembers the
    // last answer is a confirmation that stops confirming.
    if (!next) setTyped('');
  };

  const ready = !requireText || typed.trim().toUpperCase() === requireText.toUpperCase();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}

      <DialogContent
        title={title}
        description={description}
        footer={
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              size="sm"
              variant={tone === 'danger' ? 'danger' : 'primary'}
              disabled={!ready}
              onClick={() => {
                onConfirm();
                setOpen(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {children}
          {requireText ? (
            <Input
              label={`Type ${requireText} to confirm`}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoFocus
            />
          ) : null}
          {!children && !requireText ? (
            <p className="text-muted text-sm">This takes effect on the shop straight away.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
