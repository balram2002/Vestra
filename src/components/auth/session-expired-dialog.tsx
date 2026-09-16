'use client';

import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function SessionExpiredDialog() {
  const [open, setOpen] = useState(true);
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent title="Your session has expired" description="Sign in again to continue where you left off." footer={<Button className="w-full" onClick={() => setOpen(false)}>Sign in again</Button>}><p className="text-muted text-sm">Your account is safe. Your destination will be restored after sign-in.</p></DialogContent></Dialog>;
}
