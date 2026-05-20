"use client";
/**
 * context/AuthContext.jsx
 * Global Auth State Provider
 */
import { createContext, useContext, useEffect, useState } from "react";
import { subscribeToAuth, logout as authLogout } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const AuthContext = createContext({
  user: null,
  profile: null,
  isApproved: false,
  loading: true,
  logout: () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isApproved, setIsApproved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuth(async (supabaseUser) => {
      try {
        setUser(supabaseUser);

        if (supabaseUser) {
          // Fetch profile from Supabase to get roles and metadata
          const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", supabaseUser.id)
            .single();

          if (!error && data) {
            setProfile(data);
            const active = data.is_active === true;
            setIsApproved(active);
            
            // Set cookies for middleware
            document.cookie = `fom_active=${active ? 'true' : ''}; path=/; max-age=3600; SameSite=Lax`;
            document.cookie = `fom_role=${data.role || 'ACCOUNTANT'}; path=/; max-age=3600; SameSite=Lax`;
          } else {
            console.error("[AuthContext] Profile fetch error:", error);
            setIsApproved(false);
            document.cookie = "fom_active=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
          }
        } else {
          setProfile(null);
          setIsApproved(false);
          document.cookie = "fom_active=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
        }
      } catch (e) {
        console.error("[AuthContext] Unexpected error:", e);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const value = {
    user,
    profile,
    isApproved,
    loading,
    logout: async () => {
      await authLogout();
      setUser(null);
      setProfile(null);
      setIsApproved(false);
    },
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
