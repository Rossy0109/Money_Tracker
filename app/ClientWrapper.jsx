"use client";
/**
 * app/ClientWrapper.jsx
 * Handles client-side mounting and global context providers.
 * Isolated from root layout to prevent static generation context errors.
 */
import { useEffect, useState } from "react";
import { AuthProvider } from "@/context/AuthContext";
import AIAssistant from "@/components/AIAssistant";
import { Analytics } from "@vercel/analytics/react";

export default function ClientWrapper({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <AuthProvider>
      <div id="root">
        {children}
        {mounted && <AIAssistant />}
        <Analytics />
      </div>
    </AuthProvider>
  );
}
