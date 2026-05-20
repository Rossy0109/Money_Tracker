'use client';
/**
 * app/dashboard/admin/page.jsx
 * Admin-only panel for user management and system status.
 * Restricted to 'Kamrul' via RLS and useRole hook.
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, ShieldCheck, Activity, Search } from 'lucide-react';
import { formatDate } from '@/lib/utils';

export default function AdminPanel() {
    const [profiles, setProfiles] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchProfiles() {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (!error) setProfiles(data);
            setLoading(false);
        }
        fetchProfiles();
    }, []);

    const filteredProfiles = profiles.filter(p => 
        p.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="p-8 text-slate-400">অ্যাডমিন ডাটা লোড হচ্ছে...</div>;

    return (
        <div className="space-y-8">
            <header className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <ShieldCheck className="text-red-600" size={32} />
                        অ্যাডমিন কন্ট্রোল প্যানেল
                    </h2>
                    <p className="text-slate-500 italic">শুধুমাত্র কামরুল সাহেবের জন্য সংরক্ষিত।</p>
                </div>
                <div className="flex gap-4">
                    <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                        <span className="text-[10px] text-slate-400 uppercase block">মোট ব্যবহারকারী</span>
                        <span className="text-xl font-bold">{profiles.length}</span>
                    </div>
                    <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                        <span className="text-[10px] text-slate-400 uppercase block">সিস্টেম স্ট্যাটাস</span>
                        <span className="text-xl font-bold text-green-500 flex items-center gap-1">
                             <Activity size={16} /> LIVE
                        </span>
                    </div>
                </div>
            </header>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center gap-3">
                    <Search className="text-slate-400" size={20} />
                    <input 
                        type="text" 
                        placeholder="ব্যবহারকারী খুঁজুন (Email/Name)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="flex-1 bg-transparent border-none outline-none text-sm"
                    />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                            <tr>
                                <th className="px-6 py-4">ব্যবহারকারী</th>
                                <th className="px-6 py-4">রোল (Role)</th>
                                <th className="px-6 py-4">জয়েনিং তারিখ</th>
                                <th className="px-6 py-4">শেষ লগইন</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredProfiles.map((profile) => (
                                <tr key={profile.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            {profile.avatar_url ? (
                                                <img src={profile.avatar_url} className="w-8 h-8 rounded-full border border-slate-100" alt="" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                                    <Users size={16} />
                                                </div>
                                            )}
                                            <div>
                                                <p className="text-sm font-bold text-slate-900 leading-none">{profile.display_name}</p>
                                                <p className="text-xs text-slate-400 mt-1">{profile.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${profile.role === 'ADMIN' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                            {profile.role || 'ACCOUNTANT'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-500">
                                        {formatDate(profile.created_at)}
                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-500">
                                        {profile.metadata?.last_login ? new Date(profile.metadata.last_login).toLocaleString() : 'N/A'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
