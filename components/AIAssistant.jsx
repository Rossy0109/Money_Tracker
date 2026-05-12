'use client';
/**
 * components/AIAssistant.jsx
 * Interactive AI Chat FAB.
 * Connects to /api/audit for financial insights.
 */
import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Sparkles, Loader2 } from 'lucide-react';
import { DataHub } from '@/lib/data-hub';

export default function AIAssistant() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'assistant', text: 'হ্যালো! আমি আপনার আর্থিক বন্ধু। আপনার লেনদেন বা বাজেট নিয়ে কোনো প্রশ্ন আছে?' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setLoading(true);

        try {
            // Fetch real data to provide context to AI using the new one-time get method
            const txData = await DataHub.get('transactions', 'date');
            
            const response = await fetch('/api/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transactions: txData.slice(0, 50), query: userMsg })
            });

            if (!response.ok) throw new Error("AI is currently unavailable.");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let aiText = '';

            setMessages(prev => [...prev, { role: 'assistant', text: '' }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                aiText += chunk;
                
                setMessages(prev => {
                    const last = prev[prev.length - 1];
                    const others = prev.slice(0, -1);
                    return [...others, { ...last, text: aiText }];
                });
            }
        } catch (err) {
            setMessages(prev => [...prev, { role: 'assistant', text: 'দুঃখিত, বর্তমানে সমস্যা হচ্ছে। আবার চেষ্টা করুন।' }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-50">
            {isOpen ? (
                <div className="w-80 md:w-96 h-[500px] bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
                    <header className="bg-slate-900 p-4 text-white flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-blue-500 rounded-lg">
                                <Bot size={18} />
                            </div>
                            <span className="font-bold text-sm tracking-tight">AI Financial Assistant</span>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="hover:bg-slate-800 p-1 rounded-md transition-colors">
                            <X size={20} />
                        </button>
                    </header>

                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                                    m.role === 'user' 
                                        ? 'bg-blue-600 text-white rounded-tr-none' 
                                        : 'bg-white text-slate-800 border border-slate-100 shadow-sm rounded-tl-none'
                                }`}>
                                    {m.text}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm rounded-tl-none">
                                    <Loader2 className="animate-spin text-blue-600" size={18} />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-slate-100 bg-white">
                        <div className="flex gap-2 bg-slate-50 rounded-2xl px-4 py-2 border border-slate-100 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                            <input 
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="একটি প্রশ্ন লিখুন..."
                                className="flex-1 bg-transparent border-none outline-none text-sm py-1.5"
                            />
                            <button 
                                onClick={handleSend}
                                disabled={!input.trim() || loading}
                                className="text-blue-600 disabled:text-slate-300 transition-colors"
                            >
                                <Send size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <button 
                    onClick={() => setIsOpen(true)}
                    className="p-4 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all hover:scale-110 active:scale-95 group relative"
                >
                    <div className="absolute -top-1 -right-1 p-1.5 bg-red-500 rounded-full animate-pulse border-2 border-white" />
                    <Sparkles className="group-hover:rotate-12 transition-transform" size={28} />
                </button>
            )}
        </div>
    );
}
