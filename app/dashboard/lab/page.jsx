'use client';
/**
 * app/dashboard/lab/page.jsx
 * Financial Calculators: Debt Snowball, Zakat, and EMI.
 */
import { useState, useEffect } from 'react';
import { DataHub } from '@/lib/data-hub';
import { FlaskConical, Calculator, Coins, TrendingDown } from 'lucide-react';

export default function LabPage() {
    const [debts, setDebts] = useState([]);
    const [activeTab, setActiveTab] = useState('snowball');
    const [zakatAssets, setZakatAssets] = useState('');
    const [emiData, setEmiData] = useState({ principal: '', rate: '', tenure: '' });

    useEffect(() => {
        const unsub = DataHub.sync('debts', setDebts);
        return () => unsub();
    }, []);

    const calculateSnowball = () => {
        return [...debts].sort((a, b) => a.balance - b.balance);
    };

    const calculateZakat = () => {
        const assets = parseFloat(zakatAssets || 0);
        return assets * 0.025;
    };

    const calculateEMI = () => {
        const p = parseFloat(emiData.principal || 0);
        const r = parseFloat(emiData.rate || 0) / 12 / 100;
        const n = parseFloat(emiData.tenure || 0);
        if (!p || !r || !n) return 0;
        return (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    };

    return (
        <div className="space-y-8">
            <header>
                <h2 className="text-3xl font-bold text-slate-900">ফিন্যান্সিয়াল ল্যাব (Lab)</h2>
                <p className="text-slate-500">উন্নত আর্থিক ক্যালকুলেটর ও পরিকল্পনা টুলস</p>
            </header>

            <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-fit">
                <button 
                    onClick={() => setActiveTab('snowball')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'snowball' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Debt Snowball
                </button>
                <button 
                    onClick={() => setActiveTab('zakat')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'zakat' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Zakat Calculator
                </button>
                <button 
                    onClick={() => setActiveTab('emi')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'emi' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    EMI Planner
                </button>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 min-h-[400px]">
                {activeTab === 'snowball' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex items-center gap-3 text-blue-600">
                            <TrendingDown size={24} />
                            <h3 className="text-xl font-bold">Snowball কৌশল</h3>
                        </div>
                        <p className="text-slate-500 text-sm italic">ছোট ঋণগুলো আগে পরিশোধ করে মানসিক আত্মবিশ্বাস তৈরি করুন।</p>
                        <div className="space-y-3">
                            {calculateSnowball().map((debt, idx) => (
                                <div key={debt.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
                                    <span className="w-8 h-8 flex items-center justify-center bg-blue-600 text-white rounded-full text-xs font-bold">
                                        {idx + 1}
                                    </span>
                                    <div className="flex-1">
                                        <p className="font-bold text-slate-900">{debt.name}</p>
                                        <p className="text-xs text-slate-400">Balance: ৳{debt.balance.toLocaleString()}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-bold text-blue-600 uppercase">PRIORITY</span>
                                    </div>
                                </div>
                            ))}
                            {debts.length === 0 && <p className="text-slate-400 italic">হিসাব করতে প্রথমে ঋণ যোগ করুন।</p>}
                        </div>
                    </div>
                )}

                {activeTab === 'zakat' && (
                    <div className="space-y-6 animate-in fade-in duration-300 max-w-md">
                        <div className="flex items-center gap-3 text-emerald-600">
                            <Coins size={24} />
                            <h3 className="text-xl font-bold">যাকাত ক্যালকুলেটর</h3>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">মোট যাকাতযোগ্য সম্পদ</label>
                                <input 
                                    type="number" 
                                    value={zakatAssets}
                                    onChange={(e) => setZakatAssets(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-lg font-bold"
                                    placeholder="৳ 0.00"
                                />
                            </div>
                            <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-100">
                                <p className="text-emerald-600 text-sm font-bold uppercase mb-1">প্রদেয় যাকাত (২.৫%)</p>
                                <p className="text-3xl font-black text-emerald-700">৳ {calculateZakat().toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'emi' && (
                    <div className="space-y-6 animate-in fade-in duration-300 max-w-2xl">
                        <div className="flex items-center gap-3 text-indigo-600">
                            <Calculator size={24} />
                            <h3 className="text-xl font-bold">লোন/EMI প্ল্যানার</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">মূল টাকা (Principal)</label>
                                    <input 
                                        type="number" 
                                        value={emiData.principal}
                                        onChange={(e) => setEmiData({...emiData, principal: e.target.value})}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">সুদের হার (Yearly %)</label>
                                    <input 
                                        type="number" 
                                        value={emiData.rate}
                                        onChange={(e) => setEmiData({...emiData, rate: e.target.value})}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">সময়কাল (মাস)</label>
                                    <input 
                                        type="number" 
                                        value={emiData.tenure}
                                        onChange={(e) => setEmiData({...emiData, tenure: e.target.value})}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col justify-center p-8 bg-indigo-50 rounded-2xl border border-indigo-100 text-center">
                                <p className="text-indigo-600 text-sm font-bold uppercase mb-2">মাসিক কিস্তি (EMI)</p>
                                <p className="text-4xl font-black text-indigo-900">৳ {calculateEMI().toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                                <p className="text-[10px] text-indigo-400 mt-4 italic">পরিশোধযোগ্য মোট টাকা: ৳ {(calculateEMI() * (parseFloat(emiData.tenure) || 0)).toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
