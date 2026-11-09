'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  Loader2,
  Sparkles,
  Terminal,
  Copy,
  Check,
  Database,
  Info,
  RefreshCw,
  Lock,
  Unlock,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import Sidebar from '../../components/dashboard/Sidebar';
import Navbar from '../../components/dashboard/Navbar';
import LoadingScreen from '../../components/LoadingScreen';

interface Role {
  id: string;
  name: string;
}

interface Privilege {
  id: string;
  name: string;
  description: string;
}

// Default static lists for fallbacks & local cache seeding
const DEFAULT_ROLES: Role[] = [
  { id: '1', name: 'Admin' },
  { id: '2', name: 'Founder' },
  { id: '3', name: 'Program Manager' },
  { id: '4', name: 'Trainer' },
  { id: '5', name: 'Viewer' },
  { id: '6', name: 'Intern' },
  { id: '7', name: 'New Lead' },
];

const DEFAULT_PRIVILEGES: Privilege[] = [
  { id: '1', name: 'view_dashboard', description: 'Access to main candidate performance metrics & overview.' },
  { id: '2', name: 'view_pathway_discovery', description: 'Access to the pathway selecting questionnaire.' },
  { id: '3', name: 'view_ai_interview', description: 'Access to AI-led mock assessment sessions.' },
  { id: '4', name: 'view_neuro_ai', description: 'Access to neuro-inclusive interview prep workspace.' },
  { id: '5', name: 'view_profile', description: 'Access to candidate resume & profiling dashboard.' },
  { id: '6', name: 'view_intelligence', description: 'Access to advanced conversational intelligence insights.' },
  { id: '7', name: 'view_analytics', description: 'Access to token cost tracking and operations stats.' },
  { id: '8', name: 'view_users', description: 'Access to register users and change role privileges.' },
  { id: '9', name: 'view_permissions', description: 'Access to configure role-privilege assignments.' },
];

// Initial sensible mapping: [roleName]: set of permissionNames
const DEFAULT_MAPPING: Record<string, string[]> = {
  'Admin': ['view_dashboard', 'view_pathway_discovery', 'view_ai_interview', 'view_neuro_ai', 'view_profile', 'view_intelligence', 'view_analytics', 'view_users', 'view_permissions'],
  'Founder': ['view_dashboard', 'view_pathway_discovery', 'view_ai_interview', 'view_neuro_ai', 'view_profile', 'view_intelligence', 'view_analytics', 'view_users', 'view_permissions'],
  'Program Manager': ['view_dashboard', 'view_pathway_discovery', 'view_ai_interview', 'view_neuro_ai', 'view_profile', 'view_intelligence', 'view_analytics', 'view_users'],
  'Trainer': ['view_dashboard', 'view_ai_interview', 'view_profile', 'view_intelligence'],
  'Viewer': ['view_dashboard', 'view_profile'],
  'Intern': ['view_dashboard', 'view_pathway_discovery', 'view_ai_interview', 'view_neuro_ai', 'view_profile'],
  'New Lead': ['view_dashboard'],
  'newlead': ['view_dashboard'],
};

export default function PermissionsManagementPage() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  // Roles and Permissions states
  const [roles, setRoles] = useState<Role[]>([]);
  const [privileges, setPrivileges] = useState<Privilege[]>([]);

  // Mapping state: key is `roleId_privilegeId` string for fast boolean lookups
  const [privilegeMatrix, setPrivilegeMatrix] = useState<Record<string, boolean>>({});

  // App states
  const [dbMode, setDbMode] = useState<'database' | 'local'>('database');
  const [updatingCell, setUpdatingCell] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showSqlBlock, setShowSqlBlock] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const sqlMigrationText = `-- 1. Create permissions table
create table if not exists public.permissions (
  id bigint generated always as identity primary key,
  name text unique not null,
  description text
);

-- 2. Create role_permissions junction table
create table if not exists public.role_permissions (
  role_id bigint references public.roles(id) on delete cascade,
  permission_id bigint references public.permissions(id) on delete cascade,
  primary key(role_id, permission_id)
);

-- 3. Seed default privileges
insert into public.permissions (name, description) values
  ('view_dashboard', 'Access to main candidate performance metrics & overview.'),
  ('view_pathway_discovery', 'Access to the pathway selecting questionnaire.'),
  ('view_ai_interview', 'Access to AI-led mock assessment sessions.'),
  ('view_neuro_ai', 'Access to neuro-inclusive interview prep workspace.'),
  ('view_profile', 'Access to candidate resume & profiling dashboard.'),
  ('view_intelligence', 'Access to advanced conversational intelligence insights.'),
  ('view_analytics', 'Access to token cost tracking and operations stats.'),
  ('view_users', 'Access to register users and change role privileges.'),
  ('view_permissions', 'Access to configure role-privilege assignments.')
on conflict (name) do nothing;

-- 4. Disable RLS for configuration tables (required for saving privilege edits)
alter table public.permissions disable row level security;
alter table public.role_permissions disable row level security;

-- 5. Seed default "New Lead" role (required to register new accounts by default)
insert into public.roles (name) select 'New Lead' where not exists (select 1 from public.roles where name = 'New Lead');`;

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarCollapsed(true);
    }
  }, []);

  const showToast = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(sqlMigrationText);
    setCopiedSql(true);
    showToast('SQL schema copied to clipboard', 'success');
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Get current user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/signin');
        return;
      }

      // 2. Fetch current user's role to check authority
      const { data: userRoles, error: roleError } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', session.user.id)
        .single();

      const userRole = (userRoles as any)?.roles?.name;

      // Access allowed only for Admin, Founder, or Program Manager
      if (roleError || !['Admin', 'Founder', 'Program Manager'].includes(userRole || '')) {
        setAuthorized(false);
        setLoading(false);
        return;
      }

      setAuthorized(true);

      // 3. Attempt DB Load of Roles
      let dbRoles: Role[] = [];
      try {
        const { data: rolesData, error: fetchRolesErr } = await supabase
          .from('roles')
          .select('id, name')
          .order('id');
        if (fetchRolesErr) throw fetchRolesErr;
        dbRoles = rolesData || [];

        // Auto-seed "New Lead" if it doesn't exist in the database roles table
        const hasNewLead = dbRoles.some(
          (r) => r.name.toLowerCase() === 'new lead' || r.name.toLowerCase() === 'newlead'
        );
        if (!hasNewLead) {
          try {
            const { data: newRole, error: insertRoleErr } = await supabase
              .from('roles')
              .insert({ name: 'New Lead' })
              .select('id, name')
              .single();
            if (!insertRoleErr && newRole) {
              dbRoles.push(newRole);
            }
          } catch (insertErr) {
            console.warn('Failed to auto-create "New Lead" role in DB:', insertErr);
          }
        }
      } catch (err) {
        console.warn('Could not query roles table, falling back to static roles.', err);
      }

      const activeRoles = dbRoles.length > 0 ? dbRoles : DEFAULT_ROLES;
      setRoles(activeRoles);

      // 4. Attempt DB Load of Permissions
      let dbPrivs: Privilege[] = [];
      let dbModeActive: 'database' | 'local' = 'database';
      try {
        const { data: privsData, error: fetchPrivsErr } = await supabase
          .from('permissions')
          .select('id, name, description')
          .order('id');

        if (fetchPrivsErr) {
          // If error is code PGRST205, table does not exist
          if (fetchPrivsErr.code === 'PGRST205') {
            dbModeActive = 'local';
          }
          throw fetchPrivsErr;
        }
        dbPrivs = privsData || [];
      } catch (err) {
        console.warn('Could not query permissions table. Defaulting to local model.', err);
        dbModeActive = 'local';
      }

      const activePrivs = dbPrivs.length > 0 ? dbPrivs : DEFAULT_PRIVILEGES;
      setPrivileges(activePrivs);
      setDbMode(dbModeActive);

      // 5. Load mappings based on mode
      const matrix: Record<string, boolean> = {};

      if (dbModeActive === 'database') {
        try {
          const { data: mappingsData, error: fetchMapErr } = await supabase
            .from('role_permissions')
            .select('role_id, permission_id');

          if (fetchMapErr) throw fetchMapErr;

          // Populate matrix from DB records
          mappingsData?.forEach((m) => {
            matrix[`${m.role_id}_${m.permission_id}`] = true;
          });
          setPrivilegeMatrix(matrix);
        } catch (err) {
          console.error('Error loading role_permissions table:', err);
          setDbMode('local');
          loadLocalMatrix(activeRoles, activePrivs);
        }
      } else {
        loadLocalMatrix(activeRoles, activePrivs);
      }

    } catch (err) {
      console.error('Error fetching security context:', err);
      showToast('Error syncing security rules', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadLocalMatrix = (activeRoles: Role[], activePrivs: Privilege[]) => {
    // Attempt local storage parse
    const cached = localStorage.getItem('jobro_privilege_matrix');
    if (cached) {
      try {
        setPrivilegeMatrix(JSON.parse(cached));
        return;
      } catch (e) {
        console.warn('Failed parsing cached privilege matrix. Resetting.');
      }
    }

    // Seed sensible defaults
    const matrix: Record<string, boolean> = {};
    activeRoles.forEach((role) => {
      const allowedNames = DEFAULT_MAPPING[role.name] || [];
      activePrivs.forEach((priv) => {
        if (allowedNames.includes(priv.name)) {
          matrix[`${role.id}_${priv.id}`] = true;
        }
      });
    });
    setPrivilegeMatrix(matrix);
    localStorage.setItem('jobro_privilege_matrix', JSON.stringify(matrix));
  };

  useEffect(() => {
    loadData();
  }, [router]);

  const handleTogglePrivilege = async (roleId: string, roleName: string, privId: string, privName: string) => {
    const cellKey = `${roleId}_${privId}`;
    const isGranted = !!privilegeMatrix[cellKey];
    setUpdatingCell(cellKey);

    try {
      if (dbMode === 'database') {
        if (isGranted) {
          // Revoke permission
          const { error } = await supabase
            .from('role_permissions')
            .delete()
            .eq('role_id', roleId)
            .eq('permission_id', privId);

          if (error) throw error;
        } else {
          // Grant permission
          const { error } = await supabase
            .from('role_permissions')
            .insert({ role_id: roleId, permission_id: privId });

          if (error) throw error;
        }

        // Update Matrix state
        setPrivilegeMatrix((prev) => ({
          ...prev,
          [cellKey]: !isGranted,
        }));
      } else {
        // Local Mode
        const newMatrix = {
          ...privilegeMatrix,
          [cellKey]: !isGranted,
        };
        setPrivilegeMatrix(newMatrix);
        localStorage.setItem('jobro_privilege_matrix', JSON.stringify(newMatrix));
      }

      showToast(
        `${isGranted ? 'Revoked' : 'Granted'} '${privName}' privilege for '${roleName}' role`,
        'success'
      );
    } catch (err: any) {
      console.error('Error toggling privilege:', err);
      showToast(err.message || 'Failed to update privilege link', 'error');
    } finally {
      setUpdatingCell(null);
    }
  };

  const handleResetToDefaults = () => {
    if (confirm('Are you sure you want to reset all mappings to standard settings?')) {
      const matrix: Record<string, boolean> = {};
      roles.forEach((role) => {
        const allowedNames = DEFAULT_MAPPING[role.name] || [];
        privileges.forEach((priv) => {
          if (allowedNames.includes(priv.name)) {
            matrix[`${role.id}_${priv.id}`] = true;
          }
        });
      });

      setPrivilegeMatrix(matrix);
      if (dbMode === 'local') {
        localStorage.setItem('jobro_privilege_matrix', JSON.stringify(matrix));
      } else {
        showToast('Reset local state. Toggle checkboxes to push to database.', 'success');
      }
      showToast('Privilege mappings reset to defaults.', 'success');
    }
  };

  if (loading) {
    return <LoadingScreen message="Loading privilege maps..." />;
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-transparent px-4 text-center text-[#2C3454]">
        <div className="absolute inset-0 bg-futuristic-grid opacity-[0.25]"></div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative max-w-md rounded-[2.5rem] border border-white bg-white/80 p-10 shadow-clay backdrop-blur-xl"
        >
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-100 text-red-600">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-2xl font-black tracking-tight text-[#150E56]">Privilege Configuration Denied</h1>
          <p className="mt-3 text-[#5C6485]">
            You do not possess the required administrator access level to configure role authorization policies.
          </p>
          <button
            onClick={() => router.push('/')}
            className="mt-8 inline-flex items-center gap-2 rounded-3xl bg-white px-6 py-3 text-sm font-bold text-[#5C6485] border border-[#150E56]/10 shadow-clayBtn transition hover:bg-[#150E56]/5 hover:text-[#150E56]"
          >
            <ArrowLeft className="h-4 w-4 text-[#00917C]" /> Back to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen max-h-screen bg-transparent text-[#2C3454] overflow-hidden">
      <div className="absolute inset-0 bg-futuristic-grid opacity-[0.25]"></div>

      {/* Sleek Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className={`fixed top-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-5 py-3.5 shadow-clay backdrop-blur-xl ${notification.type === 'success'
                ? 'border-emerald-200 bg-white/95 text-emerald-700'
                : 'border-red-200 bg-white/95 text-red-700'
              }`}
          >
            <Sparkles className="h-4 w-4 text-[#00917C]" />
            <span className="text-sm font-bold">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative w-full flex h-screen max-h-screen overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} onClose={() => setSidebarCollapsed(true)} />

        <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
          <Navbar onToggle={() => setSidebarCollapsed((prev) => !prev)} />

          <motion.main
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="flex-1 overflow-y-auto px-4 py-6 md:px-6 space-y-6"
          >
            {/* Header Section */}
            <section className="space-y-4 md:flex md:items-end md:justify-between md:space-y-0">
              <div className="space-y-3">
                <button
                  onClick={() => router.push('/')}
                  className="inline-flex items-center gap-2 rounded-full border border-[#150E56]/10 bg-white/60 px-4 py-2 text-xs font-bold text-[#5C6485] hover:text-[#150E56] hover:border-[#00917C]/40 transition cursor-pointer"
                >
                  <ArrowLeft className="h-3 w-3 text-[#00917C]" /> Back to Dashboard
                </button>
                <p className="text-xs uppercase font-bold tracking-[0.25em] text-[#00917C]">Access Control Policies</p>
                <p className="mt-2 max-w-2xl text-sm text-[#5C6485] leading-relaxed">
                  Select and configure target permissions mapped to individual role profiles. Policies deploy dynamically across frontend and backend modules.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={loadData}
                  className="p-2.5 rounded-xl border border-[#150E56]/10 bg-white hover:bg-white/90 text-[#5C6485] hover:text-[#150E56] hover:shadow-clayBtn transition"
                  title="Reload Matrix Data"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  onClick={handleResetToDefaults}
                  className="rounded-xl border border-[#00917C]/15 bg-[#00917C]/10 px-4 py-2.5 text-xs font-bold text-[#00917C] hover:bg-[#00917C]/20 transition"
                >
                  Reset Defaults
                </button>
              </div>
            </section>

            {/* Mode Banner Warning */}
            {dbMode === 'local' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-amber-250 bg-amber-50/50 p-5 shadow-clay backdrop-blur-md"
              >
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="text-base font-bold text-amber-800">Supabase DB Tables Missing</h3>
                    <p className="text-sm text-[#5C6485] max-w-4xl font-medium">
                      The tables <code>permissions</code> and <code>role_permissions</code> were not found in the database.
                      Privilege selections are active and running in **Local Cache Mode (localStorage)**. Apply the database migration script below to persist changes.
                    </p>
                    <button
                      onClick={() => setShowSqlBlock(!showSqlBlock)}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:underline"
                    >
                      <Terminal className="h-3 w-3" /> {showSqlBlock ? 'Hide' : 'Show'} Database Migration Script
                    </button>

                    {showSqlBlock && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-3 overflow-hidden rounded-xl border border-[#150E56]/10 bg-white shadow-clay"
                      >
                        <div className="flex items-center justify-between border-b border-[#150E56]/5 bg-[#FFF6F0]/40 px-4 py-2">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-[#5C6485]">PostgreSQL Migration</span>
                          <button
                            onClick={copySqlToClipboard}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#5C6485] hover:text-[#150E56]"
                          >
                            {copiedSql ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedSql ? 'Copied!' : 'Copy SQL'}
                          </button>
                        </div>
                        <pre className="p-4 text-xs font-mono text-[#00917C] overflow-x-auto max-h-60 leading-relaxed bg-[#FFF6F0]/20">
                          {sqlMigrationText}
                        </pre>
                      </motion.div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Matrix Board */}
            <section className="rounded-[2.25rem] border border-white bg-white/75 p-6 shadow-clay backdrop-blur-md overflow-hidden">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-extrabold text-[#150E56]">Access Privilege Mapping</h2>
                  <p className="text-sm text-[#5C6485] mt-1">Configure individual checkboxes to grant or revoke specific privileges.</p>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-[#150E56]/5 bg-[#FFF6F0]/65 px-3.5 py-2 text-xs font-semibold text-[#5C6485]">
                  <Database className={`h-4 w-4 ${dbMode === 'database' ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <span>Mode: </span>
                  <span className={`font-bold ${dbMode === 'database' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {dbMode === 'database' ? 'Live Supabase Sync' : 'LocalStorage Cache'}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-[#150E56]/5 bg-[#FFF6F0]/20 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="border-b border-[#150E56]/5 bg-[#FFF6F0]/40 text-xs uppercase tracking-wider text-[#5C6485] font-bold">
                      <th className="p-4 font-bold w-[300px]">Access Privilege Policy</th>
                      {roles.map((role) => (
                        <th key={role.id} className="p-4 font-bold text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[#150E56] text-xs">{role.name}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#150E56]/5">
                    {privileges.map((priv) => (
                      <tr key={priv.id} className="text-sm hover:bg-white/40 transition">
                        <td className="p-4">
                          <div className="space-y-1">
                            <span className="font-bold text-[#00917C] font-mono text-xs">{priv.name}</span>
                            <p className="text-xs text-[#5C6485] leading-normal font-semibold">{priv.description}</p>
                          </div>
                        </td>
                        {roles.map((role) => {
                          const cellKey = `${role.id}_${priv.id}`;
                          const isChecked = !!privilegeMatrix[cellKey];
                          const isUpdating = updatingCell === cellKey;

                          return (
                            <td key={role.id} className="p-4 text-center">
                              <div className="flex justify-center items-center h-full">
                                <button
                                  disabled={isUpdating}
                                  onClick={() => handleTogglePrivilege(role.id, role.name, priv.id, priv.name)}
                                  className={`relative grid h-10 w-10 place-items-center rounded-xl border transition-all duration-200 cursor-pointer outline-none ${isChecked
                                      ? 'bg-[#00917C]/10 border-[#00917C]/20 text-[#00917C] shadow-clay'
                                      : 'border-[#150E56]/10 hover:border-[#150E56]/20 text-slate-400 hover:text-[#150E56] bg-white'
                                    } disabled:opacity-50`}
                                >
                                  {isUpdating ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-[#00917C]" />
                                  ) : isChecked ? (
                                    <Unlock className="h-4 w-4 text-[#00917C]" />
                                  ) : (
                                    <Lock className="h-4 w-4 text-slate-400" />
                                  )}
                                </button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </motion.main>
        </div>
      </div>
    </div>
  );
}
