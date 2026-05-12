'use client';
/**
 * app/dashboard/categories/page.jsx
 * Standalone Category Management.
 */
import { useState, useEffect } from 'react';
import { DataHub } from '@/lib/data-hub';
import { Plus, Tag, Trash2, FolderSearch } from 'lucide-react';

export default function CategoriesPage() {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ name: '', type: 'expense' });

    useEffect(() => {
        const unsub = DataHub.sync('categories', setCategories);
        return () => unsub();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await DataHub.add('categories', formData);
            setFormData({ ...formData, name: '' });
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 max-w-4xl mx-auto">
            <header>
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">হিসাবের খাত (Categories)</h2>
                <p className="text-slate-500">আপনার লেনদেনের জন্য ক্যাটাগরি তৈরি ও ম্যানেজ করুন</p>
            </header>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <form onSubmit={handleSubmit} className="flex gap-4 items-end">
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-500 uppercase mb-1">ক্যাটাগরির নাম</label>
                        <div className="relative">
                            <Tag className="absolute left-3 top-2.5 text-slate-400" size={16} />
                            <input 
                                type="text" 
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="যেমন: বাজার খরচ, যাতায়াত..."
                                required
                            />
                        </div>
                    </div>
                    <div className="w-40">
                        <label className="block text-xs font-medium text-slate-500 uppercase mb-1">ধরণ</label>
                        <select 
                            value={formData.type}
                            onChange={(e) => setFormData({...formData, type: e.target.value})}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="expense">খরচ (Expense)</option>
                            <option value="income">আয় (Income)</option>
                        </select>
                    </div>
                    <button 
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                        <Plus size={18} /> যোগ করুন
                    </button>
                </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {['income', 'expense'].map((type) => (
                    <div key={type} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className={`p-4 border-b ${type === 'income' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                            <h3 className={`font-bold flex items-center gap-2 ${type === 'income' ? 'text-emerald-700' : 'text-red-700'}`}>
                                <FolderSearch size={18} />
                                {type === 'income' ? 'আয় ক্যাটাগরি' : 'ব্যয় ক্যাটাগরি'}
                            </h3>
                        </div>
                        <div className="p-4 space-y-2">
                            {categories.filter(c => c.type === type).map(cat => (
                                <div key={cat.id} className="flex justify-between items-center p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors group">
                                    <span className="text-sm font-medium text-slate-700">{cat.name}</span>
                                    <button 
                                        onClick={() => DataHub.delete('categories', cat.id)}
                                        className="text-slate-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                            {categories.filter(c => c.type === type).length === 0 && (
                                <p className="text-center py-6 text-slate-400 text-sm italic">কোনো ক্যাটাগরি নেই।</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
