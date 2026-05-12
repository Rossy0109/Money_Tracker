'use client';
/**
 * app/dashboard/reports/page.jsx
 * Data Export and Filtering Engine.
 */
import { useState, useEffect } from 'react';
import { DataHub } from '@/lib/data-hub';
import { exportToCSV, formatCurrency } from '@/lib/utils';
import { FileText, Download, Filter, Search, Table as TableIcon } from 'lucide-react';

export default function ReportsPage() {
    const [transactions, setTransactions] = useState([]);
    const [filtered, setFiltered] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');

    useEffect(() => {
        const unsub = DataHub.sync('transactions', (data) => {
            setTransactions(data);
            setFiltered(data);
        }, 'date');
        return () => unsub();
    }, []);

    useEffect(() => {
        let results = transactions;
        if (searchTerm) {
            results = results.filter(t => 
                t.category_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                t.description?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        if (typeFilter !== 'all') {
            results = results.filter(t => t.type === typeFilter);
        }
        setFiltered(results);
    }, [searchTerm, typeFilter, transactions]);

    const handleExport = () => {
        const headers = ['Date', 'Type', 'Category', 'Amount', 'Method', 'Description'];
        const rows = filtered.map(t => [
            t.date,
            t.type,
            t.category_name,
            t.amount,
            t.method,
            t.description || ''
        ]);
        exportToCSV('money_footprint_report', headers, rows);
    };

    return (
        <div className="space-y-8">
            <header className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900">রিপোর্ট (Reports)</h2>
                    <p className="text-slate-500">আপনার লেনদেনের বিস্তারিত তালিকা ও এক্সপোর্ট</p>
                </div>
                <button 
                    onClick={handleExport}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all font-medium text-sm shadow-lg shadow-slate-200"
                >
                    <Download size={18} /> CSV ডাউনলোড
                </button>
            </header>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                        type="text"
                        placeholder="খাত বা বিবরণ খুঁজুন..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="text-slate-400" size={18} />
                    <select 
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="bg-slate-50 border-none rounded-lg px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="all">সব লেনদেন</option>
                        <option value="income">শুধুমাত্র আয়</option>
                        <option value="expense">শুধুমাত্র ব্যয়</option>
                    </select>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                            <tr>
                                <th className="px-6 py-4">তারিখ</th>
                                <th className="px-6 py-4">ধরণ</th>
                                <th className="px-6 py-4">খাত</th>
                                <th className="px-6 py-4">পরিমাণ</th>
                                <th className="px-6 py-4">মাধ্যম</th>
                                <th className="px-6 py-4">বিবরণ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.map((tx) => (
                                <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors text-sm">
                                    <td className="px-6 py-4 text-slate-600 whitespace-nowrap font-mono">{tx.date}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${tx.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {tx.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-900">{tx.category_name}</td>
                                    <td className={`px-6 py-4 font-black ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                        ৳{tx.amount.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-slate-500">{tx.method}</td>
                                    <td className="px-6 py-4 text-slate-400 italic max-w-xs truncate">{tx.description}</td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="px-6 py-20 text-center text-slate-400 italic">
                                        <TableIcon className="mx-auto mb-4 opacity-20" size={48} />
                                        কোনো রেকর্ড পাওয়া যায়নি।
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
