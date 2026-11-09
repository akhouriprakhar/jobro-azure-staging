"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import Sidebar from "../components/dashboard/Sidebar";
import Navbar from "../components/dashboard/Navbar";
import LoadingScreen from "../components/LoadingScreen";
import InternProfileDashboard from "../components/InternProfileDashboard";

export default function InternProfilePage() {
  const searchParams = useSearchParams();
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>("Student");
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          window.location.href = "/signin";
          return;
        }

        const { data: userRoles } = await supabase
          .from("user_roles")
          .select("roles(name)")
          .eq("user_id", session.user.id)
          .single();

        const role = (userRoles as any)?.roles?.name || "Student";
        setCurrentUserRole(role);

        // Admins/Founders can query other candidates' profiles via parameter, students are locked to their own UUID
        const queryId = searchParams.get("id");
        if (queryId && (role === "Admin" || role === "Founder" || role === "Program Manager")) {
          setCandidateId(queryId);
        } else {
          setCandidateId(session.user.id);
        }
      } catch (err) {
        console.error("Error loading profile session:", err);
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, [searchParams]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!candidateId) {
    return (
      <div className="flex h-screen items-center justify-center bg-transparent text-[#2C3454]">
        <p className="text-sm font-semibold">No active user session detected.</p>
      </div>
    );
  }

  return (
    <div className="h-screen max-h-screen bg-transparent text-[#2C3454] overflow-hidden">
      <div className="absolute inset-0 bg-futuristic-grid opacity-[0.25] pointer-events-none"></div>
      
      <div className="relative w-full flex h-screen max-h-screen overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} onClose={() => setSidebarCollapsed(true)} />

        <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
          <Navbar onToggle={() => setSidebarCollapsed((prev) => !prev)} />

          <main className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
            <InternProfileDashboard candidateId={candidateId} userRole={currentUserRole} />
          </main>
        </div>
      </div>
    </div>
  );
}
