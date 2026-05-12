'use client';
/**
 * app/dashboard/budget/page.jsx
 * Budget Management and Variance Tracking.
 */
import { useState, useEffect } from 'react';
import { DataHub } from '@/lib/data-hub';
import { PieChart as PieIcon, TrendingUp, AlertTriangle } from 'lucide-react';

export default function BudgetPage() {
    const [budgets, setBudgets] = useState([]);
    const [categories, setCategories] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ category_name: '', amount: '' });

    useEffect(() => {
        const unsubB = DataHub.sync('budgets', setBudgets);
        const unsubC = DataHub.sync('categories', setCategories);
        const unsubT = DataHub.sync('transactions', setTransactions);
        return () => { unsubB(); unsubC(); unsubT(); };
    }, []);

    const curMonth = new Date().toISOString().substring(0, 7);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await DataHub.add('budgets', {
                category_name: formData.category_name,
                amount: parseFloat(formData.amount),
                month_year: `${curMonth}-01`
            });
            setFormData({ category_name: '', amount: '' });
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const calculateSpent = (catName) => {
        return transactions
            .filter(t => t.category_name === catName && t.date.startsWith(curMonth))
            .reduce((s, t) => s + t.amount, 0);
    };

    return (
        <div className="space-y-8">
            <header>
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">বাজেট ও রিপোর্ট</h2>
                <p className="text-slate-500">আপনার মাসিক খরচের সীমা নির্ধারণ করুন</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form */}
                <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 text-slate-800">
                        <PieIcon className="text-purple-600" size={20} />
                        বাজেট সেট করুন
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">খাত</label>
                            <select 
                                value={formData.category_name}
                                onChange={(e) => setFormData({...formData, category_name: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                                required
                            >
                                <option value="">নির্বাচন করুন</option>
                                {categories.filter(c => c.type === 'expense').map(cat => (
                                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">বাজেট পরিমাণ</label>
                            <input 
                                type="number" 
                                value={formData.amount}
                                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                                placeholder="৳ 0.00"
                                required
                            />
                        </div>
                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50 transition-all shadow-md shadow-purple-100"
                        >
                            সেট বাজেট
                        </button>
                    </form>
                </div>

                {/* Progress Tracking */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-semibold text-slate-800 mb-6">খরচের লক্ষ্যমাত্রা ও প্রগতি</h3>
                        <div className="space-y-6">
                            {budgets.map(b => {
                                const spent = calculateSpent(b.category_name);
                                const percent = Math.min((spent / b.amount) * 100, 100);
                                const color = percent > 90 ? 'bg-red-500' : percent > 70 ? 'bg-amber-500' : 'bg-emerald-500';

                                return (
                                    <div key={b.id} className="space-y-2">
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <span className="text-sm font-bold text-slate-900 block">{b.category_name}</span>
                                                <span className="text-xs text-slate-500">৳ {spent.toLocaleString()} / ৳ {b.amount.toLocaleString()}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${percent > 90 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-600'}`}>
                                                    {percent.toFixed(0)}%
                                                </span>
                                            </div>
                                        </div>
                                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full transition-all duration-500 ${color}`} 
                                                style={{ width: `${percent}%` }}
                                            ></div>
                                        </div>
                                        {percent >= 100 && (
                                            <p className="text-[10px] text-red-500 flex items-center gap-1">
                                                <AlertTriangle size={10} /> বাজেট অতিক্রম করেছে!
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                            {budgets.length === 0 && (
                                <div className="text-center py-12">
                                    <div className="inline-flex p-4 bg-slate-50 rounded-full mb-4">
                                        <TrendingUp className="text-slate-300" size={32} />
                                    </div>
                                    <p className="text-slate-400 italic text-sm">কোনো বাজেট সেট করা নেই।</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
