'use client';
/**
 * app/dashboard/debts/page.jsx
 * Debt Management and Payoff Strategy.
 */
import { useState, useEffect } from 'react';
import { DataHub } from '@/lib/data-hub';
import { Landmark, Plus, Trash2, ArrowDownCircle, AlertCircle } from 'lucide-react';

export default function DebtsPage() {
    const [debts, setDebts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ name: '', balance: '', apr: '', min_payment: '' });

    useEffect(() => {
        const unsub = DataHub.sync('debts', setDebts);
        return () => unsub();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await DataHub.add('debts', {
                ...formData,
                balance: parseFloat(formData.balance),
                apr: parseFloat(formData.apr),
                min_payment: parseFloat(formData.min_payment)
            });
            setFormData({ name: '', balance: '', apr: '', min_payment: '' });
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const totalDebt = debts.reduce((s, d) => s + d.balance, 0);

    return (
        <div className="space-y-8">
            <header className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900">ঋণ (Debts)</h2>
                    <p className="text-slate-500">আপনার দায়ের হিসাব রাখুন ও মুক্তির পরিকল্পনা করুন</p>
                </div>
                <div className="px-6 py-4 bg-red-50 border border-red-100 rounded-xl">
                    <span className="text-xs text-red-400 uppercase font-bold block mb-1">মোট ঋণ</span>
                    <span className="text-2xl font-black text-red-600">৳ {totalDebt.toLocaleString()}</span>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                        <Plus className="text-red-500" size={20} />
                        নতুন ঋণ যোগ করুন
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">ঋণের নাম</label>
                            <input 
                                type="text" 
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                placeholder="যেমন: ব্যাংক লোন, বন্ধুর কাছ থেকে..."
                                required
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">বকেয়া পরিমাণ</label>
                                <input 
                                    type="number" 
                                    value={formData.balance}
                                    onChange={(e) => setFormData({...formData, balance: e.target.value})}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                    placeholder="৳ 0.00"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">সুদ (APR %)</label>
                                <input 
                                    type="number" 
                                    value={formData.apr}
                                    onChange={(e) => setFormData({...formData, apr: e.target.value})}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                    placeholder="0%"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">ন্যূনতম মাসিক কিস্তি</label>
                            <input 
                                type="number" 
                                value={formData.min_payment}
                                onChange={(e) => setFormData({...formData, min_payment: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                placeholder="৳ 0.00"
                                required
                            />
                        </div>
                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 disabled:opacity-50 transition-all shadow-md shadow-red-100"
                        >
                            সেভ করুন
                        </button>
                    </form>
                </div>

                <div className="lg:col-span-2 space-y-4">
                    {debts.map(debt => (
                        <div key={debt.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 group flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-red-50 rounded-lg text-red-500">
                                    <Landmark size={24} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-900">{debt.name}</h4>
                                    <div className="flex gap-4 mt-1">
                                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">APR: {debt.apr}%</span>
                                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">কিস্তি: ৳{debt.min_payment}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-8">
                                <div className="text-right">
                                    <p className="text-xl font-black text-slate-900">৳ {debt.balance.toLocaleString()}</p>
                                    <span className="text-[10px] text-red-400 font-bold">TOTAL DUE</span>
                                </div>
                                <button 
                                    onClick={() => DataHub.delete('debts', debt.id)}
                                    className="p-2 text-slate-300 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {debts.length === 0 && (
                        <div className="text-center py-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                            <AlertCircle className="mx-auto text-slate-300 mb-4" size={48} />
                            <p className="text-slate-400 italic">কোনো ঋণের রেকর্ড পাওয়া যায়নি।</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
