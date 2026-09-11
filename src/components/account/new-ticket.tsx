'use client';

import { Plus } from 'lucide-react';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { openSupportTicket } from '@/server/actions/account';

/**
 * "New request" on the help page.
 *
 * The support desk had an agents' side and a customer thread, and no way for a
 * customer to start one. Linking an order is optional but offered first,
 * because most requests are about one, and an agent who has the order open
 * answers in one reply instead of three.
 */

export interface TicketOption {
  value: string;
  label: string;
}

export function NewTicketDialog({
  categories,
  orders,
}: {
  categories: TicketOption[];
  orders: TicketOption[];
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setKey((value) => value + 1);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-3.5" aria-hidden />
          New request
        </Button>
      </DialogTrigger>
      <TicketForm key={key} categories={categories} orders={orders} onDone={() => setOpen(false)} />
    </Dialog>
  );
}

function TicketForm({
  categories,
  orders,
  onDone,
}: {
  categories: TicketOption[];
  orders: TicketOption[];
  onDone: () => void;
}) {
  const formId = useId();
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      category: String(form.get('category') ?? ''),
      orderId: String(form.get('orderId') ?? ''),
      subject: String(form.get('subject') ?? '').trim(),
      body: String(form.get('body') ?? '').trim(),
    };

    setErrors({});
    startTransition(async () => {
      const result = await openSupportTicket(input);
      if (result.ok) {
        toast.success('Request sent', { description: 'We reply here and by email.' });
        onDone();
      } else if (result.field) {
        setErrors({ [result.field]: result.error });
      } else {
        toast.error(result.error ?? 'Could not send your request.');
      }
    });
  };

  return (
    <DialogContent
      title="How can we help?"
      description="A person on our support team reads every request."
      size="lg"
      footer={
        <>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} size="sm" loading={pending}>
            Send request
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="It is about" name="category" defaultValue="" required error={errors.category}>
            <option value="" disabled>
              Choose
            </option>
            {categories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select label="Order" name="orderId" defaultValue="" error={errors.orderId}>
            <option value="">Not about an order</option>
            {orders.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <Input
          label="Subject"
          name="subject"
          required
          maxLength={120}
          placeholder="The parcel says delivered but it has not arrived"
          error={errors.subject}
        />
        <Textarea
          label="Tell us what happened"
          name="body"
          rows={5}
          required
          maxLength={4000}
          hint="The more detail, the fewer questions back."
          error={errors.body}
        />
      </form>
    </DialogContent>
  );
}