'use client';
/**
 * app/dashboard/projects/page.jsx
 * Multi-project Management.
 */
import { useState, useEffect } from 'react';
import { DataHub } from '@/lib/data-hub';
import { Briefcase, Plus, Trash2, CheckCircle2, Clock } from 'lucide-react';

export default function ProjectsPage() {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ name: '', budget: '', status: 'active' });

    useEffect(() => {
        const unsub = DataHub.sync('projects', setProjects);
        return () => unsub();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await DataHub.add('projects', {
                ...formData,
                budget: parseFloat(formData.budget || 0)
            });
            setFormData({ name: '', budget: '', status: 'active' });
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <header>
                <h2 className="text-3xl font-bold text-slate-900">প্রজেক্টসমূহ (Projects)</h2>
                <p className="text-slate-500">আপনার বিভিন্ন প্রজেক্ট বা ব্যবসার আলাদা হিসাব রাখুন</p>
            </header>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <Plus className="text-blue-600" size={20} />
                    নতুন প্রজেক্ট তৈরি করুন
                </h3>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-slate-500 uppercase mb-1">প্রজেক্টের নাম</label>
                        <input 
                            type="text" 
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="যেমন: আমিন কন্সট্রাকশন, ফ্যামিলি ট্রিপ..."
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 uppercase mb-1">বাজেট (ঐচ্ছিক)</label>
                        <input 
                            type="number" 
                            value={formData.budget}
                            onChange={(e) => setFormData({...formData, budget: e.target.value})}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="৳ 0.00"
                        />
                    </div>
                    <button 
                        type="submit"
                        disabled={loading}
                        className="py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md shadow-blue-100"
                    >
                        প্রজেক্ট খুলুন
                    </button>
                </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map(proj => (
                    <div key={proj.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 group relative">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-slate-50 rounded-lg text-slate-600">
                                <Briefcase size={24} />
                            </div>
                            <button 
                                onClick={() => DataHub.delete('projects', proj.id)}
                                className="text-slate-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                        <h4 className="text-xl font-bold text-slate-900 mb-1">{proj.name}</h4>
                        <p className="text-sm text-slate-500 mb-4">বাজেট: ৳{proj.budget?.toLocaleString() || 0}</p>
                        
                        <div className="flex items-center gap-2">
                            {proj.status === 'active' ? (
                                <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">
                                    <Clock size={12} /> সচল (Active)
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 text-xs font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
                                    <CheckCircle2 size={12} /> সম্পন্ন (Completed)
                                </span>
                            )}
                        </div>
                    </div>
                ))}
                {projects.length === 0 && (
                    <div className="col-span-full text-center py-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                        <Briefcase className="mx-auto text-slate-300 mb-4" size={48} />
                        <p className="text-slate-400 italic">কোনো প্রজেক্ট পাওয়া যায়নি।</p>
                    </div>
                )}
            </div>
        </div>
    );
}
