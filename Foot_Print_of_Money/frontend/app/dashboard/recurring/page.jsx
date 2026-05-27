'use client';
/**
 * app/dashboard/recurring/page.jsx
 * Recurring Transaction Management (Subscriptions, Bills, etc.)
 */
import { useState, useEffect } from 'react';
import { DataHub } from '@/lib/data-hub';
import { RefreshCw, Plus, Trash2, Calendar } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export default function RecurringPage() {
    const [recurring, setRecurring] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        amount: '',
        type: 'expense',
        frequency: 'monthly',
        category_name: ''
    });

    useEffect(() => {
        const unsub = DataHub.sync('recurring_transactions', setRecurring);
        return () => unsub();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await DataHub.add('recurring_transactions', {
                ...formData,
                amount: parseFloat(formData.amount)
            });
            setFormData({ name: '', amount: '', type: 'expense', frequency: 'monthly', category_name: '' });
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <header>
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">নিয়মিত খরচ (Recurring)</h2>
                <p className="text-slate-500">আপনার মাসিক সাবস্ক্রিপশন ও বিলগুলো ম্যানেজ করুন</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                        <Plus className="text-indigo-600" size={20} />
                        নতুন অটো-ট্রানজ্যাকশন
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">নাম</label>
                            <input 
                                type="text" 
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="যেমন: Netflix, বাসার ভাড়া..."
                                required
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">পরিমাণ</label>
                                <input 
                                    type="number" 
                                    value={formData.amount}
                                    onChange={(e) => setFormData({...formData, amount: e.target.value})}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">ফ্রিকোয়েন্সি</label>
                                <select 
                                    value={formData.frequency}
                                    onChange={(e) => setFormData({...formData, frequency: e.target.value})}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value="daily">প্রতিদিন</option>
                                    <option value="weekly">প্রতি সপ্তাহ</option>
                                    <option value="monthly">প্রতি মাস</option>
                                    <option value="yearly">প্রতি বছর</option>
                                </select>
                            </div>
                        </div>
                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-all"
                        >
                            সেভ করুন
                        </button>
                    </form>
                </div>

                <div className="lg:col-span-2 space-y-4">
                    {recurring.map(item => (
                        <div key={item.id} className="bg-white p-5 rounded-xl border border-slate-200 flex justify-between items-center group">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                                    <RefreshCw size={20} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-900">{item.name}</h4>
                                    <p className="text-xs text-slate-400 uppercase tracking-widest">{item.frequency}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-6">
                                <div className="text-right">
                                    <p className="font-black text-slate-900">{formatCurrency(item.amount)}</p>
                                    <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                        <Calendar size={10} /> পরবর্তী: {item.next_date || 'N/A'}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => {
                                        if (confirm('আপনি কি নিশ্চিত যে আপনি এই নিয়মিত লেনদেনটি মুছে ফেলতে চান?')) {
                                            DataHub.delete('recurring_transactions', item.id);
                                        }
                                    }}
                                    className="p-2 text-slate-300 hover:text-red-600 transition-colors"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {recurring.length === 0 && (
                        <div className="text-center py-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                            <p className="text-slate-400 italic">কোনো নিয়মিত লেনদেন সেট করা নেই।</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
