import { type Paise, toRupees } from './money';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const intFmt = new Intl.NumberFormat('en-IN');

/**
 * Render money. Retail prices in India are shown without paise; ledgers,
 * invoices and settlements need the exact figure, hence `precise`.
 */
export function formatMoney(paise: Paise, opts: { precise?: boolean } = {}): string {
  const value = toRupees(paise ?? 0);
  return opts.precise ? inrPrecise.format(value) : inr.format(Math.round(value));
}

/** Indian-convention compact money for KPI tiles: Rs 1.2Cr, Rs 84.5L, Rs 12.4K. */
export function formatMoneyCompact(paise: Paise): string {
  const rupees = toRupees(paise ?? 0);
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? '-' : '';
  if (abs >= 1e7) return sign + '₹' + (abs / 1e7).toFixed(abs / 1e7 >= 100 ? 0 : 2) + 'Cr';
  if (abs >= 1e5) return sign + '₹' + (abs / 1e5).toFixed(abs / 1e5 >= 100 ? 0 : 2) + 'L';
  if (abs >= 1e3) return sign + '₹' + (abs / 1e3).toFixed(abs / 1e3 >= 100 ? 0 : 1) + 'K';
  return sign + '₹' + Math.round(abs);
}

export function formatNumber(value: number): string {
  return intFmt.format(value ?? 0);
}

export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value ?? 0);
  if (abs >= 1e7) return (value / 1e7).toFixed(1) + 'Cr';
  if (abs >= 1e5) return (value / 1e5).toFixed(1) + 'L';
  if (abs >= 1e3) return (value / 1e3).toFixed(1) + 'K';
  return intFmt.format(value ?? 0);
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return (value >= 0 ? '' : '-') + Math.abs(value).toFixed(digits) + '%';
}

export function formatSignedPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return sign + Math.abs(value).toFixed(digits) + '%';
}

export function formatRating(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const dateShortFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
const timeFmt = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
const weekdayFmt = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

function asDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(value: string | number | Date): string {
  return dateFmt.format(asDate(value));
}
export function formatDateShort(value: string | number | Date): string {
  return dateShortFmt.format(asDate(value));
}
export function formatDateTime(value: string | number | Date): string {
  return dateTimeFmt.format(asDate(value));
}
export function formatTime(value: string | number | Date): string {
  return timeFmt.format(asDate(value));
}
export function formatWeekday(value: string | number | Date): string {
  return weekdayFmt.format(asDate(value));
}

/** ISO date (yyyy-mm-dd) in local time -- used by date-range inputs and CSV export. */
export function toISODate(value: string | number | Date): string {
  const d = asDate(value);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** "2 hours ago" / "in 3 days" -- timelines, notifications and audit logs. */
export function formatRelative(value: string | number | Date): string {
  const date = asDate(value);
  const diffMs = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return 'just now';
}

/**
 * A delivery promise, phrased the way shoppers read it. A range collapses to a
 * single day when both ends fall on the same date.
 */
export function formatDeliveryWindow(
  from: string | number | Date,
  to: string | number | Date,
): string {
  const a = asDate(from);
  const b = asDate(to);
  if (a.toDateString() === b.toDateString()) return formatWeekday(a);
  return `${formatDateShort(a)} – ${formatDateShort(b)}`;
}

/** Mask a phone number for support / ops contexts. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length < 10) return phone;
  return `+91 ${digits.slice(0, 2)}••••${digits.slice(6)}`;
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return phone;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'•'.repeat(Math.max(2, name.length - 2))}@${domain}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "S, M, L +2" -- for product cards where space is tight. */
/**
 * A transfer rate, for an upload in flight.
 *
 * Always one decimal below 10 units and none above, so the number stops
 * jittering at exactly the point where the extra digit adds nothing.
 */
export function formatTransferRate(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '—';
  return `${formatFileSize(bytesPerSecond)}/s`;
}

/**
 * A countdown, phrased the way a person would say it.
 *
 * Deliberately coarse above a minute: an upload that reports "1 min 47 sec"
 * and then "1 min 46 sec" invites the user to watch it rather than to look
 * away, and the precision is fictional anyway.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 1) return 'less than a second';
  if (seconds < 60) return `${Math.ceil(seconds)} sec`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export function formatList(items: readonly string[], max = 3): string {
  if (items.length === 0) return '';
  if (items.length <= max) return items.join(', ');
  return `${items.slice(0, max).join(', ')} +${items.length - max}`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/** Turn an enum-ish token such as OUT_FOR_DELIVERY into "Out for delivery". */
export function humanizeToken(token: string): string {
  const spaced = token.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
