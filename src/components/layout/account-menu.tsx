'use client';

import { Heart, LayoutDashboard, LogOut, Package, Store, User } from 'lucide-react';
import Link from 'next/link';
import { useTransition } from 'react';

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
import { clearPreferredSizes } from '@/hooks/use-preferred-size';
import { signOut } from '@/server/actions/auth';

/**
 * The signed-in person, in the storefront header.
 *
 * Their initials, a chip naming a console role if they hold one, and a menu
 * with the consoles they can work in, their account and sign-out. The consoles
 * come first because they are why a seller or an admin opens this menu at all.
 */
export function AccountMenu({
  name,
  email,
  avatarUrl,
  chips,
  workspaces,
}: {
  name: string;
  email: string;
  avatarUrl: string | null;
  chips: string[];
  workspaces: Array<{ href: string; label: string; description: string; kind: 'admin' | 'seller' }>;
}) {
  const [pending, startTransition] = useTransition();
  const roles = chips.length > 0 ? `, ${chips.join(' and ')}` : '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${name}${roles}`}
        className={cn(
          'relative flex h-11 shrink-0 items-center gap-2 rounded-full px-1.5',
          'hover:bg-sunken data-[state=open]:bg-sunken transition-colors duration-(--duration-base)',
          'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
          chips.length > 0 && 'xl:pr-3',
        )}
      >
        <Avatar name={name} src={avatarUrl} size="sm" />
        {chips.length > 0 ? (
          <>
            <span className="bg-accent-soft text-accent-ink hidden rounded-full px-2 py-0.5 text-2xs font-semibold xl:inline">
              {chips[0]}
            </span>
            {/* Below xl there is no room for the word; a dot still says "more than a shopper". */}
            <span
              aria-hidden
              className="bg-accent absolute right-1 top-1.5 size-2.5 rounded-full ring-canvas ring-2 xl:hidden"
            />
          </>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <div className="px-2.5 py-2">
          <p className="text-ink truncate text-sm font-medium">{name}</p>
          <p className="text-faint truncate text-xs">{email}</p>
          {chips.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1" aria-label="Your roles">
              {chips.map((chip) => (
                <li
                  key={chip}
                  className="bg-accent-soft text-accent-ink rounded-full px-2 py-0.5 text-2xs font-semibold"
                >
                  {chip}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {workspaces.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Your workspaces</DropdownMenuLabel>
            {workspaces.map((workspace) => (
              <DropdownMenuItem key={workspace.href} asChild>
                {/*
                  A document navigation: each console is its own route group
                  with its own shell, so it loads fresh rather than inside the
                  shop's.
                */}
                <a href={workspace.href}>
                  {workspace.kind === 'admin' ? <LayoutDashboard /> : <Store />}
                  <span className="flex min-w-0 flex-col">
                    <span className="text-ink font-medium">{workspace.label}</span>
                    <span className="text-faint truncate text-2xs">{workspace.description}</span>
                  </span>
                </a>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <User />
            Your account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/orders">
            <Package />
            Your orders
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/wishlist">
            <Heart />
            Saved items
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            startTransition(async () => {
              clearPreferredSizes();
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
