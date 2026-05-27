'use client';
import { useState, useEffect } from 'react';
import { DataHub } from '@/lib/data-hub';
import { Target, Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export default function FinancialTargetsPage() {
    const [targets, setTargets] = useState([]);
    const [formData, setFormData] = useState({ target_name: '', amount: '', target_type: 'monthly_profit' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const unsub = DataHub.sync('financial_targets', setTargets);
        return () => unsub();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await DataHub.add('financial_targets', {
                target_name: formData.target_name,
                amount: parseFloat(formData.amount),
                target_type: formData.target_type
            });
            setFormData({ target_name: '', amount: '', target_type: 'monthly_profit' });
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <header>
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">আর্থিক লক্ষ্য (Targets)</h2>
                <p className="text-slate-500">আপনার মাসিক মুনাফা এবং জমার লক্ষ্যমাত্রা সেট করুন</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                        <Target className="text-blue-600" size={20} />
                        নতুন লক্ষ্য
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">লক্ষ্যের নাম</label>
                            <input 
                                type="text" 
                                value={formData.target_name}
                                onChange={(e) => setFormData({...formData, target_name: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">পরিমাণ (৳)</label>
                            <input 
                                type="number" 
                                value={formData.amount}
                                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                required
                            />
                        </div>
                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md shadow-blue-200"
                        >
                            {loading ? 'সংরক্ষণ হচ্ছে...' : 'লক্ষ্য যোগ করুন'}
                        </button>
                    </form>
                </div>

                <div className="lg:col-span-2 space-y-4">
                    {targets.map(t => (
                        <div key={t.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                            <div>
                                <h4 className="font-bold text-slate-900">{t.target_name}</h4>
                                <p className="text-sm text-slate-500">{formatCurrency(t.amount)}</p>
                            </div>
                            <button 
                                onClick={() => DataHub.delete('financial_targets', t.id)}
                                className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
