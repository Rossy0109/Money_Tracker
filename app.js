import { locales } from './locales.js';
import { db, auth, googleProvider } from './firebase-config.js';
import { 
    collection, addDoc, onSnapshot, query, orderBy, doc, 
    deleteDoc, setDoc, Timestamp, where, enableIndexedDbPersistence 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    signInWithPopup, signOut, onAuthStateChanged,
    createUserWithEmailAndPassword, signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- Global State ---
let state = {
    user: null,
    isSignupMode: false,
    lang: localStorage.getItem('lang') || 'bn',
    transactions: [],
    categories: [],
    budgets: [],
    recurring: [],
    goals: [],
    paymentMethods: [
        { id: 1, name: 'নগদ টাকা', icon: '💵' },
        { id: 2, name: 'ব্যাংক অ্যাকাউন্ট', icon: '🏦' },
        { id: 3, name: 'bKash', icon: '📱' },
        { id: 4, name: 'Nagad', icon: '💳' },
        { id: 5, name: 'Rocket', icon: '🚀' }
    ],
    chart: null,
    pieChart: null,
    totalBalance: 0,
    searchTerm: ''
};

import { DataHub } from './data-hub.js';

// --- Global State ---
let state = {
    user: null,
    // ... rest of state unchanged
    
// --- Infrastructure: DataHub Wrapper ---
const DB = {
    sync: (coll, callback, orderField = null) => DataHub.sync(coll, callback, orderField, state.user.uid),
    add: async (coll, data) => await DataHub.add(coll, data, state.user.uid),
    update: async (coll, id, data) => await DataHub.update(coll, id, data, state.user.uid),
    delete: async (coll, id) => await DataHub.delete(coll, id)
};

// --- Localization Hub ---
function setupLocalization() {
    const langToggle = document.getElementById('lang-toggle');
    langToggle.value = state.lang;
    langToggle.onchange = (e) => {
        state.lang = e.target.value;
        localStorage.setItem('lang', state.lang);
        applyLocales();
        renderCharts();
        renderTransactionTable();
        renderCategoryList();
    };
    applyLocales();
}

function t(path) {
    const keys = path.split('.');
    let value = locales[state.lang];
    for (const key of keys) {
        if (!value) break;
        value = value[key];
    }
    return value || path;
}

function applyLocales() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });
}

// --- Core Initialization ---
async function init() {
    setupLocalization();
    
    // Sentry Initialization (Optional)
    const sentryDSN = "YOUR_SENTRY_DSN";
    if (window.Sentry && sentryDSN !== "YOUR_SENTRY_DSN") {
        Sentry.init({
            dsn: sentryDSN,
            integrations: [],
            tracesSampleRate: 1.0,
        });
    }

    try {
        await enableIndexedDbPersistence(db);
    } catch (err) {
        if (err.code == 'failed-precondition') {
            console.warn("Multiple tabs open, persistence can only be enabled in one tab at a time.");
        } else if (err.code == 'unimplemented') {
            console.warn("The current browser does not support all of the features required to enable persistence");
        }
    }

    setupAuth();
    setupNavigation();
    setupTheme();
    setupForms();
    setupExports();
    setupBackup();
    setupSearch();

    // Set today's date as default
    const dateInput = document.getElementById('tx-date');
    if (dateInput) dateInput.valueAsDate = new Date();
}

// --- Auth & User Hub ---
function setupAuth() {
    const authForm = document.getElementById('auth-form');
    const googleBtn = document.getElementById('google-login-btn');
    const authError = document.getElementById('auth-error');
    const toggleLink = document.getElementById('auth-toggle-link');
    const submitBtn = document.getElementById('auth-submit-btn');

    // 1. Google Login
    googleBtn.onclick = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error("Login failed:", error);
            alert("Login failed!");
        }
    };

    // 2. Email/Password Auth
    authForm.onsubmit = async (e) => {
        e.preventDefault();
        authError.classList.add('hidden');
        
        const email = document.getElementById('auth-email').value.trim();
        const pass = document.getElementById('auth-password').value.trim();

        try {
            if (state.isSignupMode) {
                await createUserWithEmailAndPassword(auth, email, pass);
            } else {
                await signInWithEmailAndPassword(auth, email, pass);
            }
        } catch (error) {
            console.error("Auth failed:", error);
            authError.classList.remove('hidden');
            authError.textContent = error.message.includes('auth/wrong-password') || error.message.includes('auth/user-not-found') 
                ? t('auth_failed') 
                : error.message;
        }
    };

    // 3. Toggle Mode
    toggleLink.onclick = (e) => {
        e.preventDefault();
        state.isSignupMode = !state.isSignupMode;
        
        submitBtn.setAttribute('data-i18n', state.isSignupMode ? 'signup_btn' : 'login_btn');
        toggleLink.setAttribute('data-i18n', state.isSignupMode ? 'have_account' : 'no_account');
        
        applyLocales(); // Re-apply to update text immediately
    };

    // 4. Logout
    document.getElementById('logout-btn').onclick = async () => {
        await signOut(auth);
        location.reload();
    };

    // 5. Observer
    onAuthStateChanged(auth, (user) => {
        if (user) handleAuthChange(user);
        else showLogin();
    });
}

function handleAuthChange(user) {
    state.user = user;
    document.getElementById('user-display').textContent = user.displayName || t('sidebar.logout').replace('Logout', 'User');
    showDashboard();
}

function showLogin() {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');
    document.getElementById('global-fab').classList.remove('hidden');
    startDataSync();
}

// --- Data Hub (Application Logic) ---
let unsubscribers = [];
function startDataSync() {
    if (!state.user) return;
    
    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];

    unsubscribers.push(DB.sync("accounts", (data) => {
        state.categories = data;
        if (data.length === 0) seedInitialCategories();
        populateDropdowns();
        renderCategoryList();
    }));

    unsubscribers.push(DB.sync("transactions", (data) => {
        state.transactions = data;
        processFinancialData();
    }, "date"));

    unsubscribers.push(DB.sync("budgets", (data) => {
        state.budgets = data;
        updateBudgetProgress();
    }));

    unsubscribers.push(DB.sync("recurring_templates", (data) => {
        state.recurring = data;
        renderRecurringList();
    }));

    unsubscribers.push(DB.sync("financial_goals", (data) => {
        state.goals = data;
        renderGoals();
    }));
}

async function seedInitialCategories() {
    const incomeCats = [
        { name: 'ব্যাংক হতে উত্তোলন', type: 'income' },
        { name: 'দোকান ভাড়া', type: 'income' },
        { name: 'ধার আনা', type: 'income' },
        { name: 'নগদ', type: 'income' }
    ];
    const expenseCats = [
        { name: 'পারিবারিক: দৈনিক বাজার', type: 'expense' },
        { name: 'পারিবারিক: ইউটিলিটি', type: 'expense' },
        { name: 'পারিবারিক: আনুষঙ্গিক খরচ', type: 'expense' },
        { name: 'ব্যবসায়িক: ঠিকাদারী', type: 'expense' },
        { name: 'ব্যবসায়িক: লাইসেন্স', type: 'expense' },
        { name: 'ব্যবসায়িক: অফিস খরচ', type: 'expense' },
        { name: 'সামাজিক: রাজনৈতিক খরচ', type: 'expense' },
        { name: 'সামাজিক: অনুদান', type: 'expense' },
        { name: 'নিয়মিত: বেতন', type: 'expense' },
        { name: 'নিয়মিত: যাতায়াত', type: 'expense' },
        { name: 'নিয়মিত: নাস্তা/আপ্যায়ন', type: 'expense' }
    ];
    for (const cat of [...incomeCats, ...expenseCats]) {
        await DB.add("accounts", cat);
    }
}

// --- Logic Modules ---
function processFinancialData() {
    let inc = 0, exp = 0;
    state.transactions.forEach(tx => { if (tx.type === 'income') inc += tx.amount; else exp += tx.amount; });
    state.totalBalance = inc - exp;

    document.getElementById('total-income').textContent = `৳ ${inc.toLocaleString()}`;
    document.getElementById('total-expense').textContent = `৳ ${exp.toLocaleString()}`;
    document.getElementById('total-balance').textContent = `৳ ${state.totalBalance.toLocaleString()}`;

    calculateFinancialHealth(inc, exp);
    renderTransactionTable();
    renderCharts();
    updateBudgetProgress();
    renderGoals();
    checkRecurringDue();
}

function calculateFinancialHealth(inc, exp) {
    const scoreEl = document.getElementById('health-score');
    const statusEl = document.getElementById('health-status');
    if (!scoreEl || !statusEl) return;

    if (inc === 0 && exp === 0) {
        scoreEl.textContent = "--";
        statusEl.textContent = t('overview.no_data') || "লেনদেন যোগ করুন";
        return;
    }

    // 1. Savings Rate Component (max 50 points)
    const savingsRate = inc > 0 ? ((inc - exp) / inc) * 100 : 0;
    let savingsScore = Math.max(0, Math.min(savingsRate, 50));
    if (savingsRate > 50) savingsScore = 50;
    else if (savingsRate < 0) savingsScore = 0;

    // 2. Budget Compliance Component (max 50 points)
    const curMonth = new Date().toISOString().substring(0, 7);
    let budgetViolation = 0;
    state.budgets.forEach(b => {
        const spent = state.transactions.filter(t => t.categoryId === b.id && t.date.startsWith(curMonth)).reduce((s, t) => s + t.amount, 0);
        if (spent > b.amount) budgetViolation++;
    });
    const budgetScore = state.budgets.length > 0 ? (1 - (budgetViolation / state.budgets.length)) * 50 : 50;

    const totalScore = Math.round(savingsScore + budgetScore);
    scoreEl.textContent = totalScore;

    let color = "#ef4444"; // Bad
    let statusKey = "overview.health_bad";
    if (totalScore >= 80) { color = "#10b981"; statusKey = "overview.health_good"; }
    else if (totalScore >= 50) { color = "#f59e0b"; statusKey = "overview.health_ok"; }

    scoreEl.style.borderColor = color;
    statusEl.textContent = t(statusKey);
    displayDailyTip();
}

function displayDailyTip() {
    const tipEl = document.getElementById('daily-tip');
    if (!tipEl) return;
    const tips = t('overview.tips');
    if (Array.isArray(tips)) {
        tipEl.textContent = tips[Math.floor(Math.random() * tips.length)];
    }
}

function setupForms() {
    const txTypeSelect = document.getElementById('tx-type');
    txTypeSelect.onchange = () => populateDropdowns();

    document.getElementById('transaction-form').onsubmit = async (e) => {
        e.preventDefault();
        const catId = document.getElementById('tx-account').value;
        const cat = state.categories.find(c => c.id === catId);
        await DB.add("transactions", {
            date: document.getElementById('tx-date').value,
            categoryId: catId, categoryName: cat.name, type: cat.type,
            amount: parseFloat(document.getElementById('tx-amount').value),
            method: document.getElementById('tx-method').value,
            description: document.getElementById('tx-desc').value,
            createdAt: Timestamp.now()
        });
        e.target.reset();
        document.getElementById('tx-date').valueAsDate = new Date();
        populateDropdowns();
        
        // Return to overview after FAB add
        switchSection('overview');
    };

    document.getElementById('global-fab').onclick = () => switchSection('transactions');

    document.getElementById('recurring-form').onsubmit = async (e) => {
        e.preventDefault();
        const catId = document.getElementById('rec-account').value;
        const cat = state.categories.find(c => c.id === catId);
        await DB.add("recurring_templates", {
            categoryId: catId, categoryName: cat.name,
            amount: parseFloat(document.getElementById('rec-amount').value),
            day: parseInt(document.getElementById('rec-day').value)
        });
        e.target.reset();
    };

    document.getElementById('goal-form').onsubmit = async (e) => {
        e.preventDefault();
        await DB.add("financial_goals", {
            name: document.getElementById('goal-name').value,
            target: parseFloat(document.getElementById('goal-target').value)
        });
        e.target.reset();
    };

    document.getElementById('category-form').onsubmit = async (e) => {
        e.preventDefault();
        await DB.add("accounts", {
            name: document.getElementById('cat-name').value,
            type: document.getElementById('cat-type').value
        });
        e.target.reset();
    };

    document.getElementById('budget-form').onsubmit = async (e) => {
        e.preventDefault();
        const catId = document.getElementById('budget-account').value;
        await DB.update("budgets", catId, { 
            amount: parseFloat(document.getElementById('budget-amount').value) 
        });
        e.target.reset();
    };
}

// --- Search Logic ---
function setupSearch() {
    const input = document.getElementById('search-input');
    input.oninput = (e) => {
        state.searchTerm = e.target.value.toLowerCase();
        renderTransactionTable();
    };
}

// --- Rendering Modules ---
function renderTransactionTable() {
    const filtered = state.transactions.filter(tx => 
        tx.categoryName.toLowerCase().includes(state.searchTerm) || 
        (tx.description || "").toLowerCase().includes(state.searchTerm)
    );

    document.getElementById('report-list-body').innerHTML = filtered.map(item => `
        <tr>
            <td>${item.date}</td><td>${item.categoryName}</td>
            <td class="${item.type==='income'?'amt-income':'amt-expense'}">৳ ${item.amount.toLocaleString()}</td>
            <td>${item.method}</td>
            <td><button class="btn-delete" onclick="window.deleteTx('${item.id}')">❌</button></td>
        </tr>
    `).join('');
}
window.deleteTx = async (id) => { if(confirm(t('transactions.delete_confirm'))) await DB.delete("transactions", id); };

function renderCharts() {
    renderTrendChart();
    renderPieChart();
}

function renderTrendChart() {
    const canvas = document.getElementById('overviewChart');
    if (!canvas) return;
    if (state.chart) state.chart.destroy();
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f8fafc' : '#020617';

    const monthly = {};
    state.transactions.forEach(tx => {
        const m = tx.date.substring(0, 7);
        if(!monthly[m]) monthly[m] = { income: 0, expense: 0 };
        monthly[m][tx.type] += tx.amount;
    });

    const labels = Object.keys(monthly).sort();
    state.chart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets: [
            { label: t('overview.income_label'), data: labels.map(l => monthly[l].income), borderColor: '#059669', tension: 0.3 },
            { label: t('overview.expense_label'), data: labels.map(l => monthly[l].expense), borderColor: '#dc2626', tension: 0.3 }
        ]},
        options: { 
            responsive: true, maintainAspectRatio: false,
            scales: { x: { ticks: { color: textColor } }, y: { ticks: { color: textColor } } },
            plugins: { legend: { labels: { color: textColor } } }
        }
    });
}

function renderPieChart() {
    const canvas = document.getElementById('pieChart');
    if (!canvas) return;
    if (state.pieChart) state.pieChart.destroy();
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f8fafc' : '#020617';

    const categories = {};
    state.transactions.filter(t => t.type === 'expense').forEach(t => {
        categories[t.categoryName] = (categories[t.categoryName] || 0) + t.amount;
    });

    const labels = Object.keys(categories);
    const data = Object.values(categories);

    state.pieChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981'] }]},
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: textColor } } }
        }
    });
}

// --- Helpers ---
function populateDropdowns() {
    const type = document.getElementById('tx-type').value;
    const cats = state.categories.filter(c => c.type === type);
    const expCats = state.categories.filter(c => c.type === 'expense');
    const wrap = (c) => `<option value="${c.id}">${c.name}</option>`;
    
    document.getElementById('tx-account').innerHTML = cats.map(wrap).join('');
    document.getElementById('rec-account').innerHTML = expCats.map(wrap).join('');
    document.getElementById('budget-account').innerHTML = expCats.map(wrap).join('');
    document.getElementById('tx-method').innerHTML = state.paymentMethods.map(p => `<option value="${p.name}">${p.icon} ${p.name}</option>`).join('');
}

function renderCategoryList() {
    document.getElementById('category-list').innerHTML = state.categories.map(c => `
        <li class="chip">
            ${c.name} (${c.type==='income'?t('transactions.income'):t('transactions.expense')})
            <span onclick="window.deleteCat('${c.id}')" style="cursor:pointer; color:red">×</span>
        </li>
    `).join('');
}
window.deleteCat = async (id) => { if(confirm(t('settings.confirm'))) await DB.delete("accounts", id); };

function updateBudgetProgress() {
    const curMonth = new Date().toISOString().substring(0, 7);
    document.getElementById('budget-list').innerHTML = state.budgets.map(b => {
        const cat = state.categories.find(c => c.id === b.id);
        if (!cat) return '';
        const spent = state.transactions.filter(t => t.categoryId === b.id && t.date.startsWith(curMonth)).reduce((s, t) => s + t.amount, 0);
        const percent = Math.min((spent / b.amount) * 100, 100);
        const color = percent > 90 ? '#ef4444' : percent > 70 ? '#f59e0b' : '#10b981';
        return `<div class="budget-item"><div class="budget-info"><span>${cat.name}</span><span>৳ ${spent.toLocaleString()}/৳ ${b.amount.toLocaleString()}</span></div><div class="progress-bar"><div class="progress-fill" style="width: ${percent}%; background: ${color}"></div></div></div>`;
    }).join('');
}

function renderGoals() {
    document.getElementById('goals-list').innerHTML = state.goals.map(g => {
        const percent = Math.min((state.totalBalance / g.target) * 100, 100);
        return `
            <div class="card goal-card">
                <div style="display:flex; justify-content:space-between"><strong>${g.name}</strong><button onclick="window.deleteGoal('${g.id}')" style="border:none; color:red; cursor:pointer">×</button></div>
                <div class="goal-status">৳ ${state.totalBalance.toLocaleString()} / ৳ ${g.target.toLocaleString()}</div>
                <div class="progress-bar" style="margin-top:10px"><div class="progress-fill" style="width:${percent}%; background:var(--primary)"></div></div>
                <small>${percent.toFixed(1)}% ${t('goals.achieved')}</small>
            </div>
        `;
    }).join('');
}
window.deleteGoal = async (id) => { if(confirm(t('settings.confirm'))) await DB.delete("financial_goals", id); };

function renderRecurringList() {
    document.getElementById('recurring-list').innerHTML = state.recurring.map(r => `
        <div class="chip">🔄 ${r.categoryName}: ৳${r.amount} (Day ${r.day})<span onclick="window.deleteRec('${r.id}')" style="cursor:pointer; color:red; margin-left:10px">×</span></div>
    `).join('');
}
window.deleteRec = async (id) => { if(confirm(t('settings.confirm'))) await DB.delete("recurring_templates", id); };

let recurringPrompted = false;
async function checkRecurringDue() {
    if (recurringPrompted || state.recurring.length === 0) return;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayDay = today.getDate();

    const due = state.recurring.filter(r => r.day === todayDay && r.lastTriggered !== todayStr);

    if (due.length > 0) {
        recurringPrompted = true;
        if (confirm(t('recurring.prompt').replace('{count}', due.length))) {
            for (const r of due) {
                await DB.add("transactions", {
                    date: todayStr,
                    categoryId: r.categoryId, categoryName: r.categoryName, type: 'expense',
                    amount: r.amount, method: 'নগদ টাকা', description: 'Auto-Recurring Entry',
                    createdAt: Timestamp.now()
                });
                await DB.update("recurring_templates", r.id, { lastTriggered: todayStr });
            }
        }
    }
}

function setupExports() {
    document.getElementById('export-excel').onclick = () => {
        const data = state.transactions.map(t => ({ Date: t.date, Category: t.categoryName, Type: t.type, Amount: t.amount, Method: t.method }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Transactions");
        XLSX.writeFile(wb, "Elite_Report.xlsx");
    };
    document.getElementById('export-pdf').onclick = () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.text("Elite Money Tracker Report", 14, 15);
        doc.autoTable({ head: [['Date', 'Category', 'Amount', 'Method']], body: state.transactions.map(t => [t.date, t.categoryName, t.amount, t.method]), startY: 20 });
        doc.save("Elite_Report.pdf");
    };
}

function setupBackup() {
    document.getElementById('backup-btn').onclick = () => {
        const backupData = {
            version: SchemaVersion,
            timestamp: new Date().toISOString(),
            data: {
                transactions: state.transactions,
                accounts: state.categories,
                budgets: state.budgets,
                recurring: state.recurring,
                goals: state.goals
            }
        };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Elite_Backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    };

    const restoreBtn = document.getElementById('restore-btn');
    const restoreInput = document.getElementById('restore-input');

    restoreBtn.onclick = () => restoreInput.click();
    restoreInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const backup = JSON.parse(event.target.result);
                if (!backup.data || !confirm(t('settings.confirm'))) return;
                const { transactions, accounts, budgets } = backup.data;
                if (accounts) for (const item of accounts) await DB.add("accounts", { name: item.name, type: item.type });
                if (transactions) for (const item of transactions) await DB.add("transactions", { 
                    date: item.date, amount: item.amount, categoryName: item.categoryName, 
                    type: item.type, method: item.method, description: item.description 
                });
                if (budgets) for (const item of budgets) await DB.update("budgets", item.id, { amount: item.amount });
                alert("Restored successfully!");
                location.reload();
            } catch (err) {
                console.error("Restore failed:", err);
                alert("Invalid format!");
            }
        };
        reader.readAsText(file);
    };

    document.getElementById('export-supabase-btn').onclick = () => {
        const supabaseData = {
            accounts: state.categories.map(c => ({ account_name: c.name, account_type: c.type === 'income' ? 'আয়' : 'খরচ', category: 'General' })),
            transactions: state.transactions.map(t => ({ transaction_date: t.date, amount: t.amount, description: t.description, account_name: t.categoryName, payment_method: t.method }))
        };
        const blob = new Blob([JSON.stringify(supabaseData, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Supabase_Migration_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    };
}

function setupTheme() {
    const toggle = document.getElementById('theme-toggle');
    const update = (mode) => {
        document.body.setAttribute('data-theme', mode);
        toggle.textContent = mode === 'dark' ? t('sidebar.light_mode') : t('sidebar.dark_mode');
        renderCharts();
    };
    update(localStorage.getItem('theme') || 'light');
    toggle.onclick = () => {
        const n = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', n);
        update(n);
    };
}

function switchSection(section) {
    document.querySelectorAll('.nav-links li').forEach(x => {
        x.classList.toggle('active', x.getAttribute('data-section') === section);
    });
    document.querySelectorAll('.content-section').forEach(x => {
        x.classList.toggle('hidden', x.id !== `section-${section}`);
    });
    
    // Auto-hide FAB on transaction screen to avoid clutter
    document.getElementById('global-fab').classList.toggle('hidden', section === 'transactions');
    
    if (section === 'overview') renderCharts();
}

function setupNavigation() {
    document.querySelectorAll('.nav-links li').forEach(l => {
        l.onclick = () => switchSection(l.getAttribute('data-section'));
    });
}

function setupSearch() {
    const input = document.getElementById('search-input');
    if (input) {
        input.oninput = (e) => {
            state.searchTerm = e.target.value.toLowerCase();
            renderTransactionTable();
        };
    }
}

init();
