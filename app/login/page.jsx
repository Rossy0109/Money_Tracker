'use client';
/**
 * app/login/page.jsx
 * Advanced Login with Google, Email/Password, and Role-Based Redirection.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loginWithGoogle, loginWithEmail } from '@/lib/auth';
import { useAuth } from '@/context/AuthContext';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState('google'); // 'google' or 'email'
    
    const router = useRouter();
    const { user, profile, isApproved } = useAuth();

    // Auto-redirect if already logged in
    useEffect(() => {
        if (user && profile) {
            if (!isApproved) {
                router.push('/pending');
                return;
            }
            const role = profile.role;
            if (role === 'ADMIN') router.push('/dashboard/admin/users');
            else if (role === 'ACCOUNTANT') router.push('/dashboard/accountant');
            else router.push('/dashboard');
        }
    }, [user, profile, isApproved, router]);

    const handleAuthAction = async (provider) => {
        setLoading(true);
        setError(null);
        try {
            if (provider === 'google') await loginWithGoogle();
            else await loginWithEmail(email, password);
            // Redirection handled by useEffect above
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4 font-sans">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8 space-y-8">
                <div className="text-center space-y-2">
                    <div className="inline-flex p-3 bg-blue-50 rounded-xl text-blue-600 mb-2">
                        <LogIn size={28} />
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Foot Print of Money</h1>
                    <p className="text-slate-400 text-sm">আপনার নিরাপদ আর্থিক বন্ধু - লগইন করুন</p>
                </div>

                <div className="space-y-6">
                    {view === 'google' ? (
                        <button 
                            onClick={() => handleAuthAction('google')}
                            disabled={loading}
                            className="flex items-center justify-center w-full gap-3 px-4 py-3 text-sm font-bold text-slate-700 bg-white border-2 border-slate-100 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-all active:scale-[0.98]"
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>}
                            Google দিয়ে প্রবেশ করুন
                        </button>
                    ) : (
                        <form onSubmit={(e) => { e.preventDefault(); handleAuthAction('email'); }} className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">ইমেইল ঠিকানা</label>
                                <input 
                                    type="email" 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="kamrul01@gmail.com"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">পাসওয়ার্ড</label>
                                <div className="relative">
                                    <input 
                                        type={showPassword ? "text" : "password"} 
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="••••••"
                                        required
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                                    >
                                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>
                            <button 
                                type="submit" 
                                disabled={loading}
                                className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-100 flex justify-center items-center gap-2"
                            >
                                {loading && <Loader2 className="animate-spin" size={18} />}
                                {loading ? 'প্রসেসিং...' : 'লগইন করুন'}
                            </button>
                        </form>
                    )}

                    <div className="relative flex items-center justify-center py-2">
                        <div className="w-full border-t border-slate-100"></div>
                        <span className="absolute px-3 bg-white text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">অথবা</span>
                    </div>

                    <button 
                        onClick={() => setView(view === 'google' ? 'email' : 'google')}
                        className="w-full text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors uppercase tracking-widest underline decoration-2 underline-offset-4"
                    >
                        {view === 'google' ? 'ইমেইল দিয়ে লগইন করুন' : 'Google দিয়ে ট্রাই করুন'}
                    </button>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-lg animate-shake">
                        <p className="text-xs font-bold text-red-600 leading-snug">{error}</p>
                    </div>
                )}

                <p className="text-center text-[10px] text-slate-300 uppercase tracking-widest pt-4">
                    Copyright © Md Kamrul Ahmed
                </p>
            </div>
        </div>
    );
}
