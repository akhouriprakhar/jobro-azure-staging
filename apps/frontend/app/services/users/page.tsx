'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { UserCheck, ShieldAlert, ArrowLeft, Loader2, Sparkles, Plus, Trash2, X, Edit2, Check } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { createClient } from '@supabase/supabase-js';
import Sidebar from '../../components/dashboard/Sidebar';
import Navbar from '../../components/dashboard/Navbar';
import LoadingScreen from '../../components/LoadingScreen';

interface Profile {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  role: string;
  disabled?: boolean;
}

interface Role {
  id: string;
  name: string;
}

const getApiUrl = (path: string) => {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `http://localhost:8000${path}`;
    }
  }
  return `https://jobro-2-0.onrender.com${path}`;
};

const cleanDisplayName = (name: string) => {
  return (name || '').replace('[DISABLED]', '').replace('[DELETED]', '').trim();
};

export default function UsersManagementPage() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarCollapsed(true);
    }
  }, []);
  const [authorized, setAuthorized] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ fullName: '', email: '', role: 'New Lead' });
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [userToDelete, setUserToDelete] = useState<Profile | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [editingNameUserId, setEditingNameUserId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [savingNameUserId, setSavingNameUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsersDirectFromSupabase = async () => {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name, created_at');

      if (profilesError) throw profilesError;

      const { data: userRolesData, error: userRolesError } = await supabase
        .from('user_roles')
        .select('user_id, roles(name)');

      if (userRolesError) throw userRolesError;

      return (profilesData || [])
        .filter((prof) => !(prof.full_name || '').startsWith('[DELETED]'))
        .map((prof) => {
          const matchingRole = userRolesData?.find((ur) => ur.user_id === prof.id);
          return {
            ...prof,
            role: (matchingRole as any)?.roles?.name || 'New Lead',
            disabled: (prof.full_name || '').startsWith('[DISABLED]'),
          };
        });
    };

    const checkAuthAndFetchData = async () => {
      // 1. Get current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/signin');
        return;
      }

      // 2. Fetch current user's role to verify Admin status
      console.log('Current User ID:', session.user.id);

      const { data: userRoles, error: roleError } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', session.user.id)
        .single();

      console.log('Query result:', userRoles);
      console.log('Query error:', roleError);

      const userRole = (userRoles as any)?.roles?.name;
      console.log('Detected Role:', userRole);

      if (roleError || userRole !== 'Admin') {
        console.warn('Access denied. Role is not Admin or query failed.');
        setAuthorized(false);
        setLoading(false);
        return;
      }

      setAuthorized(true);

      try {
        // 3. Fetch all available roles for the dropdown
        const { data: rolesData, error: rolesError } = await supabase
          .from('roles')
          .select('id, name');

        if (rolesError) throw rolesError;

        let dbRoles = rolesData || [];

        // Fall back to adding "New Lead" locally if it doesn't exist in the database roles table
        const hasNewLead = dbRoles.some(
          (r) => r.name.toLowerCase() === 'new lead' || r.name.toLowerCase() === 'newlead'
        );
        if (!hasNewLead) {
          dbRoles.push({ id: 'new-lead-temp', name: 'New Lead' });
        }

        setRoles(dbRoles);

        // 4. Fetch profiles directly from Supabase first (100% reliable, loads list instantly)
        const directUsers = await fetchUsersDirectFromSupabase();
        setProfiles(directUsers);

        // 5. Fetch banned/disabled status from backend in the background and merge in-place
        try {
          const resUsers = await fetch(getApiUrl('/api/v1/auth/users'));
          if (resUsers.ok) {
            const backendUsers = await resUsers.json();
            setProfiles((prev) =>
              prev.map((p) => {
                const match = backendUsers.find((bu: any) => bu.id === p.id);
                return match ? { ...p, disabled: match.disabled } : p;
              })
            );
          }
        } catch (bgErr) {
          console.warn('Failed to load disabled status from backend in background:', bgErr);
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        showToast('Failed to load user management details', 'error');
      } finally {
        setLoading(false);
      }
    };

    checkAuthAndFetchData();
  }, [router]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleRoleChange = async (userId: string, newRoleName: string) => {
    setUpdatingUserId(userId);
    try {
      // Find role ID
      const targetRole = roles.find((r) => r.name === newRoleName);
      if (!targetRole) return;

      // 1. Delete any existing role assignments for this user
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        console.error('Delete Query failed with code:', deleteError.code);
        console.error('Delete Query message:', deleteError.message);
        throw deleteError;
      }

      // 2. Insert the new role assignment
      if (targetRole.id !== 'new-lead-temp') {
        const { error: insertError } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role_id: targetRole.id });

        if (insertError) {
          console.error('Insert Query failed with code:', insertError.code);
          console.error('Insert Query message:', insertError.message);
          throw insertError;
        }
      }

      // Update local state
      setProfiles((prev) =>
        prev.map((p) => (p.id === userId ? { ...p, role: newRoleName } : p))
      );

      showToast(`Successfully assigned role '${newRoleName}'`, 'success');
    } catch (err) {
      console.error('Error updating user role:', err);
      showToast('Failed to update privilege role', 'error');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingUser(true);
    try {
      const response = await fetch(getApiUrl('/api/v1/auth/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUser.email,
          fullName: newUser.fullName,
          role: newUser.role
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to add user');
      }

      const resData = await response.json();
      const addedUser = resData.user;

      setProfiles((prev) => {
        // If the user was restored, replace/update them. Otherwise, append.
        const exists = prev.some((p) => p.id === addedUser.id);
        if (exists) {
          return prev.map((p) => (p.id === addedUser.id ? { ...p, full_name: addedUser.full_name, role: addedUser.role, disabled: false } : p));
        } else {
          return [
            ...prev,
            {
              id: addedUser.id,
              email: addedUser.email,
              full_name: addedUser.full_name,
              created_at: addedUser.created_at || new Date().toISOString(),
              role: addedUser.role,
              disabled: false,
            }
          ];
        }
      });

      setShowAddUserModal(false);
      setNewUser({ fullName: '', email: '', role: 'New Lead' });
      showToast(resData.status === 'restored' ? 'User access restored successfully' : 'User added successfully', 'success');
    } catch (err: any) {
      console.error('Error adding user:', err);
      showToast(err.message || 'Failed to add user', 'error');
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    try {
      const response = await fetch(getApiUrl(`/api/v1/auth/users/${userToDelete.id}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to remove user from database');
      }

      setProfiles((prev) => prev.filter((p) => p.id !== userToDelete.id));
      setUserToDelete(null);
      showToast('User removed successfully', 'success');
    } catch (err: any) {
      console.error('Error removing user:', err);
      showToast(err.message || 'Failed to remove user', 'error');
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handleToggleUserStatus = async (userId: string, currentDisabled: boolean) => {
    setTogglingUserId(userId);
    try {
      const response = await fetch(getApiUrl(`/api/v1/auth/users/${userId}/status`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: !currentDisabled })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to update user status');
      }

      setProfiles((prev) =>
        prev.map((p) => (p.id === userId ? { ...p, disabled: !currentDisabled } : p))
      );
      showToast(`User ${currentDisabled ? 'enabled' : 'disabled'} successfully`, 'success');
    } catch (err: any) {
      console.error('Error toggling user status:', err);
      showToast(err.message || 'Failed to update user status', 'error');
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleSaveName = async (userId: string) => {
    const trimmed = tempName.trim();
    if (!trimmed) {
      showToast('Name cannot be empty', 'error');
      return;
    }
    setSavingNameUserId(userId);
    try {
      const response = await fetch(getApiUrl(`/api/v1/auth/users/${userId}/name`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: trimmed })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to update user name');
      }

      setProfiles((prev) =>
        prev.map((p) => (p.id === userId ? { ...p, full_name: trimmed } : p))
      );
      setEditingNameUserId(null);
      showToast('User name updated successfully', 'success');
    } catch (err: any) {
      console.error('Error updating name:', err);
      showToast(err.message || 'Failed to update name', 'error');
    } finally {
      setSavingNameUserId(null);
    }
  };

  if (loading) {
    return <LoadingScreen message="Verifying secure credentials..." />;
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
          <h1 className="mt-6 text-2xl font-black tracking-tight text-[#150E56]">Access Privilege Restricted</h1>
          <p className="mt-3 text-[#5C6485]">
            You do not possess the required administrator access level to view the User Management portal.
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
            className="flex-1 overflow-y-auto px-4 py-6 md:px-6"
          >
            {/* Header Section */}
            <section className="space-y-4 pb-8 md:flex md:items-end md:justify-between md:space-y-0">
              <div className="space-y-4">
                <button
                  onClick={() => router.push('/')}
                  className="inline-flex items-center gap-2 rounded-full border border-[#150E56]/10 bg-white/60 px-4 py-2 text-xs font-bold text-[#5C6485] hover:text-[#150E56] hover:border-[#00917C]/40 transition cursor-pointer"
                >
                  <ArrowLeft className="h-3 w-3 text-[#00917C]" /> Back to Dashboard
                </button>
                <p className="text-xs uppercase font-bold tracking-[0.25em] text-[#00917C]">User Management</p>
                <p className="mt-3 max-w-2xl text-sm md:text-base text-[#5C6485] leading-relaxed">
                  Assign secure access roles to registered users. Changes will reflect instantly on their next authorization check.
                </p>
              </div>
            </section>

            {/* Users Table / Command Board */}
            <section className="rounded-[2.25rem] border border-white bg-white/75 p-6 shadow-clay backdrop-blur-md">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-extrabold text-[#150E56]">Registered Users</h2>
                  <p className="text-sm text-[#5C6485] mt-1">Manage credentials and specify role levels</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl border border-[#150E56]/5 bg-[#FFF6F0]/65 px-3.5 py-1.5 text-xs text-[#5C6485] font-semibold">
                    Total Accounts: <span className="font-bold text-[#00917C]">{profiles.length}</span>
                  </div>
                  <button
                    onClick={() => setShowAddUserModal(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#00917C]/10 px-4 py-2 text-sm font-bold text-[#00917C] hover:bg-[#00917C]/20 transition border border-[#00917C]/15"
                  >
                    <Plus className="h-4 w-4" /> Add User
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-[#150E56]/5 bg-[#FFF6F0]/20 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.02)]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#150E56]/5 bg-[#FFF6F0]/40 text-xs uppercase tracking-wider text-[#5C6485] font-bold">
                      <th className="p-4 font-bold">User Profile</th>
                      <th className="p-4 font-bold">Email Address</th>
                      <th className="p-4 font-bold">Registered Date</th>
                      <th className="p-4 font-bold text-center">Status</th>
                      <th className="p-4 font-bold text-right">Access Role Privilege</th>
                      <th className="p-4 font-bold text-right w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#150E56]/5">
                    {profiles.map((user) => (
                      <tr key={user.id} className={`text-sm transition ${user.disabled ? 'text-slate-400 bg-slate-50/30' : 'text-[#2C3454] hover:bg-white/40'}`}>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={`grid h-9 w-9 place-items-center rounded-xl text-sm font-bold border ${user.disabled ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-[#00917C]/10 text-[#00917C] border-[#00917C]/15'}`}>
                              {user.full_name ? cleanDisplayName(user.full_name).substring(0, 2).toUpperCase() : 'US'}
                            </div>
                            {editingNameUserId === user.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={tempName}
                                  onChange={(e) => setTempName(e.target.value)}
                                  className="rounded-lg border border-[#150E56]/20 bg-white px-2 py-1 text-xs text-[#150E56] font-semibold outline-none focus:border-[#00917C]/50"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveName(user.id);
                                    if (e.key === 'Escape') setEditingNameUserId(null);
                                  }}
                                />
                                {savingNameUserId === user.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-[#00917C]" />
                                ) : (
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleSaveName(user.id)}
                                      className="p-1 rounded bg-[#00917C]/10 text-[#00917C] hover:bg-[#00917C]/20 transition"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setEditingNameUserId(null)}
                                      className="p-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="group flex items-center gap-2">
                                <span className={`font-bold ${user.disabled ? 'text-slate-400 line-through' : 'text-[#150E56]'}`}>
                                  {cleanDisplayName(user.full_name) || 'Anonymous User'}
                                </span>
                                {!user.disabled && (
                                  <button
                                    onClick={() => {
                                      setEditingNameUserId(user.id);
                                      setTempName(cleanDisplayName(user.full_name) || '');
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition p-1 hover:text-[#00917C] text-slate-400"
                                    title="Edit Name"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-4 font-semibold">{user.email}</td>
                        <td className="p-4 font-semibold">
                          {new Date(user.created_at).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="p-4 text-center">
                          {user.disabled ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800 border border-red-200">
                              Disabled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="inline-flex items-center gap-3">
                            {updatingUserId === user.id && (
                              <Loader2 className="h-4 w-4 animate-spin text-[#00917C]" />
                            )}
                            <select
                              value={user.role}
                              disabled={updatingUserId === user.id || user.disabled}
                              onChange={(e) => handleRoleChange(user.id, e.target.value)}
                              className="rounded-xl border border-[#150E56]/10 bg-white px-3.5 py-2 text-sm text-[#150E56] font-semibold outline-none transition focus:border-[#00917C]/50 cursor-pointer disabled:opacity-50 shadow-clayBtn"
                            >
                              {roles.map((role) => (
                                <option key={role.id} value={role.name} className="bg-white text-[#150E56]">
                                  {role.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end items-center gap-2">
                            {togglingUserId === user.id ? (
                              <Loader2 className="h-4 w-4 animate-spin text-[#00917C]" />
                            ) : (
                              <button
                                onClick={() => handleToggleUserStatus(user.id, !!user.disabled)}
                                className={`inline-flex p-2 items-center justify-center rounded-xl transition border ${
                                  user.disabled
                                    ? 'bg-emerald-50/70 text-emerald-600 hover:bg-emerald-100 border-emerald-200'
                                    : 'bg-amber-50/70 text-amber-600 hover:bg-amber-100 border-amber-200'
                                }`}
                                title={user.disabled ? "Enable User" : "Disable User"}
                              >
                                {user.disabled ? <UserCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                              </button>
                            )}
                            <button
                              onClick={() => setUserToDelete(user)}
                              className="inline-flex p-2 items-center justify-center rounded-xl bg-red-50/70 text-red-600 hover:bg-red-100 transition border border-red-200"
                              title="Remove User"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </motion.main>
        </div>
      </div>

      {/* Add User Modal */}
      <AnimatePresence>
        {showAddUserModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#150E56]/40 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md overflow-hidden rounded-[2.5rem] border border-white bg-white/95 shadow-2xl backdrop-blur-xl"
            >
              <div className="absolute top-4 right-4">
                <button
                  onClick={() => setShowAddUserModal(false)}
                  className="rounded-full bg-[#150E56]/5 p-2 text-[#5C6485] transition hover:bg-[#150E56]/10 hover:text-[#150E56]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-8">
                <h3 className="text-2xl font-extrabold text-[#150E56]">Add New User</h3>
                <p className="mt-2 text-sm text-[#5C6485]">
                  Register a new user and assign their access role.
                </p>

                <form onSubmit={handleAddUser} className="mt-6 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-[#5C6485]">Full Name</label>
                    <input
                      type="text"
                      required
                      value={newUser.fullName}
                      onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                      className="w-full rounded-xl border border-[#150E56]/10 bg-white px-4 py-2.5 text-sm text-[#150E56] font-semibold placeholder-[#5C6485]/40 outline-none transition focus:border-[#00917C]/50 shadow-clayBtn"
                      placeholder="Jane Doe"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-[#5C6485]">Email Address</label>
                    <input
                      type="email"
                      required
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      className="w-full rounded-xl border border-[#150E56]/10 bg-white px-4 py-2.5 text-sm text-[#150E56] font-semibold placeholder-[#5C6485]/40 outline-none transition focus:border-[#00917C]/50 shadow-clayBtn"
                      placeholder="jane@example.com"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-[#5C6485]">Initial Role</label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                      className="w-full rounded-xl border border-[#150E56]/10 bg-white px-4 py-2.5 text-sm text-[#150E56] font-semibold outline-none transition focus:border-[#00917C]/50 cursor-pointer shadow-clayBtn"
                    >
                      <option value="New Lead" className="bg-white text-[#150E56]">New Lead</option>
                      {roles
                        .filter((r) => r.name.toLowerCase() !== 'new lead' && r.name.toLowerCase() !== 'newlead')
                        .map((r) => (
                          <option key={r.id} value={r.name} className="bg-white text-[#150E56]">{r.name}</option>
                        ))
                      }
                    </select>
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={isAddingUser}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#00917C] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#00917C]/95 disabled:opacity-50 shadow-md shadow-[#00917C]/20"
                    >
                      {isAddingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      {isAddingUser ? 'Adding User...' : 'Add User'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {userToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#150E56]/40 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm overflow-hidden rounded-[2.5rem] border border-white bg-white/95 p-8 text-center shadow-2xl backdrop-blur-xl"
            >
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-100 text-red-600">
                <ShieldAlert className="h-8 w-8" />
              </div>
              <h3 className="mt-6 text-xl font-extrabold text-[#150E56]">Remove User</h3>
              <p className="mt-2 text-sm text-[#5C6485]">
                Are you sure you want to remove <span className="font-bold text-[#150E56]">{cleanDisplayName(userToDelete.full_name) || userToDelete.email}</span>? This action will revoke their access.
              </p>

              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => setUserToDelete(null)}
                  disabled={isDeletingUser}
                  className="flex-1 rounded-xl border border-[#150E56]/10 bg-white px-4 py-2.5 text-sm font-bold text-[#5C6485] transition hover:bg-[#150E56]/5 hover:text-[#150E56] shadow-clayBtn disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteUser}
                  disabled={isDeletingUser}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 shadow-md shadow-red-600/20 disabled:opacity-50"
                >
                  {isDeletingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {isDeletingUser ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
