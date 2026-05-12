'use client';
/**
 * app/dashboard/targets/page.jsx
 * Business Targets and KPIs.
 * Fixes Audit Issue #6: Exposing the previously missing 'financial_targets' table.
 */
import { useState, useEffect } from 'react';
import { DataHub } from '@/lib/data-hub';
import { BarChart3, Plus, Trash2, Zap } from 'lucide-react';

export default function TargetsPage() {
    const [targets, setTargets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ 
        target_name: '', 
        target_type: 'monthly_profit', 
        amount: '' 
    });

    useEffect(() => {
        const unsub = DataHub.sync('financial_targets', setTargets);
        return () => unsub();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await DataHub.add('financial_targets', {
                ...formData,
                amount: parseFloat(formData.amount)
            });
            setFormData({ target_name: '', target_type: 'monthly_profit', amount: '' });
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <header>
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">ব্যবসায়িক লক্ষ্যমাত্রা (Targets)</h2>
                <p className="text-slate-500">আপনার ব্যবসার আর্থিক KPI নির্ধারণ ও পর্যবেক্ষণ করুন</p>
            </header>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <Zap className="text-indigo-600" size={20} />
                    KPI সেট করুন
                </h3>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-slate-500 uppercase mb-1">লক্ষ্যমাত্রার নাম</label>
                        <input 
                            type="text" 
                            value={formData.target_name}
                            onChange={(e) => setFormData({...formData, target_name: e.target.value})}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="যেমন: মাসিক নিট মুনাফা, বার্ষিক রেভিনিউ..."
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 uppercase mb-1">ধরণ</label>
                        <select 
                            value={formData.target_type}
                            onChange={(e) => setFormData({...formData, target_type: e.target.value})}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            <option value="monthly_profit">Monthly Profit</option>
                            <option value="annual_revenue">Annual Revenue</option>
                            <option value="expense_cap">Expense Cap</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 uppercase mb-1">টার্গেট পরিমাণ</label>
                        <input 
                            type="number" 
                            value={formData.amount}
                            onChange={(e) => setFormData({...formData, amount: e.target.value})}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="৳ 0.00"
                            required
                        />
                    </div>
                    <button 
                        type="submit"
                        disabled={loading}
                        className="md:col-span-4 mt-2 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md shadow-indigo-100"
                    >
                        টার্গেট সেভ করুন
                    </button>
                </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {targets.map(target => (
                    <div key={target.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 group flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600">
                                <BarChart3 size={24} />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-900">{target.target_name}</h4>
                                <span className="text-[10px] text-indigo-400 uppercase font-bold tracking-widest">{target.target_type.replace('_', ' ')}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-8">
                            <div className="text-right">
                                <p className="text-xl font-black text-slate-900">৳ {target.amount.toLocaleString()}</p>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${target.is_active ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-400'}`}>
                                    {target.is_active ? 'ACTIVE' : 'INACTIVE'}
                                </span>
                            </div>
                            <button 
                                onClick={() => DataHub.delete('financial_targets', target.id)}
                                className="p-2 text-slate-300 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                ))}
                {targets.length === 0 && (
                    <div className="col-span-full text-center py-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                        <BarChart3 className="mx-auto text-slate-300 mb-4" size={48} />
                        <p className="text-slate-400 italic">কোনো ব্যবসায়িক লক্ষ্যমাত্রা পাওয়া যায়নি।</p>
                    </div>
                )}
            </div>
        </div>
    );
}
