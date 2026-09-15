import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RegisterForm } from '@/components/auth/register-form';
import { GoogleSignIn } from '@/components/auth/google-sign-in';
import { SignedInRedirect } from '@/components/auth/signed-in-redirect';

export const metadata: Metadata = {
  title: 'Create an account',
  robots: { index: false, follow: false },
};

/**
 * The form is static; only the check for an existing session waits on the
 * request, in a boundary of its own, so the fields never wait for it.
 */
export default function RegisterPage() {
  return (
    <>
      <Suspense fallback={null}>
        <SignedInRedirect />
      </Suspense>
      <GoogleSignIn />
      <RegisterForm />
    </>
  );
}
