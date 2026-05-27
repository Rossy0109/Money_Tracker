'use client';
import { useState, useEffect } from 'react';
import { DataHub } from '@/lib/data-hub';
import { formatCurrency } from '@/lib/utils';

export default function DashboardOverview() {
    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });

    useEffect(() => {
        const unsub = DataHub.sync('transactions', (data) => {
            setTransactions(data || []);
            setSummary(DataHub.getFinancialSummary(data || []));
        }, 'date');

        return () => unsub();
    }, []);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <p className="text-sm font-medium text-slate-500 mb-1">মোট ব্যালেন্স</p>
                    <h2 className="text-3xl font-black text-slate-900">{formatCurrency(summary.balance)}</h2>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <p className="text-sm font-medium text-slate-500 mb-1">মোট আয়</p>
                    <h2 className="text-3xl font-black text-emerald-600">{formatCurrency(summary.income)}</h2>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <p className="text-sm font-medium text-slate-500 mb-1">মোট খরচ</p>
                    <h2 className="text-3xl font-black text-rose-600">{formatCurrency(summary.expense)}</h2>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-50">
                    <h3 className="font-bold text-slate-800">সাম্প্রতিক লেনদেন</h3>
                </div>
                <div className="divide-y divide-slate-50">
                    {transactions.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">কোন লেনদেন পাওয়া যায়নি।</div>
                    ) : (
                        transactions.slice(0, 5).map((t) => (
                            <div key={t.id} className="px-6 py-4 flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-slate-800">{t.description || 'বিবরণ নেই'}</p>
                                    <p className="text-xs text-slate-500">{t.date}</p>
                                </div>
                                <p className={`font-black ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                                </p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
