'use client';
/**
 * components/Sidebar.jsx
 * Navigation component with Role-based access control.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole } from '@/hooks/useRole';
import { useAuth } from '@/context/AuthContext';
import { 
    LayoutDashboard, 
    CirclePlus, 
    RefreshCw, 
    PieChart, 
    Target, 
    FlaskConical, 
    FileText, 
    Bell, 
    Settings,
    LogOut,
    ShieldAlert
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const navItems = [
    { name: 'সারসংক্ষেপ', href: '/dashboard', icon: LayoutDashboard, section: 'overview' },
    { name: 'নতুন লেনদেন', href: '/dashboard/transactions', icon: CirclePlus, section: 'transactions' },
    { name: 'নিয়মিত খরচ', href: '/dashboard/recurring', icon: RefreshCw, section: 'recurring' },
    { name: 'বাজেট', href: '/dashboard/budget', icon: PieChart, section: 'budget' },
    { name: 'আর্থিক লক্ষ্য', href: '/dashboard/goals', icon: Target, section: 'goals' },
    { name: 'ব্যাংক সিংক্রোনাইজেশন', href: '/dashboard/lab/bank-sync', icon: Landmark, section: 'banksync' },
    { name: 'ফিন্যান্সিয়াল ল্যাব', href: '/dashboard/lab', icon: FlaskConical, section: 'lab' },
    { name: 'রিপোর্ট', href: '/dashboard/reports', icon: FileText, section: 'reports' },
    { name: 'রিমাইন্ডার', href: '/dashboard/reminders', icon: Bell, section: 'reminders' },
    { name: 'সেটিংস', href: '/dashboard/settings', icon: Settings, section: 'settings' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { isAdmin } = useRole();
    const { profile, logout } = useAuth();

    return (
        <aside className="w-64 flex flex-col h-screen bg-slate-900 text-slate-300">
            <div className="p-6">
                <div className="flex items-center gap-3 mb-6">
                    <span className="text-2xl">💰</span>
                    <h1 className="font-bold text-white tracking-tight">Money Footprint</h1>
                </div>
                
                <div className="py-3 px-4 bg-slate-800 rounded-lg mb-6">
                    <p className="text-xs text-slate-500">User</p>
                    <p className="text-sm font-medium text-slate-200 truncate">{profile?.display_name || profile?.email}</p>
                </div>

                <nav className="space-y-1">
                    {navItems.map((item) => (
                        <Link 
                            key={item.href}
                            href={item.href}
                            className={twMerge(
                                "flex items-center gap-3 px-4 py-2 rounded-md transition-colors",
                                pathname === item.href 
                                    ? "bg-blue-600 text-white" 
                                    : "hover:bg-slate-800 text-slate-400 hover:text-slate-100"
                            )}
                        >
                            <item.icon size={18} />
                            <span className="text-sm">{item.name}</span>
                        </Link>
                    ))}

                    {isAdmin && (
                        <Link 
                            href="/dashboard/admin"
                            className={twMerge(
                                "flex items-center gap-3 px-4 py-2 rounded-md transition-colors mt-4 border border-slate-700",
                                pathname === '/dashboard/admin' 
                                    ? "bg-red-600 text-white" 
                                    : "hover:bg-red-900/20 text-red-400"
                            )}
                        >
                            <ShieldAlert size={18} />
                            <span className="text-sm font-semibold uppercase">Admin Panel</span>
                        </Link>
                    )}
                </nav>
            </div>

            <div className="mt-auto p-6 space-y-4">
                <button 
                    onClick={logout}
                    className="flex items-center gap-3 w-full px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-all"
                >
                    <LogOut size={18} />
                    <span className="text-sm">লগ আউট</span>
                </button>
                
                <div className="text-[10px] text-slate-500 uppercase tracking-widest text-center">
                    Copyright Reserved: Md Kamrul Ahmed
                </div>
            </div>
        </aside>
    );
}
