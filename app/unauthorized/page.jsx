'use client';
/**
 * app/unauthorized/page.jsx
 * Friendly landing page for restricted access.
 */
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default function UnauthorizedPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
            <div className="p-4 bg-red-100 text-red-600 rounded-full mb-6">
                <ShieldAlert size={48} />
            </div>
            <h1 className="text-2xl font-black text-slate-900 mb-2">প্রবেশাধিকার সংরক্ষিত (Restricted)</h1>
            <p className="text-slate-500 max-w-md mb-8">
                আপনার কাছে এই পেজটি দেখার অনুমতি নেই। আপনি যদি মনে করেন এটি ভুল, তবে অ্যাডমিনের (কামরুল সাহেব) সাথে যোগাযোগ করুন।
            </p>
            <Link 
                href="/dashboard" 
                className="px-6 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition-all"
            >
                ড্যাশবোর্ডে ফিরে যান
            </Link>
        </div>
    );
}
