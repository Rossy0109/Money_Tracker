'use client';
/**
 * app/dashboard/accounts/page.jsx
 * Account/Bank/Wallet Management.
 */
import { useState, useEffect } from 'react';
import { DataHub } from '@/lib/data-hub';
import { Landmark, Plus, Trash2, Wallet } from 'lucide-react';

export default function AccountsPage() {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ name: '', type: 'bank', balance: 0, currency: 'BDT' });

    useEffect(() => {
        const unsub = DataHub.sync('accounts', setAccounts);
        return () => unsub();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await DataHub.add('accounts', {
                ...formData,
                balance: parseFloat(formData.balance)
            });
            setFormData({ ...formData, name: '', balance: 0 });
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <header>
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">অ্যাকাউন্টস ও ওয়ালেট</h2>
                <p className="text-slate-500">আপনার ব্যাংক, কার্ড এবং নগদ টাকার ব্যালেন্স ট্র্যাক করুন</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                        <Plus className="text-emerald-600" size={20} />
                        নতুন অ্যাকাউন্ট
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">অ্যাকাউন্টের নাম</label>
                            <input 
                                type="text" 
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                placeholder="যেমন: Dutch Bangla Bank, bKash..."
                                required
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">ধরণ</label>
                                <select 
                                    value={formData.type}
                                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                >
                                    <option value="bank">ব্যাংক</option>
                                    <option value="cash">নগদ টাকা</option>
                                    <option value="mobile">মোবাইল ব্যাংকিং</option>
                                    <option value="card">ক্রেডিট কার্ড</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">কারেন্সি</label>
                                <select 
                                    value={formData.currency}
                                    onChange={(e) => setFormData({...formData, currency: e.target.value})}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                >
                                    <option value="BDT">BDT (৳)</option>
                                    <option value="USD">USD ($)</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">বর্তমান ব্যালেন্স</label>
                            <input 
                                type="number" 
                                value={formData.balance}
                                onChange={(e) => setFormData({...formData, balance: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                                required
                            />
                        </div>
                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-md shadow-emerald-100"
                        >
                            অ্যাকাউন্ট খুলুন
                        </button>
                    </form>
                </div>

                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {accounts.map(acc => (
                        <div key={acc.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between group relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => {
                                        if (confirm('আপনি কি নিশ্চিত যে আপনি এই অ্যাকাউন্টটি মুছে ফেলতে চান? এটি মুছে ফেললে এর সাথে সম্পর্কিত লেনদেনগুলোও ডিলিট হতে পারে।')) {
                                            DataHub.delete('accounts', acc.id);
                                        }
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            <div className="flex items-center gap-4 mb-4">
                                <div className="p-3 bg-slate-50 rounded-lg text-slate-600">
                                    {acc.type === 'bank' ? <Landmark size={24} /> : <Wallet size={24} />}
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-900 leading-tight">{acc.name}</h4>
                                    <span className="text-[10px] text-slate-400 uppercase tracking-widest">{acc.type}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-black text-slate-900">
                                    <span className="text-sm font-normal text-slate-400 mr-1">{acc.currency === 'BDT' ? '৳' : '$'}</span>
                                    {acc.balance.toLocaleString()}
                                </p>
                            </div>
                        </div>
                    ))}
                    {accounts.length === 0 && (
                        <div className="col-span-2 text-center py-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                            <p className="text-slate-400 italic">কোনো অ্যাকাউন্ট যোগ করা হয়নি।</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
