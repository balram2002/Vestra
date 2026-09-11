'use client';

import { Star } from 'lucide-react';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';
import { submitReview } from '@/server/actions/reviews';

/**
 * "Write a review", on a delivered order item.
 *
 * Fit comes second, straight after the stars and before any typing: in
 * fashion, "runs small" is the most useful thing one buyer can tell the next,
 * and it is one tap. The review list's fit summary is built from it.
 */

type Fit = 'TOO_SMALL' | 'TRUE_TO_SIZE' | 'TOO_LARGE' | 'SKIP';

const FITS: ReadonlyArray<{ value: Fit; label: string }> = [
  { value: 'TOO_SMALL', label: 'Runs small' },
  { value: 'TRUE_TO_SIZE', label: 'True to size' },
  { value: 'TOO_LARGE', label: 'Runs large' },
  { value: 'SKIP', label: 'Not sure' },
];

const WORDS = ['', 'Poor', 'Not great', 'Okay', 'Good', 'Love it'];

interface Written {
  rating: number;
  status: string;
}

export function WriteReview({
  orderItemId,
  productTitle,
  size,
  existing,
}: {
  orderItemId: string;
  productTitle: string;
  size: string;
  existing: Written | null;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const [written, setWritten] = useState<Written | null>(existing);

  if (written) {
    return (
      <p className="text-muted mt-3 inline-flex items-center gap-1.5 text-xs">
        <Star className="text-warning-500 size-3.5 fill-current" aria-hidden />
        You rated it {written.rating} of 5
        {written.status === 'PENDING'
          ? ', publishing after a quick check'
          : written.status === 'REJECTED'
            ? ', not published'
            : ''}
      </p>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setKey((value) => value + 1);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="xs" variant="secondary" className="mt-3">
          <Star className="size-3.5" aria-hidden />
          Write a review
        </Button>
      </DialogTrigger>
      <ReviewForm
        key={key}
        orderItemId={orderItemId}
        productTitle={productTitle}
        size={size}
        onDone={(result) => {
          setOpen(false);
          setWritten(result);
        }}
      />
    </Dialog>
  );
}

function ReviewForm({
  orderItemId,
  productTitle,
  size,
  onDone,
}: {
  orderItemId: string;
  productTitle: string;
  size: string;
  onDone: (result: Written) => void;
}) {
  const formId = useId();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [fit, setFit] = useState<Fit>('SKIP');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rating === 0) {
      setErrors({ rating: 'Choose a star rating' });
      return;
    }
    const form = new FormData(event.currentTarget);

    setErrors({});
    startTransition(async () => {
      const result = await submitReview({
        orderItemId,
        rating,
        title: String(form.get('title') ?? '').trim(),
        body: String(form.get('body') ?? '').trim(),
        fitFeedback: fit === 'SKIP' ? null : fit,
      });
      if (result.ok && result.data) {
        toast.success(
          result.data.status === 'PUBLISHED'
            ? 'Thanks, your review is live'
            : 'Thanks. It goes live after a quick check.',
        );
        onDone({ rating, status: result.data.status });
      } else if (result.field) {
        setErrors({ [result.field]: result.error });
      } else {
        toast.error(result.error ?? 'Could not post your review.');
      }
    });
  };

  const shown = hover || rating;

  return (
    <DialogContent
      title="Write a review"
      description={`${productTitle}, size ${size}`}
      size="lg"
      footer={
        <>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} size="sm" loading={pending}>
            Post review
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-5">
        <fieldset>
          <legend className="text-ink text-sm font-medium">Your rating</legend>
          <div
            role="radiogroup"
            aria-label="Rating out of 5"
            className="mt-2 flex items-center gap-0.5"
            onMouseLeave={() => setHover(0)}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
                onClick={() => setRating(value)}
                onMouseEnter={() => setHover(value)}
                className={cn(
                  'grid size-11 place-items-center rounded-lg',
                  'transition-transform duration-(--duration-fast) motion-safe:active:scale-90',
                  'focus-visible:outline-accent focus-visible:outline-2',
                )}
              >
                <Star
                  aria-hidden
                  className={cn(
                    'size-7 transition-colors duration-(--duration-fast)',
                    value <= shown ? 'text-warning-500 fill-current' : 'text-line-strong',
                  )}
                />
              </button>
            ))}
            <span className="text-muted ml-2 text-sm" aria-live="polite">
              {WORDS[shown]}
            </span>
          </div>
          {errors.rating ? (
            <p className="text-danger-600 mt-1.5 text-xs" role="alert">
              {errors.rating}
            </p>
          ) : null}
        </fieldset>

        <fieldset>
          <legend className="text-ink text-sm font-medium">How did size {size} fit?</legend>
          <div role="radiogroup" aria-label="Fit" className="mt-2 flex flex-wrap gap-2">
            {FITS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={fit === option.value}
                onClick={() => setFit(option.value)}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-(--duration-fast)',
                  'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
                  fit === option.value
                    ? 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-line text-muted hover:border-line-strong hover:text-ink',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <Input
          label="Title"
          name="title"
          maxLength={80}
          placeholder="The fabric is lovely"
          hint="Optional."
          error={errors.title}
        />
        <Textarea
          label="Your review"
          name="body"
          rows={5}
          maxLength={2000}
          required
          placeholder="What you liked, what you did not, and how it wears."
          error={errors.body}
        />
        <p className="text-faint text-2xs">
          Shown with your first name and initial, marked as a verified purchase.
        </p>
      </form>
    </DialogContent>
  );
}