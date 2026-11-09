"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Home, ShieldCheck, Grid, UserCheck, FileText, LogOut, X, Brain, Sparkles, User, Compass, HelpCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';

interface SidebarItem {
  label: string;
  icon: typeof Home;
  href: string;
  permissionName: string;
  active?: boolean;
}

const DEFAULT_MAPPING: Record<string, string[]> = {
  'admin': ['view_dashboard', 'view_pathway_discovery', 'view_ai_interview', 'view_neuro_ai', 'view_profile', 'view_intelligence', 'view_analytics', 'view_users', 'view_permissions'],
  'founder': ['view_dashboard', 'view_pathway_discovery', 'view_ai_interview', 'view_neuro_ai', 'view_profile', 'view_intelligence', 'view_analytics', 'view_users', 'view_permissions'],
  'program manager': ['view_dashboard', 'view_pathway_discovery', 'view_ai_interview', 'view_neuro_ai', 'view_profile', 'view_intelligence', 'view_analytics', 'view_users'],
  'trainer': ['view_dashboard', 'view_ai_interview', 'view_profile', 'view_intelligence'],
  'viewer': ['view_dashboard', 'view_profile'],
  'intern': ['view_dashboard', 'view_pathway_discovery', 'view_ai_interview', 'view_neuro_ai', 'view_profile'],
  'student': ['view_dashboard', 'view_pathway_discovery', 'view_ai_interview', 'view_neuro_ai', 'view_profile'],
  'caregiver': ['view_dashboard', 'view_profile'],
  'owner': ['view_dashboard', 'view_pathway_discovery', 'view_ai_interview', 'view_neuro_ai', 'view_profile', 'view_intelligence', 'view_analytics', 'view_users', 'view_permissions'],
  'maintainer': ['view_dashboard', 'view_pathway_discovery', 'view_ai_interview', 'view_neuro_ai', 'view_profile', 'view_intelligence', 'view_analytics', 'view_users'],
  'supervisor': ['view_dashboard', 'view_ai_interview', 'view_profile', 'view_intelligence'],
  'new lead': ['view_dashboard'],
  'newlead': ['view_dashboard']
};

const items: SidebarItem[] = [
  { label: 'Dashboard', icon: Home, href: '/', permissionName: 'view_dashboard' },
  { label: 'Pathway Discovery', icon: Compass, href: '/pathway-selection', permissionName: 'view_pathway_discovery' },
  { label: 'Interview AI', icon: Grid, href: '/interview', permissionName: 'view_ai_interview' },
  { label: 'Neuro AI Prep', icon: Sparkles, href: '/neuroai', permissionName: 'view_neuro_ai' },
  { label: 'Intern Profile', icon: User, href: '/intern-profile', permissionName: 'view_profile' },
  { label: 'FAQ', icon: HelpCircle, href: '/faq', permissionName: 'public' },
  { label: 'Interview Intelligence', icon: Brain, href: '/services/intelligence', permissionName: 'view_intelligence' },
  { label: 'Analytics', icon: FileText, href: '/services/analytics', permissionName: 'view_analytics' },
  { label: 'Permissions', icon: ShieldCheck, href: '/services/permissions', permissionName: 'view_permissions' },
  { label: 'Users', icon: UserCheck, href: '/services/users', permissionName: 'view_users' },
];

interface SidebarProps {
  collapsed: boolean;
  onClose?: () => void;
}

export default function Sidebar({ collapsed, onClose }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [roleName, setRoleName] = useState<string>('New Lead');
  const [userPermissions, setUserPermissions] = useState<string[]>(['view_dashboard']);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const fetchUserRoleAndPermissions = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        
        // 1. Fetch user role
        const { data: userRoleData, error: roleError } = await supabase
          .from('user_roles')
          .select('role_id, roles(name)')
          .eq('user_id', session.user.id)
          .single();

        if (roleError || !userRoleData) {
          console.warn('No role mapping found for user');
          setUserPermissions(DEFAULT_MAPPING['new lead']);
          return;
        }

        const name = (userRoleData as any)?.roles?.name || 'New Lead';
        const roleId = userRoleData.role_id;
        setRoleName(name);

        // 2. Fetch permissions associated with this role ID
        try {
          const { data: permData, error: permError } = await supabase
            .from('role_permissions')
            .select('permissions(name)')
            .eq('role_id', roleId);

          if (permError) throw permError;

          const fetchedPermissions = permData
            ?.map((p: any) => p.permissions?.name)
            .filter(Boolean) || [];

          if (fetchedPermissions.length > 0) {
            setUserPermissions(fetchedPermissions);
          } else {
            // Fallback to static mapping
            const key = name.toLowerCase();
            setUserPermissions(DEFAULT_MAPPING[key] || DEFAULT_MAPPING['new lead']);
          }
        } catch (dbErr) {
          console.warn('Could not query role_permissions table. Using static mapping fallback.', dbErr);
          const key = name.toLowerCase();
          setUserPermissions(DEFAULT_MAPPING[key] || DEFAULT_MAPPING['new lead']);
        }
      } catch (err) {
        console.warn('Error fetching role and permissions in Sidebar:', err);
      }
    };
    fetchUserRoleAndPermissions();
  }, []);

  const handleSignOut = async (e: React.MouseEvent) => {
    e.preventDefault();
    await supabase.auth.signOut();
    router.push('/signin');
  };

  const filteredItems = items.filter((item) => {
    return item.permissionName === 'public' || userPermissions.includes(item.permissionName);
  });

  const sidebarWidth = isMobile ? (collapsed ? 0 : 280) : (collapsed ? 88 : 280);
  const sidebarX = isMobile && collapsed ? -280 : 0;

  return (
    <motion.aside
      initial={false}
      animate={{ 
        width: sidebarWidth,
        x: sidebarX
      }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className={`fixed md:sticky top-0 left-0 z-30 flex h-screen min-h-[100dvh] flex-col border-r border-[#150E56]/5 bg-white/75 text-[#2C3454] backdrop-blur-lg shadow-clay overflow-y-auto ${isMobile && collapsed ? 'p-0 border-r-0' : 'p-4'}`}
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <div className={`mb-10 flex items-center ${collapsed ? 'justify-center' : 'justify-between px-2'}`}>
        <div className="flex items-center gap-3">
          <div className="relative h-14 w-14 overflow-hidden rounded-2xl bg-white border border-[#150E56]/10 shadow-clayBtn flex items-center justify-center flex-shrink-0">
            <img 
              src="/JoBro-colorful.png" 
              alt="JoBro Logo" 
              className="h-full w-full object-contain p-1"
            />
          </div>
          {!collapsed && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#5C6485]">Jobro</p>
              <p className="text-sm font-black text-[#150E56]">Platform UI</p>
            </div>
          )}
        </div>
        {isMobile && !collapsed && onClose && (
          <button 
            onClick={onClose}
            className="h-10 w-10 inline-flex items-center justify-center rounded-xl border border-[#150E56]/10 bg-white/50 text-[#150E56] hover:bg-white hover:shadow-clayBtn"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="space-y-1.5">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`group flex items-center ${collapsed ? 'justify-center p-3' : 'gap-4 px-4 py-3'} rounded-[1.75rem] text-xs font-bold transition-all duration-200 border border-transparent ${
                isActive 
                  ? 'bg-[#150E56] text-white shadow-md shadow-[#150E56]/15 hover:bg-[#150E56]/95' 
                  : 'text-[#5C6485] hover:bg-white hover:shadow-clayBtn hover:border-[#150E56]/5 hover:text-[#150E56]'
              }`}
            >
              <Icon className={`h-4.5 w-4.5 transition-colors duration-200 ${isActive ? 'text-white' : 'text-[#00917C]'}`} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="mt-auto rounded-[2rem] border border-[#150E56]/5 bg-white/60 p-4 text-[#5C6485] shadow-clay">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#5C6485]/80">Role</p>
          <p className="mt-1 text-xs font-black text-[#150E56]">{roleName}</p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-[#5C6485]/70">
            {roleName === 'Admin'
              ? 'Access: analytics, interviews, users, permissions'
              : 'Access: mock interviews, performance hub'}
          </p>
        </div>
      )}

      <button
        onClick={handleSignOut}
        className={`${collapsed ? 'mt-auto' : 'mt-5'} flex w-full items-center justify-center gap-3 rounded-[1.75rem] border border-[#150E56]/5 bg-white/80 p-3 text-[#150E56] font-bold text-xs shadow-clayBtn hover:shadow-clayBtnHover transition-all duration-200 hover:-translate-y-0.5`}
      >
        <LogOut className="h-4 w-4 text-[#00917C]" />
        {!collapsed && <span className="text-xs">Sign out</span>}
      </button>
    </motion.aside>
  );
}
