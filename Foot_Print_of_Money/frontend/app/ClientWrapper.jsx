'use client';

export default function ClientWrapper({ children }) {
    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            {children}
        </div>
    );
}
