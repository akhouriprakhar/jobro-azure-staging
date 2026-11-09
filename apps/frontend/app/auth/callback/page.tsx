'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';

function AuthCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // 1. Check if Supabase passed an auth error in the URL query params
    const oauthError = searchParams.get('error');
    const oauthErrorDescription = searchParams.get('error_description');

    if (oauthError) {
      console.error('OAuth redirect error:', oauthError, oauthErrorDescription);
      setErrorMsg(oauthErrorDescription || oauthError);
      return;
    }

    // 2. Listen for auth state changes (Supabase parses hash from URL)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        router.push('/');
      }
    });

    // 3. Quick fallback check for existing session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/');
      }
    };
    checkSession();

    // 4. Timeout fallback
    const timeout = setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          router.push('/signin');
        }
      });
    }, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router, searchParams]);

  if (errorMsg) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center text-slate-100">
        <div className="max-w-md rounded-[2rem] border border-red-500/20 bg-slate-900/80 p-8 shadow-glow shadow-red-500/5 backdrop-blur-xl">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-red-500/10 text-red-400 font-bold text-lg">
            !
          </div>
          <h1 className="mt-4 text-xl font-semibold text-white">Authentication Failed</h1>
          <p className="mt-2 text-sm text-slate-400">
            Supabase returned an error during the Microsoft login handshake:
          </p>
          <div className="mt-4 rounded-xl bg-slate-950 p-4 text-left border border-white/5 font-mono text-xs text-red-300 break-words">
            {errorMsg}
          </div>
          <button
            onClick={() => router.push('/signin')}
            className="mt-6 w-full rounded-2xl bg-slate-800 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent"></div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Authenticating secure credentials...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent"></div>
      </div>
    }>
      <AuthCallbackHandler />
    </Suspense>
  );
}
