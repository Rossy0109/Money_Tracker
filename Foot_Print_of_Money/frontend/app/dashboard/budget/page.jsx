import React from 'react';

export default function BudgetPage() {
    return (
        <div className="space-y-6">
            <header className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-slate-800">বাজেট ম্যানেজমেন্ট</h1>
                <button className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                    নতুন বাজেট তৈরি করুন
                </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Placeholder Stats */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-slate-500 font-medium">মোট বাজেট</h3>
                    <p className="text-3xl font-bold text-slate-900 mt-2">৳ ৫০,০০০</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-slate-500 font-medium">ব্যবহৃত</h3>
                    <p className="text-3xl font-bold text-blue-600 mt-2">৳ ৩০,০০০</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-slate-500 font-medium">অবশিষ্ট</h3>
                    <p className="text-3xl font-bold text-emerald-600 mt-2">৳ ২০,০০০</p>
                </div>
            </div>

            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                <h2 className="text-xl font-semibold mb-6">চলতি মাসের বাজেট পরিস্থিতি</h2>
                <div className="space-y-4">
                    {/* Placeholder Rows */}
                    {[
                        { name: 'খাবার', spent: 12000, limit: 15000 },
                        { name: 'ভাড়া', spent: 10000, limit: 10000 },
                        { name: 'পরিবহন', spent: 8000, limit: 5000 },
                    ].map((item, idx) => (
                        <div key={idx} className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="font-medium text-slate-700">{item.name}</span>
                                <span className="text-slate-500">৳ {item.spent} / ৳ {item.limit}</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2">
                                <div 
                                    className={`h-2 rounded-full ${item.spent > item.limit ? 'bg-red-500' : 'bg-blue-600'}`} 
                                    style={{ width: `${Math.min(100, (item.spent / item.limit) * 100)}%` }}
                                ></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
