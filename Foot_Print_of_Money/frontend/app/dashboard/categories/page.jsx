'use client';
import { useState, useEffect } from 'react';
import { DataHub } from '@/lib/data-hub';
import { Plus, Trash2, Tags } from 'lucide-react';

export default function CategoriesPage() {
    const [categories, setCategories] = useState([]);
    const [formData, setFormData] = useState({ name: '', type: 'expense' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const sync = DataHub.sync('categories', setCategories);
        return () => { if (typeof sync === 'function') sync(); };
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await DataHub.add('categories', formData);
            setFormData({ name: '', type: 'expense' });
        } catch (err) { alert(err.message); } finally { setLoading(false); }
    };

    return (
        <div className="space-y-6">
            <header>
                <h2 className="text-3xl font-bold text-slate-900">ক্যাটাগরি ম্যানেজমেন্ট</h2>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
                    <h3 className="font-semibold text-lg mb-4">নতুন ক্যাটাগরি</h3>
                    <input type="text" placeholder="ক্যাটাগরির নাম" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border rounded-lg" required />
                    <select value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})} className="w-full px-3 py-2 border rounded-lg">
                        <option value="expense">খরচ</option>
                        <option value="income">আয়</option>
                    </select>
                    <button className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold">সেভ করুন</button>
                </form>
                <div className="bg-white p-6 rounded-xl border border-slate-200">
                    <h3 className="font-semibold text-lg mb-4">ক্যাটাগরি লিস্ট</h3>
                    <div className="space-y-2">
                        {categories.map(c => (
                            <div key={c.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                                <span className="font-medium text-slate-700">{c.name} ({c.type})</span>
                                <button onClick={() => DataHub.delete('categories', c.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
