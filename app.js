import { db, auth, googleProvider } from './firebase-config.js';
import { 
    collection, addDoc, onSnapshot, query, orderBy, doc, 
    deleteDoc, setDoc, Timestamp, where, enableIndexedDbPersistence 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    signInWithPopup, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- Global State ---
let state = {
    user: null,
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

// --- Core Initialization ---
async function init() {
    // Sentry Initialization
    if (window.Sentry) {
        Sentry.init({
            dsn: "YOUR_SENTRY_DSN", // Replace with your actual Sentry DSN
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
}

// --- Auth & User Hub ---
function setupAuth() {
    const loginForm = document.getElementById('login-form');
    const googleBtn = document.getElementById('google-login-btn');
    const loginError = document.getElementById('login-error');

    // 1. Google Login
    googleBtn.onclick = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error("Login failed:", error);
            alert("লগইন ব্যর্থ হয়েছে!");
        }
    };

    // 2. Master Password Login (Legacy fallback)
    loginForm.onsubmit = (e) => {
        e.preventDefault();
        const pass = document.getElementById('master-password').value;
        if (pass === 'AhmedKamrul010987') {
            // For password login, we'll use a fixed 'master' user ID
            localStorage.setItem('isLoggedIn', 'true');
            handleAuthChange({ uid: 'master_user', displayName: 'Master User' });
        } else {
            loginError.classList.remove('hidden');
        }
    };

    // 3. Logout
    document.getElementById('logout-btn').onclick = async () => {
        await signOut(auth);
        localStorage.removeItem('isLoggedIn');
        location.reload();
    };

    // 4. Observer
    onAuthStateChanged(auth, (user) => {
        if (user) handleAuthChange(user);
        else if (localStorage.getItem('isLoggedIn') === 'true') handleAuthChange({ uid: 'master_user', displayName: 'Master User' });
        else showLogin();
    });
}

function handleAuthChange(user) {
    state.user = user;
    document.getElementById('user-display').textContent = user.displayName || 'ব্যবহারকারী';
    showDashboard();
}

function showLogin() {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');
    startDataSync();
}

// --- Data Hub (User Scoped) ---
let unsubscribers = [];
function startDataSync() {
    if (!state.user) return;
    const uid = state.user.uid;

    // Clear previous listeners
    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];

    const sync = (coll, callback, orderField = null) => {
        let q = collection(db, coll);
        if (orderField) q = query(q, where('userId', '==', uid), orderBy(orderField, "desc"));
        else q = query(q, where('userId', '==', uid));
        
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            callback(data);
        });
        unsubscribers.push(unsub);
    };

    sync("accounts", (data) => {
        state.categories = data;
        if (data.length === 0) seedInitialCategories();
        populateDropdowns();
        renderCategoryList();
    });

    sync("transactions", (data) => {
        state.transactions = data;
        processFinancialData();
    }, "date");

    sync("budgets", (data) => {
        state.budgets = data;
        updateBudgetProgress();
    });

    sync("recurring_templates", (data) => {
        state.recurring = data;
        renderRecurringList();
    });

    sync("financial_goals", (data) => {
        state.goals = data;
        renderGoals();
    });
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
        await addDoc(collection(db, "accounts"), { ...cat, userId: state.user.uid });
    }
}

// --- Logic Modules ---
function processFinancialData() {
    let inc = 0, exp = 0;
    state.transactions.forEach(t => { if (t.type === 'income') inc += t.amount; else exp += t.amount; });
    state.totalBalance = inc - exp;

    document.getElementById('total-income').textContent = `৳ ${inc.toLocaleString()}`;
    document.getElementById('total-expense').textContent = `৳ ${exp.toLocaleString()}`;
    document.getElementById('total-balance').textContent = `৳ ${state.totalBalance.toLocaleString()}`;

    renderTransactionTable();
    renderCharts();
    updateBudgetProgress();
    renderGoals();
    checkRecurringDue();
}

function setupForms() {
    const txTypeSelect = document.getElementById('tx-type');
    txTypeSelect.onchange = () => populateDropdowns(); // Dynamic filtering

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
    };

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
    const filtered = state.transactions.filter(t => 
        t.categoryName.toLowerCase().includes(state.searchTerm) || 
        (t.description || "").toLowerCase().includes(state.searchTerm)
    );

    document.getElementById('report-list-body').innerHTML = filtered.map(t => `
        <tr>
            <td>${t.date}</td><td>${t.categoryName}</td>
            <td class="${t.type==='income'?'amt-income':'amt-expense'}">৳ ${t.amount.toLocaleString()}</td>
            <td>${t.method}</td>
            <td><button class="btn-delete" onclick="window.deleteTx('${t.id}')">❌</button></td>
        </tr>
    `).join('');
}
window.deleteTx = async (id) => { if(confirm('মুছে ফেলতে চান?')) await DB.delete("transactions", id); };

function renderCharts() {
    renderTrendChart();
    renderPieChart();
}

function renderTrendChart() {
    const canvas = document.getElementById('overviewChart');
    if (!canvas) return;
    if (state.chart) state.chart.destroy();
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f8fafc' : '#1e293b';

    const monthly = {};
    state.transactions.forEach(t => {
        const m = t.date.substring(0, 7);
        if(!monthly[m]) monthly[m] = { income: 0, expense: 0 };
        monthly[m][t.type] += t.amount;
    });

    const labels = Object.keys(monthly).sort();
    state.chart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets: [
            { label: 'আয়', data: labels.map(l => monthly[l].income), borderColor: '#10b981', tension: 0.3 },
            { label: 'ব্যয়', data: labels.map(l => monthly[l].expense), borderColor: '#ef4444', tension: 0.3 }
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
    const textColor = isDark ? '#f8fafc' : '#1e293b';

    const categories = {};
    state.transactions.filter(t => t.type === 'expense').forEach(t => {
        categories[t.categoryName] = (categories[t.categoryName] || 0) + t.amount;
    });

    const labels = Object.keys(categories);
    const data = Object.values(categories);

    state.pieChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981']
            }]
        },
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
            ${c.name} (${c.type==='income'?'আয়':'ব্যয়'})
            <span onclick="window.deleteCat('${c.id}')" style="cursor:pointer; color:red">×</span>
        </li>
    `).join('');
}
window.deleteCat = async (id) => { if(confirm('নিশ্চিত?')) await deleteDoc(doc(db, "accounts", id)); };

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
                <small>${percent.toFixed(1)}% অর্জন</small>
            </div>
        `;
    }).join('');
}
window.deleteGoal = async (id) => { if(confirm('নিশ্চিত?')) await deleteDoc(doc(db, "financial_goals", id)); };

function renderRecurringList() {
    document.getElementById('recurring-list').innerHTML = state.recurring.map(r => `
        <div class="chip">🔄 ${r.categoryName}: ৳${r.amount} (Day ${r.day})<span onclick="window.deleteRec('${r.id}')" style="cursor:pointer; color:red; margin-left:10px">×</span></div>
    `).join('');
}
window.deleteRec = async (id) => { if(confirm('নিশ্চিত?')) await deleteDoc(doc(db, "recurring_templates", id)); };

let recurringPrompted = false;
async function checkRecurringDue() {
    if (recurringPrompted || state.recurring.length === 0) return;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayDay = today.getDate();

    const due = state.recurring.filter(r => 
        r.day === todayDay && 
        r.lastTriggered !== todayStr
    );

    if (due.length > 0) {
        recurringPrompted = true;
        if (confirm(`আজ ${due.length}টি নিয়মিত খরচ জমা দেওয়ার তারিখ। আপনি কি এগুলো এখন যুক্ত করতে চান?`)) {
            for (const r of due) {
                await DB.add("transactions", {
                    date: todayStr,
                    categoryId: r.categoryId, categoryName: r.categoryName, type: 'expense',
                    amount: r.amount, method: 'নগদ টাকা', description: 'Auto-Recurring Entry',
                    createdAt: Timestamp.now()
                });
                // Update template to prevent re-triggering today
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
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    };
}

function setupTheme() {
    const toggle = document.getElementById('theme-toggle');
    const update = (t) => {
        document.body.setAttribute('data-theme', t);
        toggle.textContent = t === 'dark' ? '☀️ লাইট মোড' : '🌓 ডার্ক মোড';
        renderCharts();
    };
    update(localStorage.getItem('theme') || 'light');
    toggle.onclick = () => {
        const n = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', n);
        update(n);
    };
}

function setupNavigation() {
    document.querySelectorAll('.nav-links li').forEach(l => {
        l.onclick = () => {
            const s = l.getAttribute('data-section');
            document.querySelectorAll('.nav-links li').forEach(x => x.classList.remove('active'));
            l.classList.add('active');
            document.querySelectorAll('.content-section').forEach(x => x.classList.toggle('hidden', x.id !== `section-${s}`));
            if (s === 'overview') renderCharts();
        };
    });
}

init();
oggle');
    const update = (t) => {
        document.body.setAttribute('data-theme', t);
        toggle.textContent = t === 'dark' ? '☀️ লাইট মোড' : '🌓 ডার্ক মোড';
        renderCharts();
    };
    update(localStorage.getItem('theme') || 'light');
    toggle.onclick = () => {
        const n = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', n);
        update(n);
    };
}

function setupNavigation() {
    document.querySelectorAll('.nav-links li').forEach(l => {
        l.onclick = () => {
            const s = l.getAttribute('data-section');
            document.querySelectorAll('.nav-links li').forEach(x => x.classList.remove('active'));
            l.classList.add('active');
            document.querySelectorAll('.content-section').forEach(x => x.classList.toggle('hidden', x.id !== `section-${s}`));
            if (s === 'overview') renderCharts();
        };
    });
}

init();
