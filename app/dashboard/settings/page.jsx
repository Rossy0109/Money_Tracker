'use client';
/**
 * app/dashboard/settings/page.jsx
 * User preferences, Cache management, and App Info.
 */
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Settings, Trash2, Database, Info, Globe } from 'lucide-react';
import { APP_NAME, SCHEMA_VERSION } from '@/lib/constants';

export default function SettingsPage() {
    const { profile } = useAuth();
    const [clearing, setLoading] = useState(false);

    const clearLocalCache = () => {
        setLoading(true);
        // Clear all localStorage keys starting with 'fom_'
        Object.keys(localStorage)
            .filter(key => key.startsWith('fom_'))
            .forEach(key => localStorage.removeItem(key));
        
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    };

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <header>
                <h2 className="text-3xl font-bold text-slate-900">সেটিংস (Settings)</h2>
                <p className="text-slate-500">অ্যাপ্লিকেশন প্রেফারেন্স এবং সিস্টেম ম্যানেজমেন্ট</p>
            </header>

            <div className="space-y-6">
                {/* Profile Info */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Info size={16} /> প্রোফাইল তথ্য
                    </h3>
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-2xl font-black">
                            {profile?.display_name?.charAt(0) || 'U'}
                        </div>
                        <div>
                            <p className="text-xl font-bold text-slate-900">{profile?.display_name}</p>
                            <p className="text-slate-400">{profile?.email}</p>
                            <span className="mt-2 inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">
                                ROLE: {profile?.metadata?.role || 'ACCOUNTANT'}
                            </span>
                        </div>
                    </div>
                </section>

                {/* Local Storage / Cache */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Database size={16} /> স্টোরেজ ও ক্যাশ
                    </h3>
                    <p className="text-sm text-slate-500 mb-6">
                        যদি অফলাইন ডাটা বা সিংক্রোনাইজেশনে সমস্যা হয়, তবে লোকাল ক্যাশ ক্লিয়ার করুন। এটি আপনার ডিভাইসে থাকা অস্থায়ী ডাটা মুছে ফেলবে (অনলাইন ডাটা সুরক্ষিত থাকবে)।
                    </p>
                    <button 
                        onClick={clearLocalCache}
                        disabled={clearing}
                        className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-bold text-sm"
                    >
                        <Trash2 size={18} /> {clearing ? 'ক্লিয়ার হচ্ছে...' : 'লোকাল ক্যাশ মুছুন'}
                    </button>
                </section>

                {/* App Info */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Settings size={16} /> সিস্টেম তথ্য
                    </h3>
                    <div className="space-y-4">
                        <div className="flex justify-between py-2 border-b border-slate-50">
                            <span className="text-slate-500 text-sm font-medium">Application Name</span>
                            <span className="text-slate-900 text-sm font-bold">{APP_NAME}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-slate-50">
                            <span className="text-slate-500 text-sm font-medium">Schema Version</span>
                            <span className="text-slate-900 text-sm font-bold">{SCHEMA_VERSION}</span>
                        </div>
                        <div className="flex justify-between py-2">
                            <span className="text-slate-500 text-sm font-medium">Platform</span>
                            <span className="text-slate-900 text-sm font-bold">Next.js 14 (PWA)</span>
                        </div>
                    </div>
                </section>

                <p className="text-center text-[10px] text-slate-300 uppercase tracking-[0.2em] pt-8">
                    Built for longevity and financial safety.
                </p>
            </div>
        </div>
    );
}
