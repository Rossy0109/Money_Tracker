import { AuthProvider } from '@/context/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import AIAssistant from '@/components/AIAssistant';
import './globals.css';

export const metadata = {
  title: 'Foot Print of Money',
  description: 'Professional Personal Finance Tracker',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }) {
  return (
    <html lang="bn">
      <body>
        <ErrorBoundary>
          <AuthProvider>
            <div id="root">
              {children}
              <AIAssistant />
            </div>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
