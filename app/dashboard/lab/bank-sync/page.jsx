'use client';
/**
 * app/dashboard/lab/bank-sync/page.jsx
 * Bank Sync Simulation and Statement Ingestion.
 */
import { useState } from 'react';
import { DataHub } from '@/lib/data-hub';
import { Landmark, Upload, CheckCircle2, AlertTriangle, FileText, Settings2, Play } from 'lucide-react';
import { formatCurrency, parseCSV } from '@/lib/utils';

export default function BankSyncPage() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [result, setResult] = useState(null);
    const [csvData, setCsvData] = useState(null);
    const [mapping, setMapping] = useState({ date: '', amount: '', description: '' });

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const data = parseCSV(event.target.result);
            if (data.length > 0) {
                setCsvData(data);
                // Try auto-mapping
                const headers = Object.keys(data[0]);
                setMapping({
                    date: headers.find(h => h.includes('date')) || '',
                    amount: headers.find(h => h.includes('amount') || h.includes('value')) || '',
                    description: headers.find(h => h.includes('desc') || h.includes('memo')) || ''
                });
            } else {
                alert("Could not parse CSV or file is empty.");
            }
        };
        reader.readAsText(file);
    };

    const handleProcessImport = async () => {
        if (!mapping.date || !mapping.amount) {
            alert("Please map at least Date and Amount columns.");
            return;
        }

        setIsSyncing(true);
        try {
            const transactions = csvData.map(row => ({
                date: row[mapping.date],
                amount: Math.abs(parseFloat(row[mapping.amount] || 0)),
                type: parseFloat(row[mapping.amount]) >= 0 ? 'income' : 'expense',
                category_name: 'Imported',
                description: row[mapping.description] || 'Bank Import',
                metadata: { source: 'csv_import' }
            })).filter(t => !isNaN(t.amount) && t.date);

            await DataHub.batchAdd('transactions', transactions);
            setResult({ count: transactions.length });
            setCsvData(null);
        } catch (err) {
            alert("Import Failed: " + err.message);
        } finally {
            setIsSyncing(false);
        }
    };

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

            {!csvData ? (
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
                        <div className="relative border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer group">
                            <input 
                                type="file" 
                                accept=".csv"
                                onChange={handleFileUpload}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                            <Upload className="mx-auto text-slate-300 group-hover:text-blue-500 mb-2" size={32} />
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ফাইল এখানে ড্রপ করুন</p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white p-8 rounded-3xl shadow-lg border border-blue-100 space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                <Settings2 className="text-blue-600" /> কলাম ম্যাপিং
                            </h3>
                            <p className="text-slate-500">CSV ফাইলের কলামগুলো চিহ্নিত করুন</p>
                        </div>
                        <button 
                            onClick={() => setCsvData(null)}
                            className="text-xs font-bold text-slate-400 hover:text-red-500 uppercase tracking-widest"
                        >
                            বাতিল করুন
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {['date', 'amount', 'description'].map(field => (
                            <div key={field} className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{field}</label>
                                <select 
                                    value={mapping[field]}
                                    onChange={(e) => setMapping({...mapping, [field]: e.target.value})}
                                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold text-sm"
                                >
                                    <option value="">Select Column...</option>
                                    {Object.keys(csvData[0]).map(h => (
                                        <option key={h} value={h}>{h}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                        <h4 className="text-xs font-black uppercase text-slate-400 mb-4 tracking-widest">ডাটা প্রিভিউ (Top 3)</h4>
                        <div className="space-y-2">
                            {csvData.slice(0, 3).map((row, i) => (
                                <div key={i} className="text-xs font-medium text-slate-600 grid grid-cols-3 gap-4 py-2 border-b border-white">
                                    <span className="truncate">{row[mapping.date] || '-'}</span>
                                    <span className="truncate font-bold text-slate-900">{row[mapping.amount] || '-'}</span>
                                    <span className="truncate">{row[mapping.description] || '-'}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button 
                        onClick={handleProcessImport}
                        disabled={isSyncing}
                        className="w-full py-4 bg-green-600 text-white rounded-2xl font-black hover:bg-green-700 disabled:opacity-50 transition-all shadow-xl shadow-green-100 flex justify-center items-center gap-3"
                    >
                        {isSyncing ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ইমপোর্ট হচ্ছে...
                            </>
                        ) : (
                            <>
                                <Play size={20} />
                                ইমপোর্ট সম্পন্ন করুন ({csvData.length} এন্ট্রি)
                            </>
                        )}
                    </button>
                </div>
            )}

            {result && (
                <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-3xl flex items-start gap-4 animate-in zoom-in-95 duration-300">
...
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
