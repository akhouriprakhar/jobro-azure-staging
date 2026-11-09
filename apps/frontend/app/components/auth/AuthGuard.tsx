'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';

import LoadingScreen from '../LoadingScreen';

const publicRoutes = ['/signin', '/signup', '/auth/callback'];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const isPublicRoute = publicRoutes.includes(pathname);

    // Timeout safety net (3.5s max): Ensure user is never stuck on loading screen indefinitely
    const timeoutId = setTimeout(() => {
      if (isMountedRef.current) {
        console.warn('[AuthGuard] Auth check timed out. Unblocking UI.');
        setLoading(false);
      }
    }, 3500);

    const verifyAuth = async (session: any) => {
      try {
        if (!session) {
          if (!isPublicRoute) {
            router.push('/signin');
          }
          return;
        }

        // Enforce account disabled check safely
        try {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', session.user.id)
            .maybeSingle();

          if (!profileError && profile && (profile.full_name || '').startsWith('[DISABLED]')) {
            await supabase.auth.signOut();
            router.push('/signin?error=disabled');
            return;
          }
        } catch (profileErr) {
          console.warn('[AuthGuard] Profile check error:', profileErr);
        }

        if (isPublicRoute) {
          router.push('/');
        }
      } catch (err) {
        console.error('[AuthGuard] Error verifying auth state:', err);
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
          clearTimeout(timeoutId);
        }
      }
    };

    const checkUser = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.warn('[AuthGuard] getSession error:', error.message);
          // Clean up corrupted auth storage if error occurs
          await supabase.auth.signOut().catch(() => {});
          if (!isPublicRoute) {
            router.push('/signin');
          }
          if (isMountedRef.current) setLoading(false);
          return;
        }

        await verifyAuth(session);
      } catch (err) {
        console.error('[AuthGuard] Failed to fetch session:', err);
        if (!isPublicRoute) {
          router.push('/signin');
        }
        if (isMountedRef.current) setLoading(false);
      }
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMountedRef.current) return;
      if (event === 'INITIAL_SESSION') return; // Handled by checkUser
      await verifyAuth(session);
    });

    return () => {
      isMountedRef.current = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  const isPublicRoute = publicRoutes.includes(pathname);
  if (loading && !isPublicRoute) {
    return <LoadingScreen message="Securing gateway access..." />;
  }

  return <>{children}</>;
}
