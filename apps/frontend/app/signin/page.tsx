'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaGoogle, FaMicrosoft } from 'react-icons/fa';
import { supabase } from '../../lib/supabaseClient';

export default function SignInPage() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('error') === 'disabled') {
        setErrorMsg('Your account has been disabled. Please contact the administrator.');
      }
    }
  }, []);

  const handleOAuthSignIn = async (provider: 'google' | 'azure') => {
    setErrorMsg(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    if (error) {
      console.error('Error signing in with OAuth', error);
      setErrorMsg(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-[#2C3454] relative">
      <div className="absolute inset-0 bg-futuristic-grid opacity-[0.25]"></div>
      <main className="relative mx-auto flex min-h-screen max-w-xl items-center px-4 py-16 sm:px-6">
        <div className="w-full rounded-[2.5rem] border border-white bg-white/75 p-10 shadow-clay backdrop-blur-md">
          <div className="mb-8 flex flex-col gap-2">
            <p className="text-xs uppercase font-bold tracking-[0.25em] text-[#00917C]">Sign in</p>
            <h1 className="text-4xl font-extrabold text-[#150E56] tracking-tight">Secure access</h1>
            <p className="text-sm text-[#5C6485] leading-relaxed">Use your account to log in and manage your dashboard, mock sessions, and role permissions.</p>
          </div>

          {errorMsg && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-600">
              {errorMsg}
            </div>
          )}

          <div className="space-y-3">
            <p className="text-xs text-[#5C6485] font-bold">Continue with</p>
            <div className="grid grid-cols-2 gap-3">
              <button 
                type="button" 
                onClick={() => handleOAuthSignIn('google')} 
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#150E56]/10 bg-white px-4 py-3 text-sm text-[#150E56] font-semibold hover:bg-[#150E56]/5 hover:shadow-clayBtn transition duration-200 disabled:opacity-50"
              >
                <FaGoogle className="h-4 w-4 text-[#00917C]" /> Google
              </button>
              <button 
                type="button" 
                onClick={() => handleOAuthSignIn('azure')} 
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#150E56]/10 bg-white px-4 py-3 text-sm text-[#150E56] font-semibold hover:bg-[#150E56]/5 hover:shadow-clayBtn transition duration-200 disabled:opacity-50"
              >
                <FaMicrosoft className="h-4 w-4 text-blue-600" /> Microsoft
              </button>
            </div>
          </div>

          <div className="mt-8 text-center text-sm text-[#5C6485] font-semibold">
            Don’t have an account? <a href="/signup" className="text-[#00917C] font-bold hover:underline">Create one</a>
          </div>
        </div>
      </main>
    </div>
  );
}
