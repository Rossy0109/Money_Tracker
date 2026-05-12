'use client';
/**
 * app/dashboard/goals/page.jsx
 * Financial Goals Tracking with Progress Visuals.
 */
import { useState, useEffect } from 'react';
import { DataHub } from '@/lib/data-hub';
import { Target, Plus, Trash2, Trophy } from 'lucide-react';

export default function GoalsPage() {
    const [goals, setGoals] = useState([]);
    const [balance, setBalance] = useState(0);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ name: '', target_amount: '' });

    useEffect(() => {
        const unsubGoals = DataHub.sync('financial_goals', setGoals);
        const unsubTx = DataHub.sync('transactions', (data) => {
            const { balance: currentBalance } = DataHub.getFinancialSummary(data);
            setBalance(currentBalance);
        });
        return () => { unsubGoals(); unsubTx(); };
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await DataHub.add('financial_goals', {
                ...formData,
                target_amount: parseFloat(formData.target_amount)
            });
            setFormData({ name: '', target_amount: '' });
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <header>
                <h2 className="text-3xl font-bold text-slate-900">আর্থিক লক্ষ্য (Goals)</h2>
                <p className="text-slate-500">আপনার স্বপ্ন পূরণের পথে প্রগতি ট্র্যাক করুন</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                        <Plus className="text-orange-500" size={20} />
                        নতুন লক্ষ্য
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">লক্ষ্যের নাম</label>
                            <input 
                                type="text" 
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                placeholder="যেমন: নতুন বাড়ি, হজ্জ্ব, ভ্রমণ..."
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">টার্গেট পরিমাণ</label>
                            <input 
                                type="number" 
                                value={formData.target_amount}
                                onChange={(e) => setFormData({...formData, target_amount: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                placeholder="৳ 0.00"
                                required
                            />
                        </div>
                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-orange-500 text-white rounded-lg font-bold hover:bg-orange-600 disabled:opacity-50 transition-all shadow-md shadow-orange-100"
                        >
                            লক্ষ্য যোগ করুন
                        </button>
                    </form>
                </div>

                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {goals.map(goal => {
                        const percent = Math.min((balance / goal.target_amount) * 100, 100);
                        const isAchieved = percent >= 100;

                        return (
                            <div key={goal.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                                {isAchieved && (
                                    <div className="absolute -right-4 -top-4 p-8 bg-orange-50 rounded-full text-orange-500">
                                        <Trophy size={24} />
                                    </div>
                                )}
                                <div className="flex justify-between mb-4">
                                    <h4 className="font-bold text-slate-900">{goal.name}</h4>
                                    <button 
                                        onClick={() => DataHub.delete('financial_goals', goal.id)}
                                        className="text-slate-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-end">
                                        <span className="text-xs text-slate-500">বর্তমান সঞ্চয়: ৳{balance.toLocaleString()}</span>
                                        <span className="text-xs font-bold text-slate-900">লক্ষ্য: ৳{goal.target_amount.toLocaleString()}</span>
                                    </div>
                                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full transition-all duration-1000 ${isAchieved ? 'bg-orange-500' : 'bg-blue-500'}`}
                                            style={{ width: `${percent}%` }}
                                        ></div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${isAchieved ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-500'}`}>
                                            {isAchieved ? 'অর্জিত (Achieved)' : 'চলমান (In Progress)'}
                                        </span>
                                        <span className="text-sm font-black text-slate-900">{percent.toFixed(1)}%</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {goals.length === 0 && (
                        <div className="col-span-2 text-center py-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                            <Target className="mx-auto text-slate-300 mb-4" size={48} />
                            <p className="text-slate-400 italic">এখনো কোনো আর্থিক লক্ষ্য যোগ করা হয়নি।</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
