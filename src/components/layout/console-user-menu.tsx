'use client';

import { ChevronsUpDown, ExternalLink, LayoutDashboard, LogOut, Store } from 'lucide-react';
import { useTransition } from 'react';

import { useConsoleRail } from '@/components/layout/console-shell';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/cn';
import { signOut } from '@/server/actions/auth';

/**
 * Who is signed in, pinned to the foot of the console rail.
 *
 * This replaces two things that used to be scattered: a "Name · Role" line in
 * the HEADER — which, in the seller console, sat beside the live switch and
 * pushed the header's content six pixels below the header itself — and a
 * separate theme row in the rail. Identity, theme and sign-out are all "about
 * me" rather than "about the work", and the rail's floor is where a console
 * user expects to find them.
 *
 * There was no sign-out anywhere in either console. A staff member on a shared
 * machine had to find the storefront account page to leave.
 */
export function ConsoleUserMenu({
  name,
  role,
  email,
  avatarUrl,
  storeHref,
  otherConsoles,
}: {
  name: string;
  role: string;
  email: string;
  avatarUrl: string | null;
  /** The seller's public storefront. Admin passes nothing. */
  storeHref?: string;
  /** The other console, for someone who is both staff and a seller. */
  otherConsoles?: Array<{ href: string; label: string }>;
}) {
  const [pending, startTransition] = useTransition();
  /*
   * Read from the shell rather than passed in: this component is rendered by a
   * SERVER layout that cannot know a client-side, per-browser preference.
   *
   * Collapse only applies from `lg` up — on a phone the rail is a full-width
   * drawer — so every collapsed style below is `lg:`-scoped rather than
   * conditional rendering, and the drawer always shows the full card.
   */
  const { collapsed } = useConsoleRail();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'hover:bg-sunken flex w-full min-w-0 items-center gap-2.5 rounded-lg p-1.5 text-left',
          'transition-colors duration-(--duration-fast)',
          'data-[state=open]:bg-sunken',
          'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
          collapsed && 'lg:justify-center',
        )}
        aria-label={`Account menu for ${name}`}
      >
        <Avatar name={name} src={avatarUrl} size="sm" />
        <span className={cn('min-w-0 flex-1', collapsed && 'lg:hidden')}>
          <span className="text-ink block truncate text-sm font-medium leading-tight">{name}</span>
          <span className="text-faint block truncate text-2xs">{role}</span>
        </span>
        <ChevronsUpDown
          className={cn('text-faint size-4 shrink-0', collapsed && 'lg:hidden')}
          aria-hidden
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-64">
        <div className="px-2.5 py-2">
          <p className="text-ink truncate text-sm font-medium">{name}</p>
          <p className="text-faint truncate text-xs">{email}</p>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {/*
          The three-way control rather than a cycling item. A menu has the room,
          and a cycling item never shows what the options are.
        */}
        <div className="px-2.5 pb-2">
          <ThemeToggle />
        </div>

        <DropdownMenuSeparator />

        {storeHref ? (
          <DropdownMenuItem asChild>
            <a href={storeHref} target="_blank" rel="noreferrer">
              <Store />
              View your storefront
              <ExternalLink className="ml-auto size-3.5" />
            </a>
          </DropdownMenuItem>
        ) : null}

        {otherConsoles?.map((entry) => (
          <DropdownMenuItem key={entry.href} asChild>
            <a href={entry.href}>
              <LayoutDashboard />
              {entry.label}
            </a>
          </DropdownMenuItem>
        ))}

        <DropdownMenuItem asChild>
          {/*
            A document navigation on purpose: the storefront is a sibling route
            group, and a soft transition would keep this console layout mounted
            around it. See lib/immersive.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">
            <ExternalLink />
            Back to the shop
          </a>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          destructive
          disabled={pending}
          // `onSelect` rather than `onClick`: it fires for the keyboard too, and
          // `preventDefault` keeps the menu open long enough to show the pending
          // label instead of closing on a click that has not finished.
          onSelect={(event) => {
            event.preventDefault();
            startTransition(async () => {
              await signOut();
            });
          }}
        >
          <LogOut />
          {pending ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
