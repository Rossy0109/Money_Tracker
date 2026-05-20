'use client';
import { AuthProvider } from "@/context/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import "./globals.css";
import ClientWrapper from "./ClientWrapper";
import { useEffect, useState } from "react";

export default function RootLayout({ children }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // During static build/SSR, render a neutral loading shell.
  // This avoids calling hooks that depend on browser context.
  if (!isClient) {
    return (
      <html lang="bn">
        <body>
          <div className="min-h-screen flex items-center justify-center">
            <p>Loading...</p>
          </div>
        </body>
      </html>
    );
  }

  // Once hydrated, render the full Auth-wrapped app
  return (
    <html lang="bn">
      <body>
        <ErrorBoundary>
          <AuthProvider>
            <ClientWrapper>{children}</ClientWrapper>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
