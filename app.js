import { supabaseClient } from './src/modules/supabase.js';
import { handleAuth, toggleAuthMode, logout, getUser } from './src/modules/auth.js';

// --- Global State ---
let currentLang = localStorage.getItem('app_lang') || 'en';
let currency = localStorage.getItem('base_currency') || '৳';
let charts = { main: null, pie: null };
let allTransactions = [];

// --- Localization Dictionary ---
const dict = {
    en: {
        "auth.login": "Login", "auth.signup": "Sign Up", "auth.email": "Email", "auth.password": "Password", "auth.github": "Login with GitHub", "auth.or": "OR EMAIL", "auth.signup_link": "Don't have an account? Sign Up", "auth.login_link": "Already have an account? Login",
        "nav.dashboard": "Dashboard", "nav.add": "Add", "nav.accounting": "Accounting", "nav.reports": "Reports", "nav.lab": "Lab", "nav.settings": "Settings", "nav.logout": "Logout",
        "dash.balance": "Total Balance", "dash.income": "Income", "dash.expense": "Expense", "dash.assistant_title": "🤖 Financial Assistant", "dash.visuals": "📊 Visual Analytics", "dash.recent": "Recent Transactions", "dash.search": "Search...", "dash.load_more": "Load More", "dash.view_period": "View Period:", "dash.loading": "Loading your financial pulse...",
        "add.title": "New Transaction", "add.amount": "Amount", "add.type": "Type", "add.income": "Income", "add.expense": "Expense", "add.category": "Category", "add.sector": "Sector (Project)", "add.method": "Account (Method)", "add.note": "Note (optional)", "add.save": "Save Transaction",
        "acc.title": "Financial Accounting", "acc.pnl": "P&L", "acc.balance": "Balance", "acc.budget": "Budgets", "acc.recurring": "Recurring", "acc.estimates": "Estimates", "acc.assets": "Assets", "acc.liabilities": "Liabilities", "acc.networth": "Net Worth", "acc.add_asset": "➕ Add Asset", "acc.asset_name": "Account Name", "acc.balance_placeholder": "Balance", "acc.save": "Save", "acc.set_budget": "Set Monthly Budget", "acc.limit_placeholder": "Limit", "acc.new_recurring": "New Recurring", "acc.name_placeholder": "Name", "acc.enable_auto": "Enable Auto-Add",
        "reports.title": "Generate Reports", "reports.download_pdf": "📥 Download PDF", "reports.download_csv": "📊 Export CSV", "reports.all_sectors": "All Sectors", "reports.date": "Date", "reports.category": "Category", "reports.sector": "Sector", "reports.amount": "Amount", "reports.statement": "Financial Statement Report",
        "lab.title": "Financial Lab", "lab.zakat": "Zakat", "lab.emi": "EMI", "lab.payable": "PAYABLE ZAKAT (2.5%)", "lab.assets_placeholder": "Assets",
        "settings.global": "🌍 Global Preferences", "settings.currency": "Base Currency", "settings.security": "🔒 Security (PIN)", "settings.pin_placeholder": "Enter PIN", "settings.save_pin": "Save PIN", "settings.clear_pin": "Clear PIN", "settings.data": "📥 Data Sovereignty", "settings.export": "Export JSON", "settings.import": "Import JSON",
        "sectors.general": "General", "sectors.personal": "Personal", "sectors.business": "Business", "sectors.social": "Social",
        "methods.cash": "Cash", "methods.bank": "Bank"
    },
    bn: {
        "auth.login": "লগইন", "auth.signup": "সাইন আপ", "auth.email": "ইমেইল", "auth.password": "পাসওয়ার্ড", "auth.github": "GitHub দিয়ে লগইন", "auth.or": "অথবা ইমেইল", "auth.signup_link": "অ্যাকাউন্ট নেই? সাইন আপ করুন", "auth.login_link": "অ্যাকাউন্ট আছে? লগইন করুন",
        "nav.dashboard": "ড্যাশবোর্ড", "nav.add": "যুক্ত করুন", "nav.accounting": "অ্যাকাউন্টিং", "nav.reports": "রিপোর্ট", "nav.lab": "ল্যাব", "nav.settings": "সেটিংস", "nav.logout": "লগআউট",
        "dash.balance": "মোট ব্যালেন্স", "dash.income": "আয়", "dash.expense": "ব্যয়", "dash.assistant_title": "🤖 আর্থিক সহকারী", "dash.visuals": "📊 ভিজ্যুয়াল অ্যানালিটিক্স", "dash.recent": "সাম্প্রতিক লেনদেন", "dash.search": "খুঁজুন...", "dash.load_more": "আরো দেখুন", "dash.view_period": "সময়কাল:", "dash.loading": "আপনার আর্থিক অবস্থা বিশ্লেষণ করা হচ্ছে...",
        "add.title": "নতুন লেনদেন", "add.amount": "পরিমাণ", "add.type": "ধরণ", "add.income": "আয়", "add.expense": "ব্যয়", "add.category": "ক্যাটাগরি", "add.sector": "সেক্টর (প্রজেক্ট)", "add.method": "অ্যাকাউন্ট (পদ্ধতি)", "add.note": "নোট (ঐচ্ছিক)", "add.save": "সংরক্ষণ করুন",
        "acc.title": "আর্থিক অ্যাকাউন্টিং", "acc.pnl": "লাভ-ক্ষতি", "acc.balance": "ব্যালেন্স শিট", "acc.budget": "বাজেট", "acc.recurring": "পুনরাবৃত্ত", "acc.estimates": "এস্টিমেট", "acc.assets": "সম্পদ", "acc.liabilities": "দায় (ঋণ)", "acc.networth": "নিট সম্পদ", "acc.add_asset": "➕ সম্পদ যুক্ত করুন", "acc.asset_name": "অ্যাকাউন্টের নাম", "acc.balance_placeholder": "ব্যালেন্স", "acc.save": "সেভ", "acc.set_budget": "মাসিক বাজেট সেট করুন", "acc.limit_placeholder": "সীমা", "acc.new_recurring": "নতুন অটো লেনদেন", "acc.name_placeholder": "নাম", "acc.enable_auto": "অটো-অ্যাড চালু করুন",
        "reports.title": "রিপোর্ট তৈরি করুন", "reports.download_pdf": "📥 PDF ডাউনলোড", "reports.download_csv": "📊 CSV এক্সপোর্ট", "reports.all_sectors": "সব সেক্টর", "reports.date": "তারিখ", "reports.category": "ক্যাটাগরি", "reports.sector": "সেক্টর", "reports.amount": "পরিমাণ", "reports.statement": "আর্থিক বিবরণী রিপোর্ট",
        "lab.title": "ফাইনান্সিয়াল ল্যাব", "lab.zakat": "যাকাত", "lab.emi": "কিস্তি (EMI)", "lab.payable": "প্রদেয় যাকাত (২.৫%)", "lab.assets_placeholder": "সম্পদ",
        "settings.global": "🌍 গ্লোবাল সেটিংস", "settings.currency": "বেস কারেন্সি", "settings.security": "🔒 নিরাপত্তা (PIN)", "settings.pin_placeholder": "PIN দিন", "settings.save_pin": "PIN সেভ করুন", "settings.clear_pin": "PIN মুছুন", "settings.data": "📥 ডাটা ব্যাকআপ", "settings.export": "JSON এক্সপোর্ট", "settings.import": "JSON ইমপোর্ট",
        "sectors.general": "সাধারণ", "sectors.personal": "ব্যক্তিগত", "sectors.business": "ব্যবসায়িক", "sectors.social": "সামাজিক",
        "methods.cash": "নগদ", "methods.bank": "ব্যাংক"
    }
};

// --- DOM Initialization ---
const authForm = document.getElementById('auth-form');
const transactionForm = document.getElementById('transaction-form');
const transactionList = document.getElementById('transaction-list');
const dashboardMonth = document.getElementById('dashboard-month');
dashboardMonth.value = new Date().toISOString().substring(0, 7);

// --- Event Listeners & State Binding ---
document.getElementById('lang-toggle-btn').onclick = () => { currentLang = currentLang === 'en' ? 'bn' : 'en'; localStorage.setItem('app_lang', currentLang); applyLocales(); fetchData(); };

authForm.onsubmit = handleAuth;
document.getElementById('github-login-btn').onclick = () => supabaseClient.auth.signInWithOAuth({ 
    provider: 'github',
    options: { redirectTo: window.location.origin } 
});

document.getElementById('toggle-auth').onclick = () => {
    toggleAuthMode(!isSignup);
    document.getElementById('auth-title').innerText = isSignup ? DICTIONARY[currentLang]["auth.signup"] : DICTIONARY[currentLang]["auth.login"];
    document.getElementById('submit-btn').innerText = isSignup ? DICTIONARY[currentLang]["auth.signup"] : DICTIONARY[currentLang]["auth.login"];
    document.getElementById('toggle-auth').innerText = isSignup ? DICTIONARY[currentLang]["auth.login_link"] : DICTIONARY[currentLang]["auth.signup_link"];
};
document.getElementById('logout-btn').onclick = () => logout();

// --- Data ---
async function fetchData() {
    const user = getUser();
    if (!user) return;
    
    applyLocales();
    updateCategoryOptions();

    const selectedMonth = dashboardMonth.value;
    try {
        const txs = await fetchTransactions(user.id);
        const filtered = txs.filter(t => t.occurred_at.startsWith(selectedMonth));
        let inc = 0, exp = 0;
        filtered.forEach(t => { if (t.type === 'income') inc += parseFloat(t.amount); else exp += parseFloat(t.amount); });

        document.getElementById('total-balance').innerText = `${currency}${(inc - exp).toFixed(0)}`;
        document.getElementById('total-income').innerText = `${currency}${inc.toFixed(0)}`;
        document.getElementById('total-expense').innerText = `${currency}${exp.toFixed(0)}`;

        // renderCharts(filtered); // Redundant
        updateAssistant(inc, exp, filtered);
    } catch (error) {
        alert("Data load error: " + error.message);
    }
}
dashboardMonth.onchange = fetchData;
document.getElementById('type').onchange = fetchData;

// Manual search and delete redundant render functions
document.getElementById('tx-search').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allTransactions.filter(t => (t.category_name || '').toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q));
    // renderTransactions(filtered.slice(0, 20)); // Redundant
};

document.getElementById('csv-btn').onclick = () => {
    const header = "Date,Category,Type,Sector,Amount,Note\n";
    const rows = allTransactions.map(t => `${new Date(t.occurred_at).toLocaleDateString()},${t.category_name},${t.type},${t.metadata?.sector || 'General'},${t.amount},${t.notes || ''}`).join("\n");
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([header + rows], { type: 'text/csv' })); a.download = 'backup.csv'; a.click();
};

// --- Features ---
function updateAssistant(inc, exp) {
    const healthBadge = document.getElementById('health-score-badge');
    const score = Math.max(0, Math.min(100, Math.round((inc > 0 ? (inc - exp) / inc : 0) * 200)));
    healthBadge.innerText = `Score: ${score}`;
    healthBadge.style.background = score > 70 ? '#10b981' : (score > 40 ? '#f59e0b' : '#ef4444');
    document.getElementById('assistant-advice').innerHTML = exp > inc ? "• 🔴 Alert: Spending higher than income!" : "• Balance is stable. Keep tracking!";
}

// --- Tabs ---
function switchTab(tabName) {
    document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    document.querySelectorAll('.tab[data-tab]').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    if (tabName === 'accounting') fetchAccountingData();
}
document.querySelectorAll('.tab[data-tab]').forEach(tab => tab.onclick = () => switchTab(tab.dataset.tab));

['acc', 'lab'].forEach(p => document.querySelectorAll(`.${p}-subtab`).forEach(t => t.onclick = () => {
    document.querySelectorAll(`.${p}-subtab`).forEach(st => st.classList.remove('active')); t.classList.add('active');
    document.querySelectorAll(`.${p}-content`).forEach(c => c.classList.add('hidden')); document.getElementById(`${p}-${t.dataset[p]}`).classList.remove('hidden');
    if (p === 'acc') fetchAccountingData();
}));

async function fetchAccountingData() {
    const { data: assets } = await supabaseClient.from('accounts').select('*').eq('user_id', user.id);
    const { data: debts } = await supabaseClient.from('debts').select('*').eq('user_id', user.id);
    const { data: ests } = await supabaseClient.from('financial_targets').select('*').eq('user_id', user.id);
    const aSum = assets?.reduce((s, a) => s + parseFloat(a.balance || 0), 0) || 0;
    const lSum = debts?.reduce((s, d) => s + parseFloat(d.balance || 0), 0) || 0;
    document.getElementById('total-assets').innerText = `${currency}${aSum.toFixed(0)}`;
    document.getElementById('total-liabilities').innerText = `${currency}${lSum.toFixed(0)}`;
    document.getElementById('net-worth').innerText = `${currency}${(aSum - lSum).toFixed(0)}`;
    document.getElementById('asset-list').innerHTML = assets?.map(a => `<div class='transaction-item'><span>${a.name}</span><strong>${currency}${a.balance}</strong></div>`).join('') || '';
    document.getElementById('liability-list').innerHTML = debts?.map(d => `<div class='transaction-item'><span>${d.name}</span><strong>${currency}${d.balance}</strong></div>`).join('') || '';
    document.getElementById('estimate-list').innerHTML = ests?.map(e => `<div class='transaction-item'><span>${e.target_name}</span><strong>${currency}${e.amount}</strong></div>`).join('') || '';
}

// --- Auth and Data Initialization ---
async function initApp() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    setUser(session?.user);
    
    if (getUser()) {
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        await fetchData();
    } else {
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('app-section').classList.add('hidden');
    }
}

supabaseClient.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user);
    if (getUser()) {
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        fetchData();
    } else {
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('app-section').classList.add('hidden');
    }
});

initApp(); // Run immediately on load

// Manual Form Submission
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('submit-transaction-btn');
    if (btn) {
        btn.onclick = async () => {
            console.log("Manual submit triggered!");
            const amount = document.getElementById('amount').value;
            const type = document.getElementById('type').value;
            const category = document.getElementById('category').value;
            const sector = document.getElementById('sector').value;
            const method = document.getElementById('account').value;
            const note = document.getElementById('note').value;

            try {
                const { data, error } = await supabaseClient.from('transactions').insert([{
                    user_id: user.id, 
                    amount: parseFloat(amount),
                    type: type, 
                    category_name: category,
                    metadata: { sector: sector }, 
                    method: method, 
                    notes: note, 
                    occurred_at: new Date().toISOString()
                }]);

                if (error) {
                    alert("Submission error: " + error.message);
                } else {
                    document.getElementById('transaction-form').reset(); 
                    switchTab('dashboard'); 
                    fetchData();
                }
            } catch (err) {
                alert("Unexpected error: " + err.message);
            }
        };
    }
});

document.getElementById('asset-form').onsubmit = async (e) => {
    e.preventDefault();
    await supabaseClient.from('accounts').insert([{ user_id: user.id, name: document.getElementById('asset-name').value, balance: parseFloat(document.getElementById('asset-balance').value) }]);
    document.getElementById('asset-form').reset(); fetchAccountingData();
};

document.getElementById('liability-form').onsubmit = async (e) => {
    e.preventDefault();
    await supabaseClient.from('debts').insert([{ user_id: user.id, name: document.getElementById('liability-name').value, balance: parseFloat(document.getElementById('liability-balance').value) }]);
    document.getElementById('liability-form').reset(); fetchAccountingData();
};

document.getElementById('estimate-form').onsubmit = async (e) => {
    e.preventDefault();
    await supabaseClient.from('financial_targets').insert([{ user_id: user.id, target_name: document.getElementById('est-name').value, amount: parseFloat(document.getElementById('est-amount').value), target_type: 'estimate' }]);
    document.getElementById('estimate-form').reset(); fetchAccountingData();
};

document.getElementById('zakat-assets').oninput = (e) => document.getElementById('zakat-result').innerText = `${currency}${(parseFloat(e.target.value || 0) * 0.025).toFixed(2)}`;
document.getElementById('print-btn').onclick = () => window.print();
document.getElementById('pdf-btn').onclick = () => window.print(); // Simple PDF fallback
document.getElementById('export-btn').onclick = async () => {
    const user = getUser();
    const transactions = await fetchTransactions(user.id);
    const categories = await fetchCategories(user.id);
    exportData(transactions, categories);
};
