'use client';
/**
 * app/dashboard/reminders/page.jsx
 * Bill Reminders and Due Dates.
 */
import { useState, useEffect } from 'react';
import { DataHub } from '@/lib/data-hub';
import { Bell, Plus, Trash2, CalendarClock, CheckCircle2 } from 'lucide-react';

export default function RemindersPage() {
    const [reminders, setReminders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ title: '', due_date: '', amount: '' });

    useEffect(() => {
        const unsub = DataHub.sync('bill_reminders', setReminders, 'due_date');
        return () => unsub();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await DataHub.add('bill_reminders', {
                ...formData,
                amount: parseFloat(formData.amount || 0)
            });
            setFormData({ title: '', due_date: '', amount: '' });
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <header>
                <h2 className="text-3xl font-bold text-slate-900">রিমাইন্ডার (Reminders)</h2>
                <p className="text-slate-500">আসন্ন বিল ও পেমেন্টের তারিখ মনে রাখুন</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                        <Plus className="text-blue-600" size={20} />
                        নতুন রিমাইন্ডার
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">বিল/পেমেন্টের নাম</label>
                            <input 
                                type="text" 
                                value={formData.title}
                                onChange={(e) => setFormData({...formData, title: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="যেমন: ইন্টারনেট বিল, বিদ্যুৎ বিল..."
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">শেষ তারিখ (Due Date)</label>
                            <input 
                                type="date" 
                                value={formData.due_date}
                                onChange={(e) => setFormData({...formData, due_date: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">পরিমাণ (ঐচ্ছিক)</label>
                            <input 
                                type="number" 
                                value={formData.amount}
                                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="৳ 0.00"
                            />
                        </div>
                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 disabled:opacity-50 transition-all shadow-md shadow-slate-200"
                        >
                            রিমাইন্ডার সেট করুন
                        </button>
                    </form>
                </div>

                <div className="lg:col-span-2 space-y-4">
                    {reminders.map(rem => {
                        const isOverdue = new Date(rem.due_date) < new Date();
                        return (
                            <div key={rem.id} className={`bg-white p-6 rounded-xl shadow-sm border ${isOverdue ? 'border-red-100 bg-red-50/20' : 'border-slate-200'} flex items-center justify-between group`}>
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-lg ${isOverdue ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                                        <CalendarClock size={24} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900">{rem.title}</h4>
                                        <div className="flex gap-3 mt-1">
                                            <span className={`text-[10px] font-bold uppercase ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
                                                DUE: {rem.due_date}
                                            </span>
                                            {rem.amount > 0 && (
                                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                                                    ৳{rem.amount.toLocaleString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <button 
                                        onClick={() => DataHub.delete('bill_reminders', rem.id)}
                                        className="p-2 text-slate-300 hover:text-green-600 transition-colors rounded-lg hover:bg-green-50 flex items-center gap-1 group/btn"
                                    >
                                        <span className="text-[10px] font-bold opacity-0 group-hover/btn:opacity-100 transition-opacity">DONE</span>
                                        <CheckCircle2 size={20} />
                                    </button>
                                    <button 
                                        onClick={() => DataHub.delete('bill_reminders', rem.id)}
                                        className="p-2 text-slate-300 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {reminders.length === 0 && (
                        <div className="text-center py-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                            <Bell className="mx-auto text-slate-300 mb-4" size={48} />
                            <p className="text-slate-400 italic">কোনো আসন্ন রিমাইন্ডার নেই।</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
