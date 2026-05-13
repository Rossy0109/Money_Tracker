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
  loading: true,
  logout: () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuth(async (supabaseUser) => {
      setUser(supabaseUser);

      if (supabaseUser) {
        // Fetch profile from Supabase to get roles and metadata
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", supabaseUser.id)
          .single();

        if (!error) setProfile(data);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = {
    user,
    profile,
    loading,
    logout: async () => {
      await authLogout();
      setUser(null);
      setProfile(null);
    },
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
