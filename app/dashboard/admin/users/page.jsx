'use client';
/**
 * app/dashboard/admin/users/page.jsx
 * Advanced User Management for Admin (Kamrul).
 * Controls: Invite (Whitelist), Role Swap, Deactivate.
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { UserPlus, Mail, Shield, Power, Loader2, Trash2 } from 'lucide-react';
import { ADMIN_EMAIL } from '@/lib/constants';

export default function UserManagement() {
    const { profile: myProfile } = useAuth();
    const [profiles, setProfiles] = useState([]);
    const [whitelist, setWhitelist] = useState([]);
    const [newEmail, setNewEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [actionId, setActionId] = useState(null);

    useEffect(() => {
        refreshData();
    }, []);

    const refreshData = async () => {
        const [profRes, whiteRes] = await Promise.all([
            supabase.from('profiles').select('*').order('created_at', { ascending: false }),
            supabase.from('whitelist').select('*').order('created_at', { ascending: false })
        ]);
        setProfiles(profRes.data || []);
        setWhitelist(whiteRes.data || []);
    };

    /**
     * Adds an email to the whitelist
     */
    const handleInvite = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { error } = await supabase.from('whitelist').insert({
                email: newEmail,
                role: 'ACCOUNTANT',
                invited_by: myProfile.id
            });
            if (error) throw error;
            setNewEmail('');
            refreshData();
        } catch (err) {
            alert("Invite Failed: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Updates user role or active status in profiles
     */
    const handleUpdateProfile = async (userId, payload) => {
        setActionId(userId);
        try {
            const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
            if (error) throw error;
            refreshData();
        } catch (err) {
            alert(err.message);
        } finally {
            setActionId(null);
        }
    };

    /**
     * Removes from whitelist
     */
    const handleRemoveWhitelist = async (email) => {
        if (!confirm('Are you sure you want to remove this invitation?')) return;
        await supabase.from('whitelist').delete().eq('email', email);
        refreshData();
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <header>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">ইউজার ম্যানেজমেন্ট</h2>
                <p className="text-slate-500">ইনভাইটেশন এবং রোল ম্যানেজমেন্ট</p>
            </header>

            {/* Invite Form */}
            <div className="bg-slate-900 p-8 rounded-3xl shadow-2xl text-white">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <UserPlus size={20} className="text-blue-400" />
                    নতুন ইমেইল অনুমোদন দিন (Whitelist)
                </h3>
                <form onSubmit={handleInvite} className="flex gap-4">
                    <div className="flex-1 relative">
                        <Mail className="absolute left-4 top-3.5 text-slate-500" size={18} />
                        <input 
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="user@example.com"
                            className="w-full pl-12 pr-4 py-3.5 bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                            required
                        />
                    </div>
                    <button 
                        type="submit"
                        disabled={loading}
                        className="px-8 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-500 disabled:opacity-50 shadow-lg flex items-center gap-2"
                    >
                        {loading && <Loader2 size={18} className="animate-spin" />}
                        হোয়াইটলিস্ট করুন
                    </button>
                </form>
            </div>

            {/* Active Profiles */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-50">
                    <h3 className="font-bold text-slate-800 uppercase tracking-widest text-xs">সচল ব্যবহারকারী (Active Profiles)</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50/50 text-slate-400 text-[10px] uppercase font-bold tracking-widest">
                            <tr>
                                <th className="px-8 py-4">ব্যবহারকারী</th>
                                <th className="px-8 py-4">রোল</th>
                                <th className="px-8 py-4 text-center">স্ট্যাটাস</th>
                                <th className="px-8 py-4 text-right">অ্যাকশন</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {profiles.map(u => {
                                const isSelf = u.id === myProfile?.id;
                                const isSuperAdmin = u.email === ADMIN_EMAIL;
                                return (
                                    <tr key={u.id} className={`hover:bg-slate-50/50 ${!u.is_active ? 'opacity-50' : ''}`}>
                                        <td className="px-8 py-5">
                                            <p className="text-sm font-bold text-slate-900">{u.display_name}</p>
                                            <p className="text-xs text-slate-400">{u.email}</p>
                                        </td>
                                        <td className="px-8 py-5">
                                            <select 
                                                value={u.metadata?.role || 'ACCOUNTANT'}
                                                onChange={(e) => handleUpdateProfile(u.id, { metadata: { ...u.metadata, role: e.target.value }})}
                                                disabled={isSuperAdmin || actionId === u.id}
                                                className="bg-slate-100 border-none rounded px-2 py-1 text-xs font-bold outline-none"
                                            >
                                                <option value="ADMIN">ADMIN</option>
                                                <option value="ACCOUNTANT">ACCOUNTANT</option>
                                                <option value="VIEWER">VIEWER</option>
                                            </select>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {u.is_active ? 'ACTIVE' : 'DISABLED'}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            {!isSuperAdmin && (
                                                <button 
                                                    onClick={() => handleUpdateProfile(u.id, { is_active: !u.is_active })}
                                                    className="p-2 text-slate-300 hover:text-red-600 transition-colors"
                                                >
                                                    <Power size={18} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Whitelist (Pending Invites) */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-50">
                    <h3 className="font-bold text-slate-800 uppercase tracking-widest text-xs">অপেক্ষমাণ ইনভাইটেশন (Whitelist)</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50/50 text-slate-400 text-[10px] uppercase font-bold tracking-widest">
                            <tr>
                                <th className="px-8 py-4">ইমেইল</th>
                                <th className="px-8 py-4">নির্ধারিত রোল</th>
                                <th className="px-8 py-4 text-right">অ্যাকশন</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {whitelist.filter(w => !profiles.find(p => p.email === w.email)).map(w => (
                                <tr key={w.email} className="hover:bg-slate-50/50">
                                    <td className="px-8 py-5 text-sm font-medium text-slate-600">{w.email}</td>
                                    <td className="px-8 py-5">
                                        <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded uppercase">{w.role}</span>
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <button 
                                            onClick={() => handleRemoveWhitelist(w.email)}
                                            className="text-slate-300 hover:text-red-600"
                                        >
                                            <Trash2 size={16} />
                                        </button>
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
