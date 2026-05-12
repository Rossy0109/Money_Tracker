'use client';
/**
 * app/dashboard/accountant/page.jsx
 * Specialized simplified view for the Accountant role.
 */
import { useEffect, useState } from 'react';
import { DataHub } from '@/lib/data-hub';
import { formatCurrency } from '@/lib/utils';
import { Calculator, Receipt, TrendingUp } from 'lucide-react';

export default function AccountantView() {
    const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
    const [txCount, setTxCount] = useState(0);

    useEffect(() => {
        const unsub = DataHub.sync('transactions', (data) => {
            setSummary(DataHub.getFinancialSummary(data));
            setTxCount(data.length);
        });
        return () => unsub();
    }, []);

    return (
        <div className="space-y-8">
            <header>
                <h2 className="text-3xl font-bold text-slate-900">অ্যাকাউন্ট্যান্ট ড্যাশবোর্ড</h2>
                <p className="text-slate-500">আপনার লেনদেন এন্ট্রি এবং ব্যালেন্স চেক করুন</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
                    <div className="p-4 bg-blue-50 text-blue-600 rounded-xl">
                        <Receipt size={32} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">মোট লেনদেন</p>
                        <p className="text-3xl font-black text-slate-900">{txCount}</p>
                    </div>
                </div>
                
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
                    <div className="p-4 bg-emerald-50 text-emerald-600 rounded-xl">
                        <Calculator size={32} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">বর্তমান ব্যালেন্স</p>
                        <p className="text-3xl font-black text-slate-900">{formatCurrency(summary.balance)}</p>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
                    <div className="p-4 bg-purple-50 text-purple-600 rounded-xl">
                        <TrendingUp size={32} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">মোট আয়</p>
                        <p className="text-3xl font-black text-slate-900">{formatCurrency(summary.income)}</p>
                    </div>
                </div>
            </div>

            <div className="p-12 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <p className="text-slate-400 italic">অ্যাকাউন্ট্যান্টদের জন্য বিশেষ রিপোর্টিং টুলস শীঘ্রই আসছে।</p>
            </div>
        </div>
    );
}
