'use client';

import { useEffect, useState } from 'react';
import { Bell, Search, Menu } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';

interface NavbarProps {
  onToggle: () => void;
}

export default function Navbar({ onToggle }: NavbarProps) {
  const [userName, setUserName] = useState<string>('Rahul');
  const [roleName, setRoleName] = useState<string>('Admin');

  useEffect(() => {
    const fetchUserProps = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const name = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Rahul';
        setUserName(name);

        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('roles(name)')
          .eq('user_id', session.user.id)
          .single();

        if (userRoles) {
          const role = (userRoles as any)?.roles?.name || 'New Lead';
          setRoleName(role);
        }
      } catch (err) {
        console.warn('Error fetching user props in Navbar:', err);
      }
    };
    fetchUserProps();
  }, []);

  return (
    <header className="sticky top-0 z-10 border-b border-[#150E56]/5 bg-white/30 backdrop-blur-lg px-4 py-4 shadow-glow md:px-6">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#150E56]/10 bg-white text-[#150E56] shadow-clayBtn hover:shadow-clayBtnHover transition duration-200 active:scale-95"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
 
        <div className="hidden flex-1 items-center gap-3 rounded-[1.75rem] border border-[#150E56]/5 bg-[#FFF6F0]/65 px-4 py-3 text-[#5C6485] shadow-[inset_3px_3px_6px_rgba(180,160,150,0.1),_inset_-3px_-3px_6px_rgba(255,255,255,0.85)] md:flex focus-within:border-[#00917C]/30 transition-all duration-200">
          <Search className="h-4 w-4 text-[#00917C]" />
          <input
            type="search"
            placeholder="Search services, reports, users"
            className="w-full bg-transparent text-sm text-[#150E56] font-semibold outline-none placeholder:text-[#5C6485]/60"
          />
        </div>
 
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#150E56]/10 bg-white text-[#150E56] shadow-clayBtn hover:shadow-clayBtnHover transition duration-200 active:scale-95"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
          </button>
 
          <div className="hidden items-center gap-3 rounded-[1.75rem] border border-[#150E56]/5 bg-white/70 px-4 py-2.5 text-[#2C3454] shadow-clay md:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#00917C]/15 text-[#00917C] border border-[#00917C]/10 font-bold uppercase">
              {userName.substring(0, 2)}
            </div>
            <div>
              <p className="text-sm font-black text-[#150E56]">{userName}</p>
              <p className="text-[10px] font-bold text-[#5C6485] uppercase tracking-wider">{roleName}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 h-[2.5px] w-full cyan-gradient-breath" />
    </header>
  );
}
