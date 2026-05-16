'use client';
/**
 * app/dashboard/transactions/page.jsx
 * Comprehensive Transaction Management with Form and List views.
 */
import { useState, useEffect } from 'react';
import { DataHub } from '@/lib/data-hub';
import { Plus, Trash2, Calendar, Tags, CreditCard, AlignLeft } from 'lucide-react';

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        amount: '',
        category_name: '',
        method: 'Cash',
        description: ''
    });

    useEffect(() => {
        const unsubTx = DataHub.sync('transactions', setTransactions, 'date');
        const unsubCat = DataHub.sync('categories', setCategories);
        return () => { unsubTx(); unsubCat(); };
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await DataHub.add('transactions', {
                ...formData,
                amount: parseFloat(formData.amount)
            });
            setFormData({ ...formData, amount: '', description: '' });
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <header>
                <h2 className="text-3xl font-bold text-slate-900">লেনদেন (Transactions)</h2>
                <p className="text-slate-500">আপনার আয় ও ব্যয়ের হিসাব রাখুন</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Transaction Form */}
                <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit sticky top-8">
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                        <Plus className="text-blue-600" size={20} />
                        নতুন লেনদেন
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">তারিখ</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                <input 
                                    type="date" 
                                    value={formData.date}
                                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">ধরণ</label>
                                <select 
                                    value={formData.type}
                                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                    <option value="expense">খরচ</option>
                                    <option value="income">আয়</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">পরিমাণ</label>
                                <input 
                                    type="number" 
                                    value={formData.amount}
                                    onChange={(e) => setFormData({...formData, amount: e.target.value})}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="৳ 0.00"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">খাত (Category)</label>
                            <div className="relative">
                                <Tags className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                <select 
                                    value={formData.category_name}
                                    onChange={(e) => setFormData({...formData, category_name: e.target.value})}
                                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    required
                                >
                                    <option value="">নির্বাচন করুন</option>
                                    {categories.filter(c => c.type === formData.type).map(cat => (
                                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">মাধ্যম (Method)</label>
                            <div className="relative">
                                <CreditCard className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                <select 
                                    value={formData.method}
                                    onChange={(e) => setFormData({...formData, method: e.target.value})}
                                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                    <option value="Cash">Cash</option>
                                    <option value="bKash">bKash</option>
                                    <option value="Bank">Bank Account</option>
                                    <option value="Nagad">Nagad</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase mb-1">বিবরণ</label>
                            <div className="relative">
                                <AlignLeft className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                <textarea 
                                    value={formData.description}
                                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px]"
                                    placeholder="অতিরিক্ত তথ্য..."
                                />
                            </div>
                        </div>

                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 shadow-md shadow-blue-200 transition-all"
                        >
                            {loading ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
                        </button>
                    </form>
                </div>

                {/* Transaction List */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-bottom border-slate-100 flex justify-between items-center">
                        <h3 className="font-semibold text-slate-800">সাম্প্রতিক লেনদেন</h3>
                        <span className="text-xs text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded">
                            {transactions.length} টি রেকর্ড
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                                <tr>
                                    <th className="px-6 py-3 font-medium">তারিখ</th>
                                    <th className="px-6 py-3 font-medium">খাত</th>
                                    <th className="px-6 py-3 font-medium">পরিমাণ</th>
                                    <th className="px-6 py-3 font-medium text-right">অ্যাকশন</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {transactions.map((tx) => (
                                    <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">{tx.date}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-slate-900">{tx.category_name}</span>
                                                <span className="text-[10px] text-slate-400">{tx.method}</span>
                                            </div>
                                        </td>
                                        <td className={`px-6 py-4 text-sm font-bold whitespace-nowrap ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                            {tx.type === 'income' ? '+' : '-'} ৳{tx.amount.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => {
                                                    if (confirm('আপনি কি নিশ্চিত যে আপনি এই লেনদেনটি মুছে ফেলতে চান?')) {
                                                        DataHub.delete('transactions', tx.id);
                                                    }
                                                }}
                                                className="p-2 text-slate-400 hover:text-red-600 transition-colors rounded-full hover:bg-red-50"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {transactions.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-12 text-center text-slate-400 italic">
                                            কোনো লেনদেন পাওয়া যায়নি।
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
