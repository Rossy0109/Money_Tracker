import { supabaseClient } from './src/modules/supabase.js';
import { handleAuth, toggleAuthMode, logout, getUser, setUser, isSignup } from './src/modules/auth.js';
import { fetchTransactions, fetchCategories, exportData, addTransaction, deleteTransaction } from './src/modules/data.js';

// --- Global State ---
let currentLang = localStorage.getItem('app_lang') || 'en';
let currency = localStorage.getItem('base_currency') || '৳';
let charts = { main: null, pnl: null };
let allTransactions = [];

// --- Localization Dictionary ---
const DICTIONARY = {
    en: {
        "auth.login": "Login", "auth.signup": "Sign Up", "auth.email": "Email", "auth.password": "Password",
        "auth.github": "Login with GitHub", "auth.or": "OR EMAIL",
        "auth.signup_link": "Don't have an account? Sign Up", "auth.login_link": "Already have an account? Login",
        "nav.dashboard": "Dashboard", "nav.add": "Add", "nav.accounting": "Accounting",
        "nav.reports": "Reports", "nav.lab": "Lab", "nav.settings": "Settings", "nav.logout": "Logout",
        "dash.balance": "Total Balance", "dash.income": "Income", "dash.expense": "Expense",
        "dash.assistant_title": "🤖 Financial Assistant", "dash.visuals": "📊 Visual Analytics",
        "dash.recent": "Recent Transactions", "dash.search": "Search...", "dash.load_more": "Load More",
        "dash.view_period": "View Period:", "dash.loading": "Loading your financial pulse...",
        "add.title": "New Transaction", "add.amount": "Amount", "add.type": "Type",
        "add.income": "Income", "add.expense": "Expense", "add.category": "Category",
        "add.sector": "Sector (Project)", "add.method": "Account (Method)", "add.note": "Note (optional)",
        "add.save": "💾 Save Transaction",
        "acc.title": "Financial Accounting", "acc.pnl": "P&L", "acc.balance": "Balance",
        "acc.budget": "Budgets", "acc.recurring": "Recurring", "acc.estimates": "Estimates",
        "acc.assets": "Assets", "acc.liabilities": "Liabilities", "acc.networth": "Net Worth",
        "acc.add_asset": "➕ Add Asset", "acc.asset_name": "Account Name",
        "acc.balance_placeholder": "Balance", "acc.save": "Save", "acc.set_budget": "Set Monthly Budget",
        "acc.limit_placeholder": "Limit", "acc.new_recurring": "+ Add Recurring",
        "acc.name_placeholder": "Name", "acc.enable_auto": "Enable Auto-Add",
        "reports.title": "Generate Reports", "reports.download_pdf": "📥 Download PDF",
        "reports.download_csv": "📊 Export CSV", "reports.all_sectors": "All Sectors",
        "reports.date": "Date", "reports.category": "Category", "reports.sector": "Sector",
        "reports.amount": "Amount", "reports.statement": "Financial Statement Report",
        "lab.title": "Financial Lab", "lab.zakat": "Zakat", "lab.emi": "EMI",
        "lab.payable": "Payable Zakat (2.5%)", "lab.assets_placeholder": "Assets",
        "settings.global": "🌍 Global Preferences", "settings.currency": "Base Currency",
        "settings.security": "🔒 Security (PIN)", "settings.pin_placeholder": "Enter PIN",
        "settings.save_pin": "Save PIN", "settings.clear_pin": "Clear PIN",
        "settings.data": "📥 Data Sovereignty", "settings.export": "⬇ Export JSON",
        "settings.import": "⬆ Import JSON",
        "sectors.general": "General", "sectors.personal": "Personal",
        "sectors.business": "Business", "sectors.social": "Social",
        "methods.cash": "Cash", "methods.bank": "Bank"
    },
    bn: {
        "auth.login": "লগইন", "auth.signup": "সাইন আপ", "auth.email": "ইমেইল", "auth.password": "পাসওয়ার্ড",
        "auth.github": "GitHub দিয়ে লগইন", "auth.or": "অথবা ইমেইল",
        "auth.signup_link": "অ্যাকাউন্ট নেই? সাইন আপ করুন", "auth.login_link": "অ্যাকাউন্ট আছে? লগইন করুন",
        "nav.dashboard": "ড্যাশবোর্ড", "nav.add": "যুক্ত করুন", "nav.accounting": "অ্যাকাউন্টিং",
        "nav.reports": "রিপোর্ট", "nav.lab": "ল্যাব", "nav.settings": "সেটিংস", "nav.logout": "লগআউট",
        "dash.balance": "মোট ব্যালেন্স", "dash.income": "আয়", "dash.expense": "ব্যয়",
        "dash.assistant_title": "🤖 আর্থিক সহকারী", "dash.visuals": "📊 ভিজ্যুয়াল অ্যানালিটিক্স",
        "dash.recent": "সাম্প্রতিক লেনদেন", "dash.search": "খুঁজুন...", "dash.load_more": "আরো দেখুন",
        "dash.view_period": "সময়কাল:", "dash.loading": "আপনার আর্থিক অবস্থা বিশ্লেষণ করা হচ্ছে...",
        "add.title": "নতুন লেনদেন", "add.amount": "পরিমাণ", "add.type": "ধরণ",
        "add.income": "আয়", "add.expense": "ব্যয়", "add.category": "ক্যাটাগরি",
        "add.sector": "সেক্টর (প্রজেক্ট)", "add.method": "অ্যাকাউন্ট (পদ্ধতি)", "add.note": "নোট (ঐচ্ছিক)",
        "add.save": "💾 সংরক্ষণ করুন",
        "acc.title": "আর্থিক অ্যাকাউন্টিং", "acc.pnl": "লাভ-ক্ষতি", "acc.balance": "ব্যালেন্স শিট",
        "acc.budget": "বাজেট", "acc.recurring": "পুনরাবৃত্ত", "acc.estimates": "এস্টিমেট",
        "acc.assets": "সম্পদ", "acc.liabilities": "দায় (ঋণ)", "acc.networth": "নিট সম্পদ",
        "acc.add_asset": "➕ সম্পদ যুক্ত করুন", "acc.asset_name": "অ্যাকাউন্টের নাম",
        "acc.balance_placeholder": "ব্যালেন্স", "acc.save": "সেভ", "acc.set_budget": "মাসিক বাজেট সেট করুন",
        "acc.limit_placeholder": "সীমা", "acc.new_recurring": "+ অটো লেনদেন যুক্ত করুন",
        "acc.name_placeholder": "নাম", "acc.enable_auto": "অটো-অ্যাড চালু করুন",
        "reports.title": "রিপোর্ট তৈরি করুন", "reports.download_pdf": "📥 PDF ডাউনলোড",
        "reports.download_csv": "📊 CSV এক্সপোর্ট", "reports.all_sectors": "সব সেক্টর",
        "reports.date": "তারিখ", "reports.category": "ক্যাটাগরি", "reports.sector": "সেক্টর",
        "reports.amount": "পরিমাণ", "reports.statement": "আর্থিক বিবরণী রিপোর্ট",
        "lab.title": "ফাইনান্সিয়াল ল্যাব", "lab.zakat": "যাকাত", "lab.emi": "কিস্তি (EMI)",
        "lab.payable": "প্রদেয় যাকাত (২.৫%)", "lab.assets_placeholder": "সম্পদ",
        "settings.global": "🌍 গ্লোবাল সেটিংস", "settings.currency": "বেস কারেন্সি",
        "settings.security": "🔒 নিরাপত্তা (PIN)", "settings.pin_placeholder": "PIN দিন",
        "settings.save_pin": "PIN সেভ করুন", "settings.clear_pin": "PIN মুছুন",
        "settings.data": "📥 ডাটা ব্যাকআপ", "settings.export": "⬇ JSON এক্সপোর্ট",
        "settings.import": "⬆ JSON ইমপোর্ট",
        "sectors.general": "সাধারণ", "sectors.personal": "ব্যক্তিগত",
        "sectors.business": "ব্যবসায়িক", "sectors.social": "সামাজিক",
        "methods.cash": "নগদ", "methods.bank": "ব্যাংক"
    }
};

// --- Localization ---
function t(path) {
    return DICTIONARY[currentLang]?.[path] || path;
}

function applyLocales() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const val = t(el.getAttribute('data-i18n'));
        if (val) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const val = t(el.getAttribute('data-i18n-placeholder'));
        if (val) el.placeholder = val;
    });
}

// --- Toast ---
function showToast(msg, duration = 2800) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

// --- Tabs ---
function switchTab(tabName) {
    document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`tab-${tabName}`);
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('.tab[data-tab]').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));

    // Refresh data for specific tabs
    if (tabName === 'reports') renderReports();
    if (tabName === 'accounting') renderAccounting();
}
document.querySelectorAll('.tab[data-tab]').forEach(tab => {
    tab.onclick = () => switchTab(tab.dataset.tab);
});

// --- DOM Refs ---
const authForm = document.getElementById('auth-form');
const dashboardMonth = document.getElementById('dashboard-month');
if (dashboardMonth) dashboardMonth.value = new Date().toISOString().substring(0, 7);

// --- Language Toggle ---
function toggleLang() {
    currentLang = currentLang === 'en' ? 'bn' : 'en';
    localStorage.setItem('app_lang', currentLang);
    applyLocales();
    fetchData();
}
document.getElementById('lang-toggle-btn')?.addEventListener('click', toggleLang);
document.getElementById('lang-toggle-btn2')?.addEventListener('click', toggleLang);

// --- Currency ---
const currencySelect = document.getElementById('currency-select');
if (currencySelect) {
    currencySelect.value = currency;
    currencySelect.onchange = () => {
        currency = currencySelect.value;
        localStorage.setItem('base_currency', currency);
        fetchData();
    };
}

// --- Auth ---
if (authForm) authForm.onsubmit = handleAuth;

const githubBtn = document.getElementById('github-login-btn');
if (githubBtn) {
    githubBtn.onclick = () => supabaseClient.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: window.location.origin }
    });
}

const toggleAuthBtn = document.getElementById('toggle-auth');
if (toggleAuthBtn) {
    toggleAuthBtn.onclick = () => {
        const newMode = !isSignup;
        toggleAuthMode(newMode);
        document.getElementById('auth-title').innerText = newMode ? t('auth.signup') : t('auth.login');
        document.getElementById('submit-btn').innerText = newMode ? t('auth.signup') : t('auth.login');
        toggleAuthBtn.innerText = newMode ? t('auth.login_link') : t('auth.signup_link');
    };
}

document.getElementById('logout-btn')?.addEventListener('click', () => logout());
document.getElementById('logout-btn-settings')?.addEventListener('click', () => logout());

// --- Dashboard Data ---
async function fetchData() {
    const user = getUser();
    if (!user) return;
    applyLocales();

    const selectedMonth = dashboardMonth ? dashboardMonth.value : new Date().toISOString().substring(0, 7);
    try {
        const txs = await fetchTransactions(user.id);
        allTransactions = txs;
        const filtered = txs.filter(tx => tx.occurred_at?.startsWith(selectedMonth));

        let inc = 0, exp = 0;
        filtered.forEach(tx => {
            if (tx.type === 'income') inc += parseFloat(tx.amount || 0);
            else exp += parseFloat(tx.amount || 0);
        });

        const fmt = n => `${currency}${Math.abs(n).toLocaleString()}`;
        document.getElementById('total-balance')?.innerText !== undefined &&
            (document.getElementById('total-balance').innerText = `${currency}${(inc - exp).toLocaleString()}`);
        document.getElementById('total-income')?.innerText !== undefined &&
            (document.getElementById('total-income').innerText = fmt(inc));
        document.getElementById('total-expense')?.innerText !== undefined &&
            (document.getElementById('total-expense').innerText = fmt(exp));

        // P&L sync
        const pnlInc = document.getElementById('pnl-income');
        const pnlExp = document.getElementById('pnl-expense');
        const pnlNet = document.getElementById('pnl-net');
        if (pnlInc) pnlInc.innerText = fmt(inc);
        if (pnlExp) pnlExp.innerText = fmt(exp);
        if (pnlNet) {
            const net = inc - exp;
            pnlNet.innerText = fmt(net);
            pnlNet.style.color = net >= 0 ? 'var(--income)' : 'var(--expense)';
        }

        updateAssistant(inc, exp);
        renderTransactionList(filtered.slice(0, 30));
        renderChart(filtered);
    } catch (err) {
        console.error('Data load error:', err);
        showToast('⚠️ Failed to load data');
    }
}

// --- Transaction List ---
function renderTransactionList(list) {
    const container = document.getElementById('transaction-list');
    if (!container) return;

    if (!list.length) {
        container.innerHTML = `<p style="text-align:center; color: var(--text-muted); padding: 1.5rem 0;">No transactions found.</p>`;
        return;
    }

    const ICONS = { Food: '🍔', Transport: '🚗', Rent: '🏠', Utilities: '💡', Health: '💊',
        Education: '📚', Salary: '💼', Business: '🏪', Gift: '🎁', Investment: '📈', Other: '📦', Default: '💰' };

    container.innerHTML = list.map(tx => {
        const isInc = tx.type === 'income';
        const icon = ICONS[tx.category_name] || ICONS['Default'];
        const date = tx.occurred_at ? new Date(tx.occurred_at).toLocaleDateString() : '';
        return `
        <div class="transaction-item">
            <div style="display:flex; align-items:center; gap: 0.6rem; flex: 1;">
                <div class="tx-icon ${isInc ? 'tx-income' : 'tx-expense'}">${icon}</div>
                <div>
                    <strong style="font-size: 0.9rem;">${tx.category_name || 'N/A'}</strong>
                    <div style="font-size: 0.77rem; color: var(--text-muted);">${date} · ${tx.metadata?.sector || 'Gen'} · ${tx.method || 'Cash'}</div>
                    ${tx.notes ? `<div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 1px;">${tx.notes}</div>` : ''}
                </div>
            </div>
            <div style="text-align:right; flex-shrink: 0;">
                <span style="color:${isInc ? 'var(--income)' : 'var(--expense)'}; font-weight: 700;">
                    ${isInc ? '+' : '-'}${currency}${Math.abs(parseFloat(tx.amount || 0)).toLocaleString()}
                </span>
                <button onclick="deleteTx('${tx.id}')" style="display:block; background: transparent; color: var(--text-muted); padding: 2px 6px; font-size: 0.7rem; margin: 2px 0 0 auto; width: auto; border: 1px solid var(--border); border-radius: 4px;" title="Delete">✕</button>
            </div>
        </div>`;
    }).join('');
}

// --- Delete Transaction ---
window.deleteTx = async (id) => {
    if (!confirm('Delete this transaction?')) return;
    try {
        await deleteTransaction(id);
        showToast('Transaction deleted');
        fetchData();
    } catch (err) {
        console.error(err);
        showToast('❌ Failed to delete');
    }
};

// --- Chart ---
function renderChart(txs) {
    const ctx = document.getElementById('main-chart');
    if (!ctx) return;

    // Group by category
    const catMap = {};
    txs.filter(tx => tx.type === 'expense').forEach(tx => {
        catMap[tx.category_name || 'Other'] = (catMap[tx.category_name || 'Other'] || 0) + parseFloat(tx.amount || 0);
    });

    const labels = Object.keys(catMap);
    const data = Object.values(catMap);

    if (charts.main) charts.main.destroy();
    if (!labels.length) { ctx.style.display = 'none'; return; }
    ctx.style.display = 'block';

    const COLORS = ['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6'];
    charts.main = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: COLORS.slice(0, labels.length), borderWidth: 2, borderColor: 'var(--card)' }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.label}: ${currency}${ctx.parsed.toLocaleString()}`
                    }
                }
            }
        }
    });
}

// --- Assistant ---
function updateAssistant(inc, exp) {
    const badge = document.getElementById('health-score-badge');
    const bar = document.getElementById('health-bar');
    const advice = document.getElementById('assistant-advice');
    if (!badge) return;

    const score = Math.max(0, Math.min(100, Math.round((inc > 0 ? (inc - exp) / inc : 0) * 200)));
    badge.innerText = `Score: ${score}`;
    badge.className = `badge ${score > 70 ? 'badge-green' : score > 40 ? 'badge-blue' : 'badge-red'}`;
    if (bar) {
        bar.style.width = `${score}%`;
        bar.style.background = score > 70 ? 'var(--income)' : score > 40 ? '#f59e0b' : 'var(--expense)';
    }
    if (advice) {
        const savings = inc - exp;
        const savingsRate = inc > 0 ? Math.round((savings / inc) * 100) : 0;
        advice.innerHTML = exp > inc
            ? `• 🔴 Alert: You're spending more than you earn! <br>• Consider cutting ${currency}${(exp - inc).toLocaleString()} in expenses.`
            : `• ✅ You're saving <strong>${savingsRate}%</strong> of your income. ${score > 70 ? 'Excellent!' : 'Keep it up!'}<br>• Net savings: ${currency}${savings.toLocaleString()}`;
    }
}

// --- Dashboard month filter ---
if (dashboardMonth) dashboardMonth.onchange = fetchData;

// --- Search ---
const txSearch = document.getElementById('tx-search');
if (txSearch) {
    txSearch.oninput = (e) => {
        const q = e.target.value.toLowerCase();
        const filtered = allTransactions.filter(tx =>
            (tx.category_name || '').toLowerCase().includes(q) ||
            (tx.notes || '').toLowerCase().includes(q) ||
            (tx.method || '').toLowerCase().includes(q)
        );
        renderTransactionList(filtered.slice(0, 30));
    };
}

// --- Add Transaction Form ---
const txForm = document.getElementById('tx-form');
if (txForm) {
    txForm.onsubmit = async (e) => {
        e.preventDefault();
        const user = getUser();
        if (!user) { showToast('Please login first'); return; }

        const btn = document.getElementById('tx-save-btn');
        btn.disabled = true;
        btn.innerText = 'Saving...';

        try {
            const txData = {
                user_id: user.id,
                amount: parseFloat(document.getElementById('tx-amount').value),
                type: document.getElementById('tx-type').value,
                category_name: document.getElementById('tx-category').value,
                method: document.getElementById('tx-method').value,
                notes: document.getElementById('tx-note').value || null,
                occurred_at: new Date(document.getElementById('tx-date').value).toISOString(),
                currency: currency === '৳' ? 'BDT' : currency,
                metadata: { sector: document.getElementById('tx-sector').value }
            };
            await addTransaction(txData);
            showToast('✅ Transaction saved!');
            txForm.reset();
            document.getElementById('tx-type').value = 'expense';
            document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
            document.getElementById('btn-expense').className = 'type-btn active-expense';
            document.getElementById('btn-income').className = 'type-btn';
            await fetchData();
            switchTab('dashboard');
        } catch (err) {
            showToast('❌ Error: ' + (err.message || 'Could not save'));
        } finally {
            btn.disabled = false;
            btn.innerText = t('add.save');
        }
    };
}

// --- Reports ---
function renderReports() {
    const month = document.getElementById('report-month')?.value || new Date().toISOString().substring(0, 7);
    const sector = document.getElementById('report-sector')?.value || '';
    const tbody = document.getElementById('report-tbody');
    const summary = document.getElementById('report-summary');
    if (!tbody) return;

    let filtered = allTransactions.filter(tx => tx.occurred_at?.startsWith(month));
    if (sector) filtered = filtered.filter(tx => tx.metadata?.sector === sector);

    let inc = 0, exp = 0;
    filtered.forEach(tx => {
        if (tx.type === 'income') inc += parseFloat(tx.amount || 0);
        else exp += parseFloat(tx.amount || 0);
    });

    tbody.innerHTML = filtered.map(tx => `
        <tr>
            <td>${tx.occurred_at ? new Date(tx.occurred_at).toLocaleDateString() : ''}</td>
            <td>${tx.category_name || 'N/A'}</td>
            <td>${tx.metadata?.sector || 'General'}</td>
            <td style="color: ${tx.type === 'income' ? 'var(--income)' : 'var(--expense)'}; font-weight: 600;">
                ${tx.type === 'income' ? '+' : '-'}${currency}${Math.abs(parseFloat(tx.amount || 0)).toLocaleString()}
            </td>
        </tr>
    `).join('') || `<tr><td colspan="4" style="text-align:center; padding: 1rem; color: var(--text-muted);">No data for this period.</td></tr>`;

    if (summary) {
        summary.innerHTML = `
            <strong>Summary:</strong>
            Income: <span style="color:var(--income);">${currency}${inc.toLocaleString()}</span> |
            Expense: <span style="color:var(--expense);">${currency}${exp.toLocaleString()}</span> |
            Net: <strong>${currency}${(inc - exp).toLocaleString()}</strong>
        `;
    }
}

document.getElementById('report-month')?.addEventListener('change', renderReports);
document.getElementById('report-sector')?.addEventListener('change', renderReports);

// --- PDF Export ---
document.getElementById('pdf-btn')?.addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { showToast('PDF library not loaded'); return; }
    const doc = new jsPDF();
    const month = document.getElementById('report-month')?.value || '';
    const sector = document.getElementById('report-sector')?.value || 'All';

    doc.setFontSize(16);
    doc.text('Money Footprint – Financial Report', 14, 18);
    doc.setFontSize(10);
    doc.text(`Period: ${month} | Sector: ${sector || 'All'} | Generated: ${new Date().toLocaleDateString()}`, 14, 26);

    let filtered = allTransactions.filter(tx => tx.occurred_at?.startsWith(month));
    if (sector) filtered = filtered.filter(tx => tx.metadata?.sector === sector);

    const rows = filtered.map(tx => [
        tx.occurred_at ? new Date(tx.occurred_at).toLocaleDateString() : '',
        tx.category_name || 'N/A',
        tx.type,
        tx.metadata?.sector || 'General',
        `${tx.type === 'income' ? '+' : '-'}${currency}${Math.abs(parseFloat(tx.amount || 0)).toFixed(2)}`
    ]);

    doc.autoTable({
        startY: 32,
        head: [['Date', 'Category', 'Type', 'Sector', 'Amount']],
        body: rows,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] }
    });

    doc.save(`report_${month}.pdf`);
    showToast('📥 PDF downloaded!');
});

// --- CSV Export ---
document.getElementById('csv-btn')?.addEventListener('click', () => {
    const month = document.getElementById('report-month')?.value || '';
    let filtered = allTransactions.filter(tx => tx.occurred_at?.startsWith(month));
    const sector = document.getElementById('report-sector')?.value;
    if (sector) filtered = filtered.filter(tx => tx.metadata?.sector === sector);

    const header = 'Date,Category,Type,Sector,Method,Amount,Notes\n';
    const rows = filtered.map(tx =>
        `${new Date(tx.occurred_at).toLocaleDateString()},${tx.category_name},${tx.type},${tx.metadata?.sector || 'General'},${tx.method || 'Cash'},${tx.amount},${tx.notes || ''}`
    ).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([header + rows], { type: 'text/csv' }));
    a.download = `transactions_${month}.csv`;
    a.click();
    showToast('📊 CSV exported!');
});

// --- Accounting ---
function renderAccounting() {
    const month = dashboardMonth?.value || new Date().toISOString().substring(0, 7);
    const filtered = allTransactions.filter(tx => tx.occurred_at?.startsWith(month));
    let inc = 0, exp = 0;
    filtered.forEach(tx => {
        if (tx.type === 'income') inc += parseFloat(tx.amount || 0);
        else exp += parseFloat(tx.amount || 0);
    });

    const fmt = n => `${currency}${Math.abs(n).toLocaleString()}`;
    document.getElementById('pnl-income')?.innerText !== undefined && (document.getElementById('pnl-income').innerText = fmt(inc));
    document.getElementById('pnl-expense')?.innerText !== undefined && (document.getElementById('pnl-expense').innerText = fmt(exp));
    const pnlNet = document.getElementById('pnl-net');
    if (pnlNet) {
        const net = inc - exp;
        pnlNet.innerText = fmt(net);
        pnlNet.style.color = net >= 0 ? 'var(--income)' : 'var(--expense)';
    }

    // Budget tracking
    const budgets = JSON.parse(localStorage.getItem('budgets') || '{}');
    const budgetList = document.getElementById('budget-list');
    if (budgetList) {
        const catExp = {};
        filtered.filter(tx => tx.type === 'expense').forEach(tx => {
            catExp[tx.category_name || 'Other'] = (catExp[tx.category_name || 'Other'] || 0) + parseFloat(tx.amount || 0);
        });
        budgetList.innerHTML = Object.entries(budgets).map(([cat, limit]) => {
            const spent = catExp[cat] || 0;
            const pct = Math.min(100, Math.round((spent / limit) * 100));
            const over = spent > limit;
            return `
            <div style="margin-bottom: 0.75rem;">
                <div style="display:flex; justify-content:space-between; font-size:0.88rem; margin-bottom:3px;">
                    <span>${cat}</span>
                    <span style="color:${over ? 'var(--expense)' : 'var(--text-muted)'};">${currency}${spent.toLocaleString()} / ${currency}${limit.toLocaleString()}</span>
                </div>
                <div class="health-bar-wrap">
                    <div class="health-bar" style="width:${pct}%; background:${over ? 'var(--expense)' : 'var(--income)'};"></div>
                </div>
                ${over ? `<small style="color:var(--expense);">⚠️ Over budget by ${currency}${(spent - limit).toLocaleString()}</small>` : ''}
            </div>`;
        }).join('') || '<p style="color:var(--text-muted); font-size:0.88rem;">No budgets set yet.</p>';
    }

    // Assets / Net worth
    const assets = JSON.parse(localStorage.getItem('assets') || '[]');
    const debts = JSON.parse(localStorage.getItem('debts') || '[]');
    const totalAssets = assets.reduce((s, a) => s + parseFloat(a.balance || 0), 0);
    const totalDebts = debts.reduce((s, d) => s + parseFloat(d.balance || 0), 0);

    document.getElementById('nw-assets')?.innerText !== undefined && (document.getElementById('nw-assets').innerText = fmt(totalAssets));
    document.getElementById('nw-liabilities')?.innerText !== undefined && (document.getElementById('nw-liabilities').innerText = fmt(totalDebts));
    const nwTotal = document.getElementById('nw-total');
    if (nwTotal) {
        const nw = totalAssets - totalDebts;
        nwTotal.innerText = fmt(nw);
        nwTotal.style.color = nw >= 0 ? 'var(--income)' : 'var(--expense)';
    }

    const assetsList = document.getElementById('assets-list');
    if (assetsList) {
        assetsList.innerHTML = assets.map((a, i) => `
            <div style="display:flex; justify-content:space-between; padding: 0.4rem 0; border-bottom: 1px solid var(--border); font-size: 0.88rem;">
                <span>${a.name}</span>
                <span>${currency}${parseFloat(a.balance).toLocaleString()}
                    <button onclick="removeAsset(${i})" style="background:transparent; color:var(--expense); width:auto; padding:1px 5px; font-size:0.7rem; margin:0; border:none;">✕</button>
                </span>
            </div>
        `).join('') || '<p style="color:var(--text-muted); font-size:0.85rem; margin:0.5rem 0;">No assets added yet.</p>';
        document.getElementById('acc-networth')?.innerText !== undefined;
    }
}

// Asset form
document.getElementById('asset-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('asset-name').value.trim();
    const bal = parseFloat(document.getElementById('asset-balance').value || 0);
    if (!name) return;
    const assets = JSON.parse(localStorage.getItem('assets') || '[]');
    assets.push({ name, balance: bal });
    localStorage.setItem('assets', JSON.stringify(assets));
    document.getElementById('asset-form').reset();
    renderAccounting();
    showToast('Asset saved');
});

window.removeAsset = (i) => {
    const assets = JSON.parse(localStorage.getItem('assets') || '[]');
    assets.splice(i, 1);
    localStorage.setItem('assets', JSON.stringify(assets));
    renderAccounting();
};

// Budget form
document.getElementById('budget-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const cat = document.getElementById('budget-category').value;
    const limit = parseFloat(document.getElementById('budget-limit').value || 0);
    if (!limit) return;
    const budgets = JSON.parse(localStorage.getItem('budgets') || '{}');
    budgets[cat] = limit;
    localStorage.setItem('budgets', JSON.stringify(budgets));
    document.getElementById('budget-form').reset();
    renderAccounting();
    showToast('Budget saved');
});

// Recurring form
document.getElementById('recurring-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const rec = {
        name: document.getElementById('rec-name').value.trim(),
        amount: parseFloat(document.getElementById('rec-amount').value || 0),
        type: document.getElementById('rec-type').value,
        day: parseInt(document.getElementById('rec-day').value || 1)
    };
    if (!rec.name || !rec.amount) return;
    const recs = JSON.parse(localStorage.getItem('recurrings') || '[]');
    recs.push(rec);
    localStorage.setItem('recurrings', JSON.stringify(recs));
    document.getElementById('recurring-form').reset();
    renderRecurring();
    showToast('Recurring transaction saved');
});

function renderRecurring() {
    const list = document.getElementById('recurring-list');
    if (!list) return;
    const recs = JSON.parse(localStorage.getItem('recurrings') || '[]');
    list.innerHTML = recs.map((r, i) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0; border-bottom: 1px solid var(--border); font-size: 0.88rem;">
            <div>
                <strong>${r.name}</strong>
                <span class="badge ${r.type === 'income' ? 'badge-green' : 'badge-red'}" style="margin-left:5px;">${r.type}</span>
                <div style="font-size: 0.77rem; color: var(--text-muted);">Day ${r.day} every month</div>
            </div>
            <div>
                <strong style="color:${r.type === 'income' ? 'var(--income)' : 'var(--expense)'};">${currency}${r.amount.toLocaleString()}</strong>
                <button onclick="removeRecurring(${i})" style="display:block; background:transparent; color:var(--expense); width:auto; padding:1px 5px; font-size:0.7rem; margin:3px 0 0 auto; border:none;">✕ Remove</button>
            </div>
        </div>
    `).join('') || '<p style="color:var(--text-muted); font-size:0.85rem; margin:0.5rem 0;">No recurring transactions.</p>';
}

window.removeRecurring = (i) => {
    const recs = JSON.parse(localStorage.getItem('recurrings') || '[]');
    recs.splice(i, 1);
    localStorage.setItem('recurrings', JSON.stringify(recs));
    renderRecurring();
};

// --- Zakat ---
document.getElementById('zakat-assets')?.addEventListener('input', (e) => {
    const result = document.getElementById('zakat-result');
    if (result) result.innerText = `${currency}${(parseFloat(e.target.value || 0) * 0.025).toFixed(2)}`;
});

// --- Export / Import ---
document.getElementById('export-btn')?.addEventListener('click', async () => {
    const user = getUser();
    if (!user) { showToast('Please login first'); return; }
    try {
        const transactions = await fetchTransactions(user.id);
        const categories = await fetchCategories(user.id);
        exportData(transactions, categories);
        showToast('✅ Data exported!');
    } catch (err) {
        console.error(err);
        showToast('❌ Export failed');
    }
});

const importBtn = document.getElementById('import-btn');
const importFile = document.getElementById('import-file');
importBtn?.addEventListener('click', () => importFile?.click());
importFile?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            showToast(`📂 Loaded ${data.transactions?.length || 0} transactions`);
        } catch {
            showToast('❌ Invalid JSON file');
        }
    };
    reader.readAsText(file);
});

// --- Auth State & Init ---
async function initApp() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    setUser(session?.user || null);

    const authSection = document.getElementById('auth-section');
    const appSection = document.getElementById('app-section');

    if (getUser()) {
        authSection?.classList.add('hidden');
        appSection?.classList.remove('hidden');
        applyLocales();
        await fetchData();
        renderRecurring();
    } else {
        authSection?.classList.remove('hidden');
        appSection?.classList.add('hidden');
        applyLocales();
    }
}

supabaseClient.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user || null);
    const authSection = document.getElementById('auth-section');
    const appSection = document.getElementById('app-section');
    if (getUser()) {
        authSection?.classList.add('hidden');
        appSection?.classList.remove('hidden');
        fetchData();
        renderRecurring();
    } else {
        authSection?.classList.remove('hidden');
        appSection?.classList.add('hidden');
    }
});

initApp();
