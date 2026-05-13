'use client';
/**
 * app/dashboard/page.jsx (Overview)
 * The main dashboard landing page.
 */
import { useState, useEffect } from 'react';
import FinancialChart from '@/components/FinancialChart';
import { DataHub } from '@/lib/data-hub';
import { formatCurrency } from '@/lib/utils';
import { COLORS } from '@/lib/constants';

export default function DashboardOverview() {
    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });

    useEffect(() => {
        const unsub = DataHub.sync('transactions', (data) => {
            setTransactions(data);
            setSummary(DataHub.getFinancialSummary(data));
        }, 'date');

        return () => unsub();
    }, []);

    // Calculate dynamic chart data based on real transactions
    const months = [...new Set(transactions.map(t => t.date.substring(0, 7)))].sort().slice(-6);
    const chartData = {
        labels: months.map(m => {
            const [y, mm] = m.split('-');
            const date = new Date(y, parseInt(mm) - 1);
            return date.toLocaleString('default', { month: 'short' });
        }),
        datasets: [
            { 
                label: 'আয়', 
                data: months.map(m => transactions
                    .filter(t => t.type === 'income' && t.date.startsWith(m))
                    .reduce((s, t) => s + t.amount, 0)
                ), 
                borderColor: COLORS.income,
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                fill: true,
                tension: 0.4
            },
            { 
                label: 'ব্যয়', 
                data: months.map(m => transactions
                    .filter(t => t.type === 'expense' && t.date.startsWith(m))
                    .reduce((s, t) => s + t.amount, 0)
                ), 
                borderColor: COLORS.expense,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                fill: true,
                tension: 0.4
            }
        ]
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 tracking-tight">সারসংক্ষেপ</h2>
                    <p className="text-slate-500">আপনার আর্থিক অবস্থার বর্তমান চিত্র</p>
                </div>
                <div className="px-4 py-2 bg-white rounded-lg shadow-sm border border-slate-200">
                    <span className="text-xs text-slate-400 uppercase block">সার্বিক ব্যালেন্স</span>
                    <span className={`text-xl font-bold ${summary.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(summary.balance)}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
                    <h3 className="text-slate-500 text-sm font-medium mb-2">মোট আয়</h3>
                    <p className="text-2xl font-bold text-slate-900">{formatCurrency(summary.income)}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500">
                    <h3 className="text-slate-500 text-sm font-medium mb-2">মোট খরচ</h3>
                    <p className="text-2xl font-bold text-slate-900">{formatCurrency(summary.expense)}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
                    <h3 className="text-slate-500 text-sm font-medium mb-2">সঞ্চয়</h3>
                    <p className="text-2xl font-bold text-slate-900">{formatCurrency(summary.balance)}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 min-h-[400px]">
                    <h3 className="text-lg font-semibold mb-4">আয় বনাম ব্যয় ট্রেন্ড</h3>
                    <FinancialChart type="line" data={chartData} />
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-lg font-semibold mb-4">সাম্প্রতিক লেনদেন</h3>
                    <div className="space-y-4">
                        {transactions.slice(0, 5).map(tx => (
                            <div key={tx.id} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-lg transition-colors">
                                <div>
                                    <p className="font-medium text-slate-900">{tx.category_name}</p>
                                    <p className="text-xs text-slate-400">{tx.date}</p>
                                </div>
                                <span className={`font-bold ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                    {tx.type === 'income' ? '+' : '-'} ৳{tx.amount}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
