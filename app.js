import { supabaseClient } from './src/modules/supabase.js';
import { handleAuth, toggleAuthMode, logout, getUser, setUser, isSignup, loginAsGuest } from './src/modules/auth.js';
import { fetchTransactions, fetchCategories, exportData, importData, addTransaction, updateTransaction, deleteTransaction, seedDemoData } from './src/modules/data.js';

// --- Global State ---
let currentLang = localStorage.getItem('app_lang') || 'en';
let currency = localStorage.getItem('base_currency') || '৳';
let isPrivateMode = localStorage.getItem('privacy_mode') === 'true';
let charts = { main: null, pnl: null };
let allTransactions = [];

// --- Localization Dictionary ---
const DICTIONARY = {
    en: {
        "auth.login": "Login", "auth.signup": "Sign Up", "auth.email": "Email", "auth.password": "Password",
        "auth.github": "Login with GitHub", "auth.or": "OR EMAIL LOGIN",
        "auth.signup_link": "Don't have an account? Sign Up", "auth.login_link": "Already have an account? Login",
        "nav.dashboard": "📊 Dashboard", "nav.add": "➕ Add / Transfer", "nav.accounting": "💼 Accounting",
        "nav.goals": "🎯 Goals & Budgets", "nav.reports": "📄 Reports", "nav.lab": "🧪 Lab & Tools", "nav.settings": "⚙️ Settings", "nav.logout": "Logout",
        "dash.balance": "Total Net Balance", "dash.income": "Income", "dash.expense": "Expenses",
        "dash.assistant_title": "🤖 Financial Advisor", "dash.visuals": "📊 Expense Breakdown by Category",
        "dash.recent": "Recent Transactions", "dash.search": "Search transactions...", "dash.load_more": "Load More",
        "dash.view_period": "Period:", "dash.loading": "Loading financial pulse...",
        "add.title": "New Transaction Record", "add.amount": "Amount", "add.type": "Transaction Type",
        "add.income": "Income", "add.expense": "Expense", "add.category": "Category",
        "add.sector": "Sector (Tag)", "add.method": "Source Account", "add.note": "Notes / Description (optional)",
        "add.save": "💾 Save Record",
        "acc.title": "Financial Accounting & Balance Sheet", "acc.pnl": "Profit & Loss", "acc.balance": "Accounts & Assets",
        "acc.budget": "Monthly Category Budgets", "acc.recurring": "Recurring Bills", "acc.networth": "Net Worth Sheet",
        "acc.assets": "Accounts & Financial Assets", "acc.liabilities": "Liabilities & Debts",
        "acc.asset_name": "Account / Asset Name", "acc.balance_placeholder": "Balance", "acc.save": "Save Asset",
        "acc.new_recurring": "+ Save Recurring Schedule", "acc.name_placeholder": "Schedule Name (e.g. Internet Bill)",
        "reports.title": "Generate Financial Statements", "reports.download_pdf": "📥 Download PDF Statement",
        "reports.download_csv": "📊 Export CSV Spreadsheet", "reports.all_sectors": "All Sectors",
        "reports.date": "Date", "reports.category": "Category", "reports.sector": "Sector",
        "reports.amount": "Amount",
        "lab.title": "Financial Lab & Utility Calculators", "lab.zakat": "☪️ Zakat Calculator (2.5%)", "lab.emi": "🏦 Loan EMI & Mortgage Calculator",
        "lab.payable": "Payable Zakat (2.5%)", "lab.assets_placeholder": "Enter total liquid assets",
        "settings.global": "🌍 Global Preferences", "settings.currency": "Base Currency",
        "settings.security": "🔒 Security & PIN Lock", "settings.pin_placeholder": "Enter PIN",
        "settings.save_pin": "Save PIN", "settings.clear_pin": "Clear PIN",
        "settings.data": "📥 Data Sovereignty & Backup", "settings.export": "⬇ Export Backup JSON",
        "settings.import": "⬆ Import Backup JSON",
        "sectors.general": "General", "sectors.personal": "Personal", "sectors.business": "Business", "sectors.social": "Social",
        "methods.cash": "Cash Wallet", "methods.bank": "Bank Account"
    },
    bn: {
        "auth.login": "লগইন", "auth.signup": "সাইন আপ", "auth.email": "ইমেইল", "auth.password": "পাসওয়ার্ড",
        "auth.github": "GitHub দিয়ে লগইন", "auth.or": "অথবা ইমেইল লগইন",
        "auth.signup_link": "অ্যাকাউন্ট নেই? সাইন আপ করুন", "auth.login_link": "অ্যাকাউন্ট আছে? লগইন করুন",
        "nav.dashboard": "📊 ড্যাশবোর্ড", "nav.add": "➕ লেনদেন যুক্ত করুন", "nav.accounting": "💼 অ্যাকাউন্টিং",
        "nav.goals": "🎯 গোল ও বাজেট", "nav.reports": "📄 রিপোর্ট", "nav.lab": "🧪 ফাইনান্সিয়াল ল্যাব", "nav.settings": "⚙️ সেটিংস", "nav.logout": "লগআউট",
        "dash.balance": "মোট নিট ব্যালেন্স", "dash.income": "মোট আয়", "dash.expense": "মোট ব্যয়",
        "dash.assistant_title": "🤖 আর্থিক উপদেষ্টা", "dash.visuals": "📊 ক্যাটাগরিভিত্তিক ব্যয়ের অনুপাত",
        "dash.recent": "সাম্প্রতিক লেনদেন", "dash.search": "খুঁজুন...", "dash.load_more": "আরো দেখুন",
        "dash.view_period": "সময়কাল:", "dash.loading": "আর্থিক তথ্য লোড হচ্ছে...",
        "add.title": "নতুন লেনদেন যুক্ত করুন", "add.amount": "পরিমাণ", "add.type": "লেনদেনের ধরণ",
        "add.income": "আয়", "add.expense": "ব্যয়", "add.category": "ক্যাটাগরি",
        "add.sector": "সেক্টর (ট্যাগ)", "add.method": "অ্যাকাউন্ট (পদ্ধতি)", "add.note": "নোট (ঐচ্ছিক)",
        "add.save": "💾 সেভ করুন",
        "acc.title": "আর্থিক অ্যাকাউন্টিং ও ব্যালেন্স শিট", "acc.pnl": "লাভ-ক্ষতি বিবরণী", "acc.balance": "সম্পদ ও ব্যাংক অ্যাকাউন্টিং",
        "acc.budget": "মাসিক ক্যাটাগরি বাজেট", "acc.recurring": "অটো লেনদেন সূচি", "acc.networth": "নিট সম্পদ বিবরণী",
        "acc.assets": "অ্যাকাউন্ট ও সম্পদসমূহ", "acc.liabilities": "দায় ও ঋণসমূহ",
        "acc.asset_name": "অ্যাকাউন্ট / সম্পদের নাম", "acc.balance_placeholder": "ব্যালেন্স", "acc.save": "সম্পদ সেভ করুন",
        "acc.new_recurring": "+ অটো লেনদেন সেভ করুন", "acc.name_placeholder": "সূচির নাম",
        "reports.title": "আর্থিক বিবরণী তৈরি করুন", "reports.download_pdf": "📥 PDF ডাউনলোড",
        "reports.download_csv": "📊 CSV এক্সপোর্ট", "reports.all_sectors": "সব সেক্টর",
        "reports.date": "তারিখ", "reports.category": "ক্যাটাগরি", "reports.sector": "সেক্টর",
        "reports.amount": "পরিমাণ",
        "lab.title": "ফাইনান্সিয়াল ল্যাব ও ক্যালকুলেটর", "lab.zakat": "☪️ যাকাত ক্যালকুলেটর (২.৫%)", "lab.emi": "🏦 লোন কিস্তি (EMI) ক্যালকুলেটর",
        "lab.payable": "প্রদেয় যাকাত (২.৫%)", "lab.assets_placeholder": "মোট সম্পদ",
        "settings.global": "🌍 গ্লোবাল সেটিংস", "settings.currency": "বেস কারেন্সি",
        "settings.security": "🔒 সিকিউরিটি PIN লক", "settings.pin_placeholder": "PIN কোড",
        "settings.save_pin": "PIN সেভ করুন", "settings.clear_pin": "PIN মুছুন",
        "settings.data": "📥 ডাটা ব্যাকআপ ও ইমপোর্ট", "settings.export": "⬇ JSON ব্যাকআপ ডাউনলোড",
        "settings.import": "⬆ JSON ফাইল ইমপোর্ট",
        "sectors.general": "সাধারণ", "sectors.personal": "ব্যক্তিগত", "sectors.business": "ব্যবসায়িক", "sectors.social": "সামাজিক",
        "methods.cash": "নগদ ওয়ালেট", "methods.bank": "ব্যাংক অ্যাকাউন্ট"
    }
};

// --- Helper Functions ---
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

function showToast(msg, duration = 2800) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

function formatCurrency(n) {
    if (isPrivateMode) return '••••••';
    const absVal = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return `${currency}${absVal}`;
}

// --- Navigation Tabs ---
window.switchTab = function(tabName) {
    document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`tab-${tabName}`);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.nav-tabs .tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });

    if (tabName === 'reports') renderReports();
    if (tabName === 'accounting') renderAccounting();
    if (tabName === 'goals') renderGoalsAndBudgets();
};

document.querySelectorAll('.nav-tabs .tab[data-tab]').forEach(tab => {
    tab.onclick = () => switchTab(tab.dataset.tab);
});

// --- Theme & Privacy Switchers ---
function initTheme() {
    const savedTheme = localStorage.getItem('app_theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
}
document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    const curr = document.documentElement.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = curr === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('app_theme', next);
    showToast(`Switched to ${next} theme`);
});

document.getElementById('privacy-toggle-btn')?.addEventListener('click', () => {
    isPrivateMode = !isPrivateMode;
    localStorage.setItem('privacy_mode', isPrivateMode ? 'true' : 'false');
    const btn = document.getElementById('privacy-toggle-btn');
    if (btn) btn.innerText = isPrivateMode ? '🙈' : '👁️';
    showToast(isPrivateMode ? 'Privacy Mode Enabled (Numbers Masked)' : 'Privacy Mode Disabled');
    fetchData();
});

function toggleLang() {
    currentLang = currentLang === 'en' ? 'bn' : 'en';
    localStorage.setItem('app_lang', currentLang);
    applyLocales();
    fetchData();
}
document.getElementById('lang-toggle-btn')?.addEventListener('click', toggleLang);

// --- Currency Selectors ---
function setupCurrencySelector(id) {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.value = currency;
    sel.onchange = () => {
        currency = sel.value;
        localStorage.setItem('base_currency', currency);
        document.querySelectorAll('#currency-select, #quick-currency-select').forEach(s => s.value = currency);
        fetchData();
        renderAccounting();
        renderGoalsAndBudgets();
        renderReports();
    };
}
setupCurrencySelector('currency-select');
setupCurrencySelector('quick-currency-select');

// --- Security PIN Overlay ---
function checkPinLock() {
    const pin = localStorage.getItem('app_pin');
    const overlay = document.getElementById('pin-overlay');
    if (pin && overlay) {
        overlay.classList.remove('hidden');
        document.getElementById('pin-unlock-btn').onclick = () => {
            const input = document.getElementById('pin-unlock-input').value;
            if (input === pin) {
                overlay.classList.add('hidden');
                document.getElementById('pin-unlock-input').value = '';
                showToast('🔓 Unlocked successfully');
            } else {
                showToast('❌ Incorrect PIN');
            }
        };
    }
}

// --- Auth Section Handlers ---
const authForm = document.getElementById('auth-form');
if (authForm) authForm.onsubmit = handleAuth;

document.getElementById('github-login-btn')?.addEventListener('click', () => {
    if (supabaseClient) {
        supabaseClient.auth.signInWithOAuth({
            provider: 'github',
            options: { redirectTo: window.location.origin }
        });
    } else {
        loginAsGuest();
        initApp();
    }
});

document.getElementById('guest-login-btn')?.addEventListener('click', () => {
    loginAsGuest();
    showToast('⚡ Logged in as Demo Manager!');
    initApp();
});

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

document.getElementById('logout-btn-settings')?.addEventListener('click', () => logout());

// --- Dashboard Data Core ---
const dashboardMonth = document.getElementById('dashboard-month');
if (dashboardMonth) dashboardMonth.value = new Date().toISOString().substring(0, 7);

async function fetchData() {
    const user = getUser();
    if (!user) return;
    applyLocales();

    const selectedMonth = dashboardMonth ? dashboardMonth.value : new Date().toISOString().substring(0, 7);
    try {
        const txs = await fetchTransactions(user.id);
        allTransactions = txs;
        
        // Auto-seed demo data if transaction list is completely empty
        if (!allTransactions.length) {
            allTransactions = seedDemoData();
        }

        const filtered = allTransactions.filter(tx => tx.occurred_at?.startsWith(selectedMonth));

        let inc = 0, exp = 0;
        filtered.forEach(tx => {
            if (tx.type === 'income') inc += parseFloat(tx.amount || 0);
            else if (tx.type === 'expense') exp += parseFloat(tx.amount || 0);
        });

        const totalBalEl = document.getElementById('total-balance');
        const incEl = document.getElementById('total-income');
        const expEl = document.getElementById('total-expense');
        const rateEl = document.getElementById('savings-rate-pct');
        const netEl = document.getElementById('net-cashflow');

        const netSavings = inc - exp;
        const savingsRate = inc > 0 ? Math.round((netSavings / inc) * 100) : 0;

        if (totalBalEl) totalBalEl.innerText = formatCurrency(netSavings);
        if (incEl) incEl.innerText = formatCurrency(inc);
        if (expEl) expEl.innerText = formatCurrency(exp);
        if (rateEl) rateEl.innerText = `${savingsRate}%`;
        if (netEl) netEl.innerText = formatCurrency(netSavings);

        updateAssistant(inc, exp);
        renderTopCategories(filtered);
        filterAndRenderTransactions();
        renderMainChart(filtered);
    } catch (err) {
        console.error('Data load error:', err);
        showToast('⚠️ Failed to refresh financial data');
    }
}

// --- Filterable Transaction List ---
function filterAndRenderTransactions() {
    const selectedMonth = dashboardMonth ? dashboardMonth.value : new Date().toISOString().substring(0, 7);
    let list = allTransactions.filter(tx => tx.occurred_at?.startsWith(selectedMonth));

    const q = document.getElementById('tx-search')?.value.toLowerCase();
    const cat = document.getElementById('tx-filter-category')?.value;
    const type = document.getElementById('tx-filter-type')?.value;

    if (q) {
        list = list.filter(tx =>
            (tx.category_name || '').toLowerCase().includes(q) ||
            (tx.notes || '').toLowerCase().includes(q) ||
            (tx.method || '').toLowerCase().includes(q)
        );
    }

    if (cat) {
        list = list.filter(tx => tx.category_name === cat);
    }

    if (type) {
        list = list.filter(tx => tx.type === type);
    }

    const countBadge = document.getElementById('tx-count-badge');
    if (countBadge) countBadge.innerText = `${list.length} items`;

    renderTransactionList(list);
}

document.getElementById('tx-search')?.addEventListener('input', filterAndRenderTransactions);
document.getElementById('tx-filter-category')?.addEventListener('change', filterAndRenderTransactions);
document.getElementById('tx-filter-type')?.addEventListener('change', filterAndRenderTransactions);

function renderTransactionList(list) {
    const container = document.getElementById('transaction-list');
    if (!container) return;

    if (!list.length) {
        container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">💸</div>
            <div class="empty-state-title">No Transactions Found</div>
            <div class="empty-state-sub">No transaction records match your selected month or search query.</div>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:center; margin-top:0.4rem;">
                <button onclick="switchTab('add')" class="empty-state-action">➕ Add Transaction</button>
                <button onclick="document.getElementById('seed-demo-btn').click()" class="btn-ghost btn-sm" style="border-radius:999px;">✨ Seed Sample Data</button>
            </div>
        </div>`;
        return;
    }

    const ICONS = { Food: '🍔', Transport: '🚗', Rent: '🏠', Utilities: '💡', Health: '💊',
        Education: '📚', Salary: '💼', Business: '🏪', Gift: '🎁', Investment: '📈', Transfer: '⇄', Other: '📦', Default: '💰' };

    container.innerHTML = list.map(tx => {
        const isInc = tx.type === 'income';
        const isTrf = tx.type === 'transfer';
        const icon = isTrf ? '⇄' : (ICONS[tx.category_name] || ICONS['Default']);
        const date = tx.occurred_at ? new Date(tx.occurred_at).toLocaleDateString() : '';
        
        let txClass = 'tx-expense-icon';
        let txColor = 'var(--expense)';
        let sign = '-';
        if (isInc) { txClass = 'tx-income-icon'; txColor = 'var(--income)'; sign = '+'; }
        if (isTrf) { txClass = 'tx-transfer-icon'; txColor = 'var(--transfer)'; sign = '⇄ '; }

        return `
        <div class="transaction-item">
            <div style="display:flex; align-items:center; gap: 0.75rem; flex: 1;">
                <div class="tx-icon ${txClass}">${icon}</div>
                <div>
                    <strong style="font-size: 0.92rem;">${tx.category_name || (isTrf ? 'Transfer' : 'General')}</strong>
                    <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 1px;">
                        ${date} · <span class="badge badge-blue" style="padding: 0.1rem 0.4rem;">${tx.metadata?.sector || 'General'}</span> · ${tx.method || 'Cash'}
                    </div>
                    ${tx.notes ? `<div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">${tx.notes}</div>` : ''}
                </div>
            </div>
            <div style="text-align:right; flex-shrink: 0;">
                <span style="color:${txColor}; font-weight: 700; font-size: 0.95rem;">
                    ${sign}${formatCurrency(parseFloat(tx.amount || 0))}
                </span>
                <div style="display: flex; gap: 4px; justify-content: flex-end; margin-top: 4px;">
                    <button onclick="openEditModal('${tx.id}')" style="background: transparent; color: var(--primary); padding: 1px 6px; font-size: 0.72rem; width: auto; border: 1px solid var(--border); border-radius: 4px;" title="Edit">✏️</button>
                    <button onclick="deleteTx('${tx.id}')" style="background: transparent; color: var(--expense); padding: 1px 6px; font-size: 0.72rem; width: auto; border: 1px solid var(--border); border-radius: 4px;" title="Delete">✕</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// --- Edit & Delete Handlers ---
window.deleteTx = async (id) => {
    if (!confirm('Are you sure you want to delete this transaction record?')) return;
    try {
        await deleteTransaction(id);
        showToast('Transaction record deleted');
        fetchData();
        renderAccounting();
    } catch (err) {
        console.error(err);
        showToast('❌ Failed to delete record');
    }
};

window.openEditModal = (id) => {
    const tx = allTransactions.find(t => t.id === id);
    if (!tx) return;
    document.getElementById('edit-tx-id').value = tx.id;
    document.getElementById('edit-tx-amount').value = tx.amount;
    document.getElementById('edit-tx-category').value = tx.category_name || 'Other';
    document.getElementById('edit-tx-method').value = tx.method || 'Cash';
    document.getElementById('edit-tx-sector').value = tx.metadata?.sector || 'General';
    document.getElementById('edit-tx-date').value = tx.occurred_at ? tx.occurred_at.split('T')[0] : new Date().toISOString().split('T')[0];
    document.getElementById('edit-tx-note').value = tx.notes || '';
    
    window.setEditType(tx.type || 'expense');
    document.getElementById('edit-tx-modal').classList.remove('hidden');
};

window.closeEditModal = () => {
    document.getElementById('edit-tx-modal').classList.add('hidden');
};

document.getElementById('edit-tx-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-tx-id').value;
    const updated = {
        amount: parseFloat(document.getElementById('edit-tx-amount').value),
        type: document.getElementById('edit-tx-type').value,
        category_name: document.getElementById('edit-tx-category').value,
        method: document.getElementById('edit-tx-method').value,
        occurred_at: new Date(document.getElementById('edit-tx-date').value).toISOString(),
        notes: document.getElementById('edit-tx-note').value || null,
        metadata: { sector: document.getElementById('edit-tx-sector').value }
    };

    try {
        await updateTransaction(id, updated);
        showToast('✅ Transaction updated');
        closeEditModal();
        fetchData();
        renderAccounting();
    } catch (err) {
        console.error(err);
        showToast('❌ Failed to update transaction');
    }
});

// --- Seed Demo Data Button ---
document.getElementById('seed-demo-btn')?.addEventListener('click', () => {
    seedDemoData();
    showToast('✨ Realistic demo data loaded successfully!');
    fetchData();
    renderAccounting();
    renderGoalsAndBudgets();
});

// --- Doughnut Analytics Chart ---
function renderMainChart(txs) {
    const ctx = document.getElementById('main-chart');
    if (!ctx) return;

    const catMap = {};
    txs.filter(tx => tx.type === 'expense').forEach(tx => {
        catMap[tx.category_name || 'Other'] = (catMap[tx.category_name || 'Other'] || 0) + parseFloat(tx.amount || 0);
    });

    const labels = Object.keys(catMap);
    const data = Object.values(catMap);

    let emptyOverlay = document.getElementById('chart-empty-state');

    if (!labels.length) {
        ctx.style.display = 'none';
        if (!emptyOverlay) {
            emptyOverlay = document.createElement('div');
            emptyOverlay.id = 'chart-empty-state';
            ctx.parentNode.appendChild(emptyOverlay);
        }
        emptyOverlay.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">📈</div>
            <div class="empty-state-title">Visual Analytics Standby</div>
            <div class="empty-state-sub">Record monthly expenses to generate a visual breakdown of your spending habits.</div>
            <button onclick="switchTab('add'); window.setType('expense');" class="empty-state-action">🔴 Record Expense</button>
        </div>`;
        if (charts.main) { charts.main.destroy(); charts.main = null; }
        return;
    }

    if (emptyOverlay) emptyOverlay.remove();
    ctx.style.display = 'block';

    const COLORS = ['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6'];
    if (charts.main) charts.main.destroy();
    charts.main = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: COLORS.slice(0, labels.length),
                borderWidth: 3,
                borderColor: 'var(--card)'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 }, padding: 14 } },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`
                    }
                }
            }
        }
    });
}

// --- Top Categories Sidebar ---
function renderTopCategories(txs) {
    const container = document.getElementById('top-categories-list');
    if (!container) return;

    const catMap = {};
    let totalExp = 0;
    txs.filter(tx => tx.type === 'expense').forEach(tx => {
        const val = parseFloat(tx.amount || 0);
        catMap[tx.category_name || 'Other'] = (catMap[tx.category_name || 'Other'] || 0) + val;
        totalExp += val;
    });

    const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 4);

    if (!sorted.length) {
        container.innerHTML = `
        <div class="empty-state" style="padding: 1.2rem;">
            <div class="empty-state-icon" style="font-size: 1.8rem;">📊</div>
            <div class="empty-state-title" style="font-size: 0.95rem;">No Expenses Logged</div>
            <div class="empty-state-sub" style="font-size: 0.78rem; margin-bottom: 0.5rem;">Start recording your expenses to see top spending sectors.</div>
        </div>`;
        return;
    }

    container.innerHTML = sorted.map(([cat, amt]) => {
        const pct = totalExp > 0 ? Math.round((amt / totalExp) * 100) : 0;
        return `
        <div style="margin-bottom: 0.75rem;">
            <div style="display:flex; justify-content:space-between; font-size:0.84rem; margin-bottom:3px;">
                <span style="font-weight:600;">${cat}</span>
                <span style="color:var(--text-muted);">${formatCurrency(amt)} (${pct}%)</span>
            </div>
            <div class="health-bar-wrap">
                <div class="health-bar" style="width:${pct}%; background: var(--primary);"></div>
            </div>
        </div>`;
    }).join('');
}


// --- AI Financial Advisor ---
function updateAssistant(inc, exp) {
    const badge = document.getElementById('health-score-badge');
    const bar = document.getElementById('health-bar');
    const advice = document.getElementById('assistant-advice');
    if (!badge) return;

    const score = Math.max(0, Math.min(100, Math.round((inc > 0 ? (inc - exp) / inc : 0) * 200)));
    badge.innerText = `Score: ${score}/100`;
    badge.className = `badge ${score > 70 ? 'badge-green' : score > 40 ? 'badge-blue' : 'badge-red'}`;
    
    if (bar) {
        bar.style.width = `${score}%`;
        bar.style.background = score > 70 ? 'var(--income)' : score > 40 ? '#f59e0b' : 'var(--expense)';
    }

    if (advice) {
        const savings = inc - exp;
        const savingsRate = inc > 0 ? Math.round((savings / inc) * 100) : 0;

        advice.innerHTML = exp > inc
            ? `• 🔴 <strong>Critical Budget Deficit:</strong> Expenses exceed income by ${formatCurrency(exp - inc)}.<br>• Cut non-essential spending on dining & entertainment.`
            : `• ✅ <strong>Healthy Cashflow:</strong> Saving <strong>${savingsRate}%</strong> of monthly income.<br>• Net monthly accumulation: <strong>${formatCurrency(savings)}</strong>`;
    }
}

if (dashboardMonth) dashboardMonth.onchange = fetchData;

// --- Add Transaction Form ---
const txForm = document.getElementById('tx-form');
if (txForm) {
    txForm.onsubmit = async (e) => {
        e.preventDefault();
        const user = getUser();
        if (!user) { showToast('Please login first'); return; }

        const btn = document.getElementById('tx-save-btn');
        btn.disabled = true;
        btn.innerText = 'Saving Record...';

        try {
            const txType = document.getElementById('tx-type').value;
            const amount = parseFloat(document.getElementById('tx-amount').value);
            const method = document.getElementById('tx-method').value;
            const targetMethod = document.getElementById('tx-target-method')?.value;
            const occurred_at = new Date(document.getElementById('tx-date').value).toISOString();

            if (txType === 'transfer') {
                // Create transfer record
                const txData = {
                    user_id: user.id,
                    amount,
                    type: 'transfer',
                    category_name: `Transfer (${method} ➔ ${targetMethod})`,
                    method,
                    notes: document.getElementById('tx-note').value || `Transfer from ${method} to ${targetMethod}`,
                    occurred_at,
                    currency: currency === '৳' ? 'BDT' : currency,
                    metadata: { sector: document.getElementById('tx-sector').value, target_account: targetMethod }
                };
                await addTransaction(txData);
            } else {
                const txData = {
                    user_id: user.id,
                    amount,
                    type: txType,
                    category_name: document.getElementById('tx-category').value,
                    method,
                    notes: document.getElementById('tx-note').value || null,
                    occurred_at,
                    currency: currency === '৳' ? 'BDT' : currency,
                    metadata: { sector: document.getElementById('tx-sector').value }
                };
                await addTransaction(txData);
            }

            showToast('✅ Record saved successfully!');
            txForm.reset();
            window.setType('expense');
            document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
            await fetchData();
            switchTab('dashboard');
        } catch (err) {
            showToast('❌ Error saving record');
        } finally {
            btn.disabled = false;
            btn.innerText = t('add.save');
        }
    };
}

// --- Accounting Render ---
function renderAccounting() {
    const month = dashboardMonth?.value || new Date().toISOString().substring(0, 7);
    const filtered = allTransactions.filter(tx => tx.occurred_at?.startsWith(month));
    let inc = 0, exp = 0;
    filtered.forEach(tx => {
        if (tx.type === 'income') inc += parseFloat(tx.amount || 0);
        else if (tx.type === 'expense') exp += parseFloat(tx.amount || 0);
    });

    const pnlInc = document.getElementById('pnl-income');
    const pnlExp = document.getElementById('pnl-expense');
    const pnlNet = document.getElementById('pnl-net');

    if (pnlInc) pnlInc.innerText = formatCurrency(inc);
    if (pnlExp) pnlExp.innerText = formatCurrency(exp);
    if (pnlNet) {
        const net = inc - exp;
        pnlNet.innerText = formatCurrency(net);
        pnlNet.style.color = net >= 0 ? 'var(--income)' : 'var(--expense)';
    }

    // Render Assets & Debts
    const assets = JSON.parse(localStorage.getItem('assets') || '[]');
    const debts = JSON.parse(localStorage.getItem('debts') || '[]');

    const totalAssets = assets.reduce((s, a) => s + parseFloat(a.balance || 0), 0);
    const totalDebts = debts.reduce((s, d) => s + parseFloat(d.balance || 0), 0);

    const nwAssets = document.getElementById('nw-assets');
    const nwDebts = document.getElementById('nw-liabilities');
    const nwTotal = document.getElementById('nw-total');

    if (nwAssets) nwAssets.innerText = formatCurrency(totalAssets);
    if (nwDebts) nwDebts.innerText = formatCurrency(totalDebts);
    if (nwTotal) {
        const nw = totalAssets - totalDebts;
        nwTotal.innerText = formatCurrency(nw);
        nwTotal.style.color = nw >= 0 ? 'var(--primary)' : 'var(--expense)';
    }

    const assetsList = document.getElementById('assets-list');
    if (assetsList) {
        assetsList.innerHTML = assets.map((a, i) => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0; border-bottom: 1px solid var(--border); font-size: 0.88rem;">
                <span>💳 <strong>${a.name}</strong></span>
                <span>${formatCurrency(parseFloat(a.balance))}
                    <button onclick="removeAsset(${i})" style="background:transparent; color:var(--expense); width:auto; padding:1px 5px; font-size:0.75rem; margin:0 0 0 6px; border:none;" title="Remove">✕</button>
                </span>
            </div>
        `).join('') || `
        <div class="empty-state" style="padding: 1.2rem;">
            <div class="empty-state-icon" style="font-size: 1.8rem;">💳</div>
            <div class="empty-state-title" style="font-size: 0.95rem;">No Financial Accounts</div>
            <div class="empty-state-sub" style="font-size: 0.78rem; margin-bottom: 0.5rem;">Add checking accounts, cash wallets, or fixed deposits to track net worth.</div>
        </div>`;
    }

    const debtsList = document.getElementById('debts-list');
    if (debtsList) {
        debtsList.innerHTML = debts.map((d, i) => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0; border-bottom: 1px solid var(--border); font-size: 0.88rem;">
                <span>💸 <strong>${d.name}</strong></span>
                <span style="color: var(--expense);">${formatCurrency(parseFloat(d.balance))}
                    <button onclick="removeDebt(${i})" style="background:transparent; color:var(--expense); width:auto; padding:1px 5px; font-size:0.75rem; margin:0 0 0 6px; border:none;" title="Remove">✕</button>
                </span>
            </div>
        `).join('') || `
        <div class="empty-state" style="padding: 1.2rem;">
            <div class="empty-state-icon" style="font-size: 1.8rem;">🏷️</div>
            <div class="empty-state-title" style="font-size: 0.95rem;">Zero Outstanding Liabilities</div>
            <div class="empty-state-sub" style="font-size: 0.78rem; margin-bottom: 0;">You currently have zero recorded loans or credit card debts.</div>
        </div>`;
    }

    renderRecurring();
}

// Asset and Debt Forms
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
    showToast('Asset account saved');
});

window.removeAsset = (i) => {
    const assets = JSON.parse(localStorage.getItem('assets') || '[]');
    assets.splice(i, 1);
    localStorage.setItem('assets', JSON.stringify(assets));
    renderAccounting();
};

document.getElementById('debt-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('debt-name').value.trim();
    const bal = parseFloat(document.getElementById('debt-balance').value || 0);
    if (!name) return;
    const debts = JSON.parse(localStorage.getItem('debts') || '[]');
    debts.push({ name, balance: bal });
    localStorage.setItem('debts', JSON.stringify(debts));
    document.getElementById('debt-form').reset();
    renderAccounting();
    showToast('Liability record saved');
});

window.removeDebt = (i) => {
    const debts = JSON.parse(localStorage.getItem('debts') || '[]');
    debts.splice(i, 1);
    localStorage.setItem('debts', JSON.stringify(debts));
    renderAccounting();
};

// Recurring Form
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
    showToast('Recurring schedule saved');
});

function renderRecurring() {
    const list = document.getElementById('recurring-list');
    if (!list) return;
    const recs = JSON.parse(localStorage.getItem('recurrings') || '[]');
    list.innerHTML = recs.map((r, i) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.6rem 0; border-bottom: 1px solid var(--border); font-size: 0.88rem;">
            <div>
                <strong>${r.name}</strong>
                <span class="badge ${r.type === 'income' ? 'badge-green' : 'badge-red'}" style="margin-left:6px;">${r.type}</span>
                <div style="font-size: 0.76rem; color: var(--text-muted);">Due Day ${r.day} of every month</div>
            </div>
            <div style="text-align:right;">
                <strong style="color:${r.type === 'income' ? 'var(--income)' : 'var(--expense)'};">${formatCurrency(r.amount)}</strong>
                <button onclick="removeRecurring(${i})" style="display:block; background:transparent; color:var(--expense); width:auto; padding:1px 5px; font-size:0.7rem; margin:3px 0 0 auto; border:none;">✕ Delete</button>
            </div>
        </div>
    `).join('') || `
    <div class="empty-state" style="padding: 1.2rem;">
        <div class="empty-state-icon" style="font-size: 1.8rem;">🔄</div>
        <div class="empty-state-title" style="font-size: 0.95rem;">No Recurring Schedules</div>
        <div class="empty-state-sub" style="font-size: 0.78rem; margin-bottom: 0;">Automate monthly rent, software subscriptions, or salary reminders.</div>
    </div>`;
}

window.removeRecurring = (i) => {
    const recs = JSON.parse(localStorage.getItem('recurrings') || '[]');
    recs.splice(i, 1);
    localStorage.setItem('recurrings', JSON.stringify(recs));
    renderRecurring();
};

// --- Goals & Budgets Render ---
function renderGoalsAndBudgets() {
    const month = dashboardMonth?.value || new Date().toISOString().substring(0, 7);
    const filtered = allTransactions.filter(tx => tx.occurred_at?.startsWith(month));

    // Category Budgets
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
            <div style="margin-bottom: 0.85rem;">
                <div style="display:flex; justify-content:space-between; font-size:0.88rem; margin-bottom:3px;">
                    <span style="font-weight:600;">${cat}</span>
                    <span style="color:${over ? 'var(--expense)' : 'var(--text-muted)'}; font-weight:600;">
                        ${formatCurrency(spent)} / ${formatCurrency(limit)} (${pct}%)
                    </span>
                </div>
                <div class="health-bar-wrap">
                    <div class="health-bar" style="width:${pct}%; background:${over ? 'var(--expense)' : pct > 85 ? '#f59e0b' : 'var(--income)'};"></div>
                </div>
                ${over ? `<small style="color:var(--expense); font-weight:600;">⚠️ Over budget cap by ${formatCurrency(spent - limit)}</small>` : ''}
            </div>`;
        }).join('') || `
        <div class="empty-state">
            <div class="empty-state-icon">🎯</div>
            <div class="empty-state-title">No Monthly Budget Caps</div>
            <div class="empty-state-sub">Set monthly spending limits for food, rent, or transport to receive spending alerts.</div>
        </div>`;
    }

    // Savings Goals
    const goals = JSON.parse(localStorage.getItem('savings_goals') || '[]');
    const goalsList = document.getElementById('goals-list');
    if (goalsList) {
        goalsList.innerHTML = goals.map((g, i) => {
            const saved = parseFloat(g.saved || 0);
            const target = parseFloat(g.target || 1);
            const pct = Math.min(100, Math.round((saved / target) * 100));
            return `
            <div style="padding: 0.85rem; border: 1px solid var(--border); border-radius: var(--radius-sm); margin-bottom: 0.75rem; background: var(--bg);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.4rem;">
                    <strong style="font-size: 0.95rem;">🎯 ${g.name}</strong>
                    <button onclick="removeGoal(${i})" style="background:transparent; color:var(--expense); border:none; width:auto; font-size:0.8rem;">✕</button>
                </div>
                <div style="display:flex; justify-content:space-between; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.4rem;">
                    <span>Saved: <strong style="color: var(--income);">${formatCurrency(saved)}</strong></span>
                    <span>Target: <strong>${formatCurrency(target)}</strong></span>
                </div>
                <div class="health-bar-wrap">
                    <div class="health-bar" style="width:${pct}%; background: var(--income);"></div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 0.5rem;">
                    <span style="font-size: 0.78rem; color: var(--text-muted);">${pct}% completed · Due ${g.deadline || 'N/A'}</span>
                    <button onclick="depositToGoal(${i})" class="btn-sm btn-success" style="padding: 2px 8px; font-size: 0.76rem;">+ Deposit</button>
                </div>
            </div>`;
        }).join('') || `
        <div class="empty-state">
            <div class="empty-state-icon">🏆</div>
            <div class="empty-state-title">No Savings Goals Created</div>
            <div class="empty-state-sub">Establish goals like Emergency Fund, Tech Upgrade, or Vacation to track your progress.</div>
        </div>`;
    }
}


// Budget Form
document.getElementById('budget-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const cat = document.getElementById('budget-category').value;
    const limit = parseFloat(document.getElementById('budget-limit').value || 0);
    if (!limit) return;
    const budgets = JSON.parse(localStorage.getItem('budgets') || '{}');
    budgets[cat] = limit;
    localStorage.setItem('budgets', JSON.stringify(budgets));
    document.getElementById('budget-form').reset();
    renderGoalsAndBudgets();
    showToast('Budget cap saved');
});

// Goal Form
document.getElementById('goal-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('goal-name').value.trim();
    const target = parseFloat(document.getElementById('goal-target').value || 0);
    const saved = parseFloat(document.getElementById('goal-saved').value || 0);
    const deadline = document.getElementById('goal-date').value;

    if (!name || !target) return;
    const goals = JSON.parse(localStorage.getItem('savings_goals') || '[]');
    goals.push({ id: 'g-' + Date.now(), name, target, saved, deadline });
    localStorage.setItem('savings_goals', JSON.stringify(goals));
    document.getElementById('goal-form').reset();
    renderGoalsAndBudgets();
    showToast('Savings goal created');
});

window.removeGoal = (i) => {
    const goals = JSON.parse(localStorage.getItem('savings_goals') || '[]');
    goals.splice(i, 1);
    localStorage.setItem('savings_goals', JSON.stringify(goals));
    renderGoalsAndBudgets();
};

window.depositToGoal = async (i) => {
    const amtStr = prompt('Enter deposit amount into savings goal:');
    const amt = parseFloat(amtStr);
    if (isNaN(amt) || amt <= 0) return;

    const goals = JSON.parse(localStorage.getItem('savings_goals') || '[]');
    if (goals[i]) {
        goals[i].saved = parseFloat(goals[i].saved || 0) + amt;
        localStorage.setItem('savings_goals', JSON.stringify(goals));

        // Auto-create transfer transaction
        const user = getUser();
        if (user) {
            await addTransaction({
                user_id: user.id,
                amount: amt,
                type: 'transfer',
                category_name: 'Savings Deposit',
                method: 'Bank',
                notes: `Deposit to savings goal: ${goals[i].name}`,
                occurred_at: new Date().toISOString(),
                currency: currency === '৳' ? 'BDT' : currency,
                metadata: { sector: 'Personal' }
            });
        }

        renderGoalsAndBudgets();
        fetchData();
        showToast(`✅ Deposited ${formatCurrency(amt)} into ${goals[i].name}!`);
    }
};

// --- Reports ---
function renderReports() {
    const month = document.getElementById('report-month')?.value || new Date().toISOString().substring(0, 7);
    const sector = document.getElementById('report-sector')?.value || '';
    const type = document.getElementById('report-type')?.value || '';
    const tbody = document.getElementById('report-tbody');
    const summary = document.getElementById('report-summary');
    if (!tbody) return;

    let filtered = allTransactions.filter(tx => tx.occurred_at?.startsWith(month));
    if (sector) filtered = filtered.filter(tx => tx.metadata?.sector === sector);
    if (type) filtered = filtered.filter(tx => tx.type === type);

    let inc = 0, exp = 0;
    filtered.forEach(tx => {
        if (tx.type === 'income') inc += parseFloat(tx.amount || 0);
        else if (tx.type === 'expense') exp += parseFloat(tx.amount || 0);
    });

    tbody.innerHTML = filtered.map(tx => `
        <tr>
            <td>${tx.occurred_at ? new Date(tx.occurred_at).toLocaleDateString() : ''}</td>
            <td><strong>${tx.category_name || 'N/A'}</strong></td>
            <td><span class="badge badge-blue">${tx.metadata?.sector || 'General'}</span></td>
            <td>${tx.method || 'Cash'}</td>
            <td style="color: ${tx.type === 'income' ? 'var(--income)' : tx.type === 'expense' ? 'var(--expense)' : 'var(--transfer)'}; font-weight: 700;">
                ${tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '⇄'}${formatCurrency(parseFloat(tx.amount || 0))}
            </td>
        </tr>
    `).join('') || `
    <tr>
        <td colspan="5" style="padding: 0;">
            <div class="empty-state" style="margin: 0; border: none; background: transparent; padding: 1.8rem 1rem;">
                <div class="empty-state-icon" style="font-size: 2rem;">📑</div>
                <div class="empty-state-title" style="font-size: 0.95rem;">No Financial Records</div>
                <div class="empty-state-sub" style="font-size: 0.8rem; margin-bottom: 0;">No transactions match your selected period, sector, or type filters.</div>
            </div>
        </td>
    </tr>`;


    if (summary) {
        summary.innerHTML = `
            <strong>Period Summary (${month}):</strong><br>
            • Total Revenue: <span style="color:var(--income); font-weight:700;">${formatCurrency(inc)}</span> |
            Total Expenses: <span style="color:var(--expense); font-weight:700;">${formatCurrency(exp)}</span><br>
            • Net Profit/Loss: <strong>${formatCurrency(inc - exp)}</strong>
        `;
    }
}

document.getElementById('report-month')?.addEventListener('change', renderReports);
document.getElementById('report-sector')?.addEventListener('change', renderReports);
document.getElementById('report-type')?.addEventListener('change', renderReports);

// --- PDF & CSV Exports ---
document.getElementById('pdf-btn')?.addEventListener('click', () => {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) { showToast('PDF export library not ready'); return; }
    const doc = new jsPDF();
    const month = document.getElementById('report-month')?.value || '';
    const sector = document.getElementById('report-sector')?.value || 'All';

    doc.setFontSize(16);
    doc.text('Money Footprint – Financial Statement Report', 14, 18);
    doc.setFontSize(10);
    doc.text(`Period: ${month} | Sector: ${sector} | Date Generated: ${new Date().toLocaleDateString()}`, 14, 26);

    let filtered = allTransactions.filter(tx => tx.occurred_at?.startsWith(month));
    if (sector) filtered = filtered.filter(tx => tx.metadata?.sector === sector);

    const rows = filtered.map(tx => [
        tx.occurred_at ? new Date(tx.occurred_at).toLocaleDateString() : '',
        tx.category_name || 'N/A',
        tx.type,
        tx.metadata?.sector || 'General',
        tx.method || 'Cash',
        `${tx.type === 'income' ? '+' : '-'}${currency}${parseFloat(tx.amount || 0).toFixed(2)}`
    ]);

    doc.autoTable({
        startY: 32,
        head: [['Date', 'Category', 'Type', 'Sector', 'Method', 'Amount']],
        body: rows,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] }
    });

    doc.save(`Financial_Statement_${month}.pdf`);
    showToast('📥 PDF statement downloaded!');
});

document.getElementById('csv-btn')?.addEventListener('click', () => {
    const month = document.getElementById('report-month')?.value || '';
    let filtered = allTransactions.filter(tx => tx.occurred_at?.startsWith(month));
    const sector = document.getElementById('report-sector')?.value;
    if (sector) filtered = filtered.filter(tx => tx.metadata?.sector === sector);

    const header = 'Date,Category,Type,Sector,Method,Amount,Notes\n';
    const rows = filtered.map(tx =>
        `"${new Date(tx.occurred_at).toLocaleDateString()}","${tx.category_name}","${tx.type}","${tx.metadata?.sector || 'General'}","${tx.method || 'Cash'}",${tx.amount},"${tx.notes || ''}"`
    ).join('\n');
    
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([header + rows], { type: 'text/csv' }));
    a.download = `transactions_${month}.csv`;
    a.click();
    showToast('📊 CSV spreadsheet exported!');
});

// --- Data Export & Import ---
document.getElementById('export-btn')?.addEventListener('click', () => {
    exportData(allTransactions);
    showToast('✅ Full JSON backup downloaded!');
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
            if (importData(data)) {
                showToast(`📂 Imported ${data.transactions?.length || 0} transactions!`);
                fetchData();
                renderAccounting();
                renderGoalsAndBudgets();
            }
        } catch {
            showToast('❌ Invalid JSON backup file');
        }
    };
    reader.readAsText(file);
});

// --- App Initialization ---
async function initApp() {
    initTheme();
    checkPinLock();

    const user = getUser();
    const authSection = document.getElementById('auth-section');
    const appSection = document.getElementById('app-section');

    if (user) {
        authSection?.classList.add('hidden');
        appSection?.classList.remove('hidden');
        applyLocales();
        await fetchData();
        renderAccounting();
        renderGoalsAndBudgets();
    } else {
        authSection?.classList.remove('hidden');
        appSection?.classList.add('hidden');
        applyLocales();
    }
}

if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
            setUser(session.user);
            initApp();
        }
    });
}

initApp();
