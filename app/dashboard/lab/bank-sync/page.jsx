'use client';
/**
 * app/dashboard/lab/bank-sync/page.jsx
 * Bank Sync Simulation and Statement Ingestion.
 */
import { useState } from 'react';
import { DataHub } from '@/lib/data-hub';
import { Landmark, Upload, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export default function BankSyncPage() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [result, setResult] = useState(null);

    const simulateSync = async () => {
        setIsSyncing(true);
        setResult(null);
        
        // Artificial delay for realism
        await new Promise(r => setTimeout(r, 2500));

        const dummyTx = [
            { date: new Date().toISOString().split('T')[0], amount: 1500, type: 'expense', category_name: 'বাজার খরচ', description: 'Bank Sync: Supermarket' },
            { date: new Date().toISOString().split('T')[0], amount: 45000, type: 'income', category_name: 'বেতন (Salary)', description: 'Bank Sync: Monthly Salary' }
        ];

        try {
            await DataHub.batchAdd('transactions', dummyTx);
            setResult({ count: dummyTx.length, total: 46500 });
        } catch (err) {
            alert(err.message);
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <header>
                <h2 className="text-3xl font-bold text-slate-900">ব্যাংক সিংক্রোনাইজেশন</h2>
                <p className="text-slate-500">আপনার ব্যাংক স্টেটমেন্ট সরাসরি অ্যাপে যুক্ত করুন</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 space-y-6">
                    <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl w-fit">
                        <Landmark size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">অটোমেটিক সিংক্রোনাইজেশন</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                        আপনার ব্যাংক অ্যাকাউন্টের সাথে নিরাপদ সংযোগ স্থাপন করুন। আমরা আপনার পেমেন্ট হিস্টোরি স্ক্যান করে অটোমেটিক এন্ট্রি তৈরি করব।
                    </p>
                    <button 
                        onClick={simulateSync}
                        disabled={isSyncing}
                        className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 disabled:opacity-50 transition-all flex justify-center items-center gap-3"
                    >
                        {isSyncing ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                সিংক্রোনাইজ হচ্ছে...
                            </>
                        ) : (
                            <>সংযুক্ত করুন</>
                        )}
                    </button>
                </div>

                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 space-y-6">
                    <div className="p-4 bg-slate-50 text-slate-600 rounded-2xl w-fit">
                        <FileText size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">স্টেটমেন্ট আপলোড (CSV)</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                        যদি আপনার ব্যাংক অটো-সিংক্রোনাইজেশন সাপোর্ট না করে, তবে সরাসরি CSV ফাইল আপলোড করুন।
                    </p>
                    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer group">
                        <Upload className="mx-auto text-slate-300 group-hover:text-blue-500 mb-2" size={32} />
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ফাইল এখানে ড্রপ করুন</p>
                    </div>
                </div>
            </div>

            {result && (
                <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-3xl flex items-start gap-4 animate-in zoom-in-95 duration-300">
                    <div className="p-2 bg-emerald-500 text-white rounded-full">
                        <CheckCircle2 size={24} />
                    </div>
                    <div>
                        <h4 className="font-bold text-emerald-900">সফলভাবে সিংক্রোনাইজ হয়েছে!</h4>
                        <p className="text-sm text-emerald-700 mt-1">
                            আমরা <strong>{result.count} টি নতুন লেনদেন</strong> খুঁজে পেয়েছি এবং আপনার লেজারে যুক্ত করেছি।
                        </p>
                    </div>
                </div>
            )}

            <div className="p-6 bg-amber-50 rounded-2xl flex items-start gap-4">
                <AlertTriangle className="text-amber-500 shrink-0" size={24} />
                <p className="text-xs text-amber-800 leading-relaxed">
                    <strong>নিরাপত্তা সতর্কতা:</strong> আমরা কখনোই আপনার ব্যাংকের লগইন পাসওয়ার্ড বা পিন নম্বর সেভ করি না। এই প্রসেসটি শুধুমাত্র রিড-অনলি (Read-only) মোডে কাজ করে।
                </p>
            </div>
        </div>
    );
}
