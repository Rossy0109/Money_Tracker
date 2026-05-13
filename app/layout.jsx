import { AuthProvider } from "@/context/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import AIAssistant from "@/components/AIAssistant";
import "./globals.css";
import ClientWrapper from "./ClientWrapper";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "Foot Print of Money",
  description: "Professional Personal Finance Tracker",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }) {
  return (
    <html lang="bn">
      <body>
        <ErrorBoundary>
          <ClientWrapper>{children}</ClientWrapper>
        </ErrorBoundary>
        <Analytics />
      </body>
    </html>
  );
}

