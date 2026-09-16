'use client';

import { Copy, Ellipsis, Share2, Video } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function ShareMenu({ title, path, demoPath, className = '' }: { title: string; path: string; demoPath?: string; className?: string }) {
  const copy = async (target: string) => {
    try { await navigator.clipboard.writeText(new URL(target, window.location.origin).href); toast.success('Link copied'); }
    catch { toast.error('Copy is unavailable in this browser. Use the address bar to share this page.'); }
  };
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button aria-label="More sharing options" className={`bg-raised text-ink border-line grid size-11 shrink-0 place-items-center rounded-full border ${className}`}><Ellipsis className="size-5" /></button></DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem onSelect={async () => { const url = new URL(path, window.location.origin).href; try { if (navigator.share) await navigator.share({ title, url }); else await copy(path); } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error('Unable to share. Try copying the link.'); } }}><Share2 />Share</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => copy(path)}><Copy />Copy page link</DropdownMenuItem>
      {demoPath ? <><DropdownMenuItem onSelect={() => copy(demoPath)}><Copy />Copy product demo link</DropdownMenuItem><DropdownMenuItem asChild><Link href={demoPath}><Video />Watch product demo</Link></DropdownMenuItem></> : null}
    </DropdownMenuContent>
  </DropdownMenu>;
}
