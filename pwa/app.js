import { locales } from './locales.js';
import { auth, googleProvider, ADMIN_EMAIL, logEvent } from './firebase-config.js';
import { 
    signInWithPopup, signOut, onAuthStateChanged,
    createUserWithEmailAndPassword, signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { DataHub } from './data-hub.js';

console.log("[App] Loading modules...");

// --- Global State ---
let state = {
    user: null,
    isSignupMode: false,
    isAdmin: false,
    lang: localStorage.getItem('lang') || 'bn',
    transactions: [],
    categories: [],
    budgets: [],
    recurring: [],
    goals: [],
    debts: [],
    reminders: [],
    paymentMethods: [
        { id: 1, name: 'নগদ টাকা', icon: '💵' },
        { id: 2, name: 'ব্যাংক অ্যাকাউন্ট', icon: '🏦' },
        { id: 3, name: 'bKash', icon: '📱' },
        { id: 4, name: 'Nagad', icon: '💳' },
        { id: 5, name: 'Rocket', icon: '🚀' }
    ],
    chart: null,
    pieChart: null,
    projectionChart: null,
    totalBalance: 0,
    searchTerm: '',
    sessionTimeout: null,
    failedAttempts: parseInt(localStorage.getItem('failed_attempts') || '0'),
    lockoutUntil: parseInt(localStorage.getItem('lockout_until') || '0')
};

const SchemaVersion = "1.0.0";
const IS_CI_TEST = (window.__ENV && window.__ENV.NEXT_PUBLIC_FIREBASE_API_KEY === "AIzaDummyKey") || (auth && auth.app && auth.app.options && auth.app.options.apiKey === "AIzaDummyKey");

console.log("[App] IS_CI_TEST identified as:", IS_CI_TEST);

// --- Infrastructure: DataHub Wrapper ---
const DB = {
    sync: (coll, callback, orderField = null) => DataHub.sync(coll, callback, orderField),
    add: async (coll, data) => await DataHub.add(coll, data),
    update: async (coll, id, data) => await DataHub.update(coll, id, data),
    delete: async (coll, id) => await DataHub.delete(coll, id)
};

window.loadAiInsights = async () => {
    const list = document.getElementById('ai-insights-list');
    if (!list) return;

    try {
        // Query Firestore 'insights' collection for the current user
        const q = query(collection(db, "insights"), where("userId", "==", state.user.uid), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);
        
        list.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            return `
                <div class="card" style="margin-bottom: 10px; padding: 10px;">
                    <small>${data.timestamp.toDate().toLocaleString()}</small>
                    <p>${data.analysis.substring(0, 100)}...</p>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error("Failed to load insights", err);
    }
};

window.startAiPolling = () => {
    // Poll for new insights every 60 seconds
    setInterval(window.loadAiInsights, 60000);
};

window.requestAiAnalysis = async () => {
    const btn = document.getElementById('btn-ai-insights');
    btn.classList.add('btn-loading');
    btn.disabled = true;
    try {
        const response = await fetch('/api/ai/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                transactions: state.transactions, 
                budgets: state.budgets 
            })
        });
        const data = await response.json();
        showToast("AI Insight Generated!");
        alert(data.analysis);
    } catch (err) {
        showToast("Failed to fetch AI insights", true);
        console.error(err);
    } finally {
        btn.classList.remove('btn-loading');
        btn.disabled = false;
    }
};

// --- Localization Hub ---
function setupLocalization() {
    applyLocales();
}

function t(path) {
    const keys = path.split('.');
    let value = locales[state.lang];
    if (!value) return path;
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

// --- Security Helpers ---
function updateSyncStatus() {
    const statusEl = document.getElementById('sync-status');
    if (!statusEl) return;
    
    if (navigator.onLine) {
        statusEl.innerHTML = '<span class="text-success">● Online</span>';
        DataHub.processSyncQueue();
    } else {
        statusEl.innerHTML = '<span class="text-warning">○ Offline (Local Mode)</span>';
    }
}

function resetSessionTimer() {
    clearTimeout(state.sessionTimeout);
    if (state.user) {
        state.sessionTimeout = setTimeout(async () => {
            console.warn("[Security] Session timeout due to inactivity.");
            await logEvent("session_timeout", state.user.uid);
            await signOut(auth);
            location.reload();
        }, 30 * 60 * 1000); // 30 Minutes
    }
}

function checkLockout() {
    const now = Date.now();
    const authError = document.getElementById('auth-error');
    const submitBtn = document.getElementById('auth-submit-btn');

    if (now < state.lockoutUntil) {
        const remaining = Math.ceil((state.lockoutUntil - now) / 60000);
        if (authError) {
            authError.classList.remove('hidden');
            authError.textContent = `Too many failed attempts. Try again in ${remaining} minutes.`;
        }
        if (submitBtn) submitBtn.disabled = true;
        return true;
    }
    return false;
}

// --- Core Initialization ---
async function init() {
    setupLocalization();

    setupAuth();
    setupNavigation();
    setupTheme();
    setupForms();
    setupExports();
    setupBackup();
    setupSearch();
    setupLab();
    setupBulkActions();
    setupReminders();
    setupTargetForm();
    setupProjectSelector();
    setupTeamManagement();
    setupAIAuditor();

    // Security & Connectivity
    updateSyncStatus();
    window.addEventListener('online', updateSyncStatus);
    window.addEventListener('offline', updateSyncStatus);

    // Security listeners
    ['mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
        window.addEventListener(evt, resetSessionTimer);
    });

    const dateInput = document.getElementById('tx-date');
    if (dateInput) dateInput.valueAsDate = new Date();
    
    setTimeout(() => {
        const loading = document.getElementById('app-loading');
        if (loading) {
            loading.style.opacity = '0';
            setTimeout(() => loading.style.display = 'none', 500);
        }
    }, 1000);
}

function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.background = isError ? '#ef4444' : '#2563eb';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- Auth Hub ---
function setupAuth() {
    const authForm = document.getElementById('auth-form');
    const googleBtn = document.getElementById('google-login-btn');
    const authError = document.getElementById('auth-error');
    const toggleLink = document.getElementById('auth-toggle-link');
    const submitBtn = document.getElementById('auth-submit-btn');
    const passToggle = document.getElementById('toggle-password');
    const passInput = document.getElementById('auth-password');

    if (!authForm) return;

    if (passToggle) {
        passToggle.onclick = () => {
            const isPass = passInput.type === 'password';
            passInput.type = isPass ? 'text' : 'password';
            passToggle.textContent = isPass ? '🙈' : '👁️';
        };
    }

    // Initial check
    checkLockout();

    googleBtn.onclick = async () => {
        if (checkLockout()) return;
        authError.classList.add('hidden');
        googleBtn.classList.add('btn-loading');
        try {
            const result = await signInWithPopup(auth, googleProvider);
            await logEvent("login_google", result.user.uid);
            showToast("Login Successful!");
        } catch (error) {
            authError.classList.remove('hidden');
            authError.textContent = `Google Error: ${error.message}`;
            await logEvent("failed_login_google", null, { error: error.message });
            googleBtn.classList.remove('btn-loading');
        }
    };

    authForm.onsubmit = async (e) => {
        e.preventDefault();
        if (checkLockout()) return;

        const email = document.getElementById('auth-email').value.trim();
        const pass = passInput.value.trim();

        // Validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            authError.classList.remove('hidden');
            authError.textContent = "Please enter a valid email address.";
            return;
        }
        if (pass.length < 6) {
            authError.classList.remove('hidden');
            authError.textContent = "Password must be at least 6 characters.";
            return;
        }

        submitBtn.disabled = true;
        submitBtn.classList.add('btn-loading');
        authError.classList.add('hidden');

        try {
            let result;
            if (state.isSignupMode) {
                result = await createUserWithEmailAndPassword(auth, email, pass);
                await logEvent("signup_email", result.user.uid);
                showToast("Account Created!");
            } else {
                result = await signInWithEmailAndPassword(auth, email, pass);
                await logEvent("login_email", result.user.uid);
                showToast("Welcome Back!");
            }
            // Success: Reset failures
            state.failedAttempts = 0;
            localStorage.removeItem('failed_attempts');
            localStorage.removeItem('lockout_until');
        } catch (error) {
            state.failedAttempts++;
            localStorage.setItem('failed_attempts', state.failedAttempts);
            
            if (state.failedAttempts >= 5) {
                state.lockoutUntil = Date.now() + (15 * 60 * 1000); // 15 mins
                localStorage.setItem('lockout_until', state.lockoutUntil);
                await logEvent("account_lockout", null, { email });
            }

            authError.classList.remove('hidden');
            authError.textContent = error.message;
            submitBtn.disabled = false;
            submitBtn.classList.remove('btn-loading');
            await logEvent("failed_login_email", null, { email, error: error.message, attempts: state.failedAttempts });
            checkLockout();
        }
    };

    toggleLink.onclick = (e) => {
        e.preventDefault();
        state.isSignupMode = !state.isSignupMode;
        submitBtn.setAttribute('data-i18n', state.isSignupMode ? 'signup_btn' : 'login_btn');
        toggleLink.setAttribute('data-i18n', state.isSignupMode ? 'have_account' : 'no_account');
        applyLocales();
    };

    onAuthStateChanged(auth, (user) => {
        console.log("[App] Auth state changed. User:", user ? user.uid : "null", "IS_CI_TEST:", IS_CI_TEST, "localStorage.isLoggedIn:", localStorage.getItem('isLoggedIn'));
        if (user) {
            state.user = user;
            state.isAdmin = (user.email === ADMIN_EMAIL);
            const userDisplay = document.getElementById('user-display');
            if (userDisplay) userDisplay.textContent = user.displayName || user.email;
            resetSessionTimer();
            showDashboard();
        } else if (IS_CI_TEST && localStorage.getItem('isLoggedIn') === 'true') {
            // Secure CI Bypass: Only triggers if the API key is exactly the dummy CI key
            state.user = { uid: 'ci-test-uid', email: 'test@example.com' };
            showDashboard();
        } else {
            showLogin();
        }
    });

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.onclick = async () => { 
        if (state.user) await logEvent("logout", state.user.uid);
        await signOut(auth); 
        location.reload(); 
    };
}

function showLogin() {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');
    startDataSync();
    window.loadAiInsights();
    window.startAiPolling();
}

// --- Data Sync ---
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

    unsubscribers.push(DB.sync("debts_registry", (data) => {
        state.debts = data;
        renderDebtList();
        runDebtSimulation();
    }));

    unsubscribers.push(DB.sync("bill_reminders", (data) => {
        state.reminders = data;
        renderReminders();
    }));
}

async function seedInitialCategories() {
    const cats = [
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
        { name: 'নিয়মিত: নাস্তা/আপ্যায়ন', type: 'expense' },
        { name: 'আয়: বেতন', type: 'income' },
        { name: 'আয়: ব্যবসা', type: 'income' },
        { name: 'আয়: অন্যান্য', type: 'income' },
        { name: 'ঋণ: গ্রহণ', type: 'income' },
        { name: 'ঋণ: প্রদান', type: 'expense' },
        { name: 'অন্যান্য: বিবিধ', type: 'expense' }
    ];
    for (const cat of cats) await DB.add("accounts", cat);
}

// --- Mathematical Logic ---
function processFinancialData() {
    let inc = 0, exp = 0;
    state.transactions.forEach(tx => { if (tx.type === 'income') inc += tx.amount; else exp += tx.amount; });
    state.totalBalance = inc - exp;

    const incEl = document.getElementById('total-income');
    const expEl = document.getElementById('total-expense');
    const balEl = document.getElementById('total-balance');

    if (incEl) incEl.textContent = `৳ ${inc.toLocaleString()}`;
    if (expEl) expEl.textContent = `৳ ${exp.toLocaleString()}`;
    if (balEl) balEl.textContent = `৳ ${state.totalBalance.toLocaleString()}`;

    const medianBurn = getMedianBurnRate();
    calculateFinancialHealth(medianBurn);
    calculateAdvancedMetrics(medianBurn);
    renderTransactionTable();
    renderCharts();
    updateBudgetProgress();
    renderGoals();
}

function getMedianBurnRate() {
    const monthlyExpenses = {};
    state.transactions.filter(t => t.type === 'expense').forEach(t => {
        const m = t.date.substring(0, 7);
        monthlyExpenses[m] = (monthlyExpenses[m] || 0) + t.amount;
    });
    const sortedMonths = Object.keys(monthlyExpenses).sort().reverse();
    const last6Months = sortedMonths.slice(0, 6);
    const values = last6Months.map(m => monthlyExpenses[m]);
    if (values.length === 0) return 0;
    values.sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    return values.length % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

function calculateFinancialHealth(medianBurn) {
    const scoreEl = document.getElementById('health-score');
    const statusEl = document.getElementById('health-status');
    if (!scoreEl) return;

    const now = new Date();
    const curMonth = now.toISOString().substring(0, 7);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().substring(0, 7);

    const txThisMonth = state.transactions.filter(t => t.date.startsWith(curMonth));
    const txLastMonth = state.transactions.filter(t => t.date.startsWith(lastMonth));

    const incThis = txThisMonth.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expThis = txThisMonth.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const incLast = txLastMonth.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expLast = txLastMonth.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    if (incThis === 0 && expThis === 0) {
        scoreEl.textContent = "--";
        statusEl.textContent = t('overview.no_data');
        return;
    }

    const savingsRate = incThis > 0 ? ((incThis - expThis) / incThis) * 100 : 0;
    const savingsScore = Math.max(0, Math.min((savingsRate / 20) * 25, 25));

    let budgetViolation = 0;
    state.budgets.forEach(b => {
        const spent = state.transactions.filter(t => t.categoryId === b.id && t.date.startsWith(curMonth)).reduce((s, t) => s + t.amount, 0);
        if (spent > b.amount) budgetViolation++;
    });
    const budgetScore = state.budgets.length > 0 ? (1 - (budgetViolation / state.budgets.length)) * 20 : 20;

    const debtRepaid = txThisMonth.filter(t => t.categoryName.includes('ঋণ: প্রদান')).reduce((s, t) => s + t.amount, 0);
    const dtiRaw = incThis > 0 ? (debtRepaid / incThis) : 0;
    const dtiScore = Math.max(0, 25 * (1 - (dtiRaw / 0.4)));

    const monthsCovered = medianBurn > 0 ? (state.totalBalance / medianBurn) : 0;
    const emergencyScore = Math.min((monthsCovered / 6) * 20, 20);

    const trendScore = (incThis - expThis) >= (incLast - expLast) ? 10 : 0;

    const totalScore = Math.round(savingsScore + budgetScore + dtiScore + emergencyScore + trendScore);
    scoreEl.textContent = totalScore;

    // Update Lab placeholders
    const dtiValEl = document.getElementById('lab-dti-val');
    const emgValEl = document.getElementById('lab-emergency-val');
    if (dtiValEl) dtiValEl.textContent = `${Math.round(dtiRaw * 100)}%`;
    if (emgValEl) emgValEl.textContent = monthsCovered.toFixed(1);

    let color = "#ef4444"; 
    let statusKey = "overview.health_bad";
    if (totalScore >= 80) { color = "#10b981"; statusKey = "overview.health_good"; }
    else if (totalScore >= 50) { color = "#f59e0b"; statusKey = "overview.health_ok"; }

    scoreEl.style.borderColor = color;
    statusEl.textContent = t(statusKey);
    displayDailyTip();
}

function calculateAdvancedMetrics(medianBurn) {
    const runwayEl = document.getElementById('lab-runway-val');
    const burnEl = document.getElementById('lab-burn-val');
    if (burnEl) burnEl.textContent = `৳ ${Math.round(medianBurn).toLocaleString()}`;
    if (runwayEl) runwayEl.textContent = medianBurn > 0 ? (state.totalBalance / medianBurn).toFixed(1) : "--";
}

function setupLab() {
    const simBtn = document.getElementById('btn-simulate');
    if (simBtn) {
        simBtn.onclick = () => {
            const principal = parseFloat(document.getElementById('sim-principal').value) || 0;
            const monthly = parseFloat(document.getElementById('sim-monthly').value) || 0;
            const annualRate = (parseFloat(document.getElementById('sim-rate').value) || 0) / 100;
            const inflation = (parseFloat(document.getElementById('sim-inflation').value) || 0) / 100;
            const tax = (parseFloat(document.getElementById('sim-tax').value) || 0) / 100;
            const years = parseInt(document.getElementById('sim-years').value) || 1;

            const labels = [];
            const nominalData = [];
            const realData = [];

            let currentNominal = principal;
            let months = years * 12;

            for (let i = 0; i <= months; i++) {
                if (i % 12 === 0) {
                    labels.push(`${t('lab.years')} ${i/12}`);
                    nominalData.push(Math.round(currentNominal));
                    const realVal = currentNominal / Math.pow(1 + inflation, i / 12);
                    realData.push(Math.round(realVal));
                }
                const interest = (currentNominal * (annualRate / 12)) * (1 - tax);
                currentNominal += interest + monthly;
                if (currentNominal < 0) { currentNominal = 0; break; }
            }
            renderProjectionChart(labels, nominalData, realData);
        };
    }

    // Zakat logic
    const zakatAssets = document.getElementById('zakat-assets');
    const zakatNisab = document.getElementById('zakat-nisab');
    const zakatVal = document.getElementById('zakat-val');
    
    const runZakat = () => {
        const assets = (parseFloat(zakatAssets.value) || 0) + state.totalBalance;
        const nisab = parseFloat(zakatNisab.value) || 0;
        const amount = assets >= nisab ? (assets * 0.025) : 0;
        if (zakatVal) zakatVal.textContent = `৳ ${Math.round(amount).toLocaleString()}`;
    };
    if (zakatAssets) zakatAssets.oninput = runZakat;
    if (zakatNisab) zakatNisab.oninput = runZakat;

    // EMI logic
    const emiAmount = document.getElementById('emi-amount');
    const emiRate = document.getElementById('emi-rate');
    const emiTenure = document.getElementById('emi-tenure');
    const emiVal = document.getElementById('emi-val');

    const runEMI = () => {
        const p = parseFloat(emiAmount.value) || 0;
        const r = (parseFloat(emiRate.value) || 0) / 12 / 100;
        const n = parseFloat(emiTenure.value) || 0;
        if (p === 0 || n === 0) { if(emiVal) emiVal.textContent = "৳ 0"; return; }
        const emi = r === 0 ? (p / n) : (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        if (emiVal) emiVal.textContent = `৳ ${Math.round(emi).toLocaleString()}`;
    };
    if (emiAmount) emiAmount.oninput = runEMI;
    if (emiRate) emiRate.oninput = runEMI;
    if (emiTenure) emiTenure.oninput = runEMI;

    const debtStrategy = document.getElementById('debt-strategy');
    const debtExtra = document.getElementById('debt-extra-pay');
    if (debtStrategy) debtStrategy.onchange = () => runDebtSimulation();
    if (debtExtra) debtExtra.oninput = () => runDebtSimulation();
}

function runDebtSimulation() {
    const debts = JSON.parse(JSON.stringify(state.debts));
    const strategy = document.getElementById('debt-strategy').value;
    const extra = parseFloat(document.getElementById('debt-extra-pay').value) || 0;
    
    if (debts.length === 0) {
        const monthsEl = document.getElementById('debt-months-val');
        const intEl = document.getElementById('debt-interest-val');
        if (monthsEl) monthsEl.textContent = "--";
        if (intEl) intEl.textContent = "৳ 0";
        return;
    }

    if (strategy === 'avalanche') debts.sort((a, b) => b.apr - a.apr);
    else debts.sort((a, b) => a.balance - b.balance);

    let months = 0;
    let totalInterest = 0;
    const maxMonths = 360;

    while (debts.some(d => d.balance > 0) && months < maxMonths) {
        months++;
        let monthlyExtra = extra;
        debts.forEach(d => {
            if (d.balance > 0) {
                const interest = d.balance * (d.apr / 100 / 12);
                totalInterest += interest;
                d.balance += interest;
                const payment = Math.min(d.balance, d.minPayment);
                d.balance -= payment;
            }
        });
        for (const d of debts) {
            if (d.balance > 0) {
                const payment = Math.min(d.balance, monthlyExtra);
                d.balance -= payment;
                monthlyExtra -= payment;
                if (monthlyExtra <= 0) break;
            }
        }
    }
    const monthsEl = document.getElementById('debt-months-val');
    const intEl = document.getElementById('debt-interest-val');
    if (monthsEl) monthsEl.textContent = months >= maxMonths ? "360+" : months;
    if (intEl) intEl.textContent = `৳ ${Math.round(totalInterest).toLocaleString()}`;
}

function renderDebtList() {
    const list = document.getElementById('debt-list');
    if (!list) return;
    list.innerHTML = state.debts.map(d => `
        <div class="debt-item-card card" style="margin-bottom: 0.5rem;">
            <div><strong>${d.name}</strong><br><small>${d.apr}% APR | Min: ৳${d.minPayment}</small></div>
            <div style="text-align: right;"><span class="amt-expense">৳ ${d.balance.toLocaleString()}</span><br><button class="btn-delete" onclick="window.deleteDebt('${d.id}')">❌</button></div>
        </div>
    `).join('');
}
window.deleteDebt = async (id) => { if(confirm(t('transactions.delete_confirm'))) await DB.delete("debts_registry", id); };

function setupForms() {
    const txTypeSelect = document.getElementById('tx-type');
    const accSelect = document.getElementById('tx-account');
    if (txTypeSelect) {
        txTypeSelect.onchange = () => {
            const type = txTypeSelect.value;
            const transferRow = document.getElementById('transfer-acc-row');
            const normalRow = document.getElementById('normal-acc-row');
            const bkashWrap = document.getElementById('bkash-fee-wrap');
            
            if (type === 'transfer') {
                transferRow.classList.remove('hidden');
                normalRow.classList.add('hidden');
                bkashWrap.classList.add('hidden');
                populateTransferDropdowns();
            } else {
                transferRow.classList.add('hidden');
                normalRow.classList.remove('hidden');
                populateDropdowns();
            }
        };
    }

    const btnToggleSplit = document.getElementById('btn-toggle-split');
    const splitContainer = document.getElementById('split-container');
    const btnAddSplit = document.getElementById('btn-add-split');
    const splitList = document.getElementById('split-list');

    if (btnToggleSplit) {
        btnToggleSplit.onclick = () => {
            splitContainer.classList.toggle('hidden');
            const isSplit = !splitContainer.classList.contains('hidden');
            document.getElementById('tx-account').disabled = isSplit;
            if (isSplit && splitList.children.length === 0) addSplitRow();
        };
    }

    if (btnAddSplit) btnAddSplit.onclick = () => addSplitRow();

    function addSplitRow() {
        const div = document.createElement('div');
        div.className = 'form-row';
        div.style.marginBottom = '5px';
        const cats = state.categories.filter(c => c.type === 'expense');
        div.innerHTML = `
            <select class="split-cat">${cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
            <input type="number" class="split-amt" placeholder="Amount" style="flex:1">
            <button type="button" class="btn-delete" onclick="this.parentElement.remove()">×</button>
        `;
        splitList.appendChild(div);
    }

    const txForm = document.getElementById('transaction-form');
    if (txForm) {
        txForm.onsubmit = async (e) => {
            e.preventDefault();
            const type = document.getElementById('tx-type').value;
            const date = document.getElementById('tx-date').value;
            const method = document.getElementById('tx-method').value;
            const totalAmount = parseFloat(document.getElementById('tx-amount').value);
            const desc = document.getElementById('tx-desc').value;

            if (!date || isNaN(totalAmount) || totalAmount <= 0) {
                return showToast("Please enter valid date and amount!", true);
            }

            const saveBtn = txForm.querySelector('button[type="submit"]');
            saveBtn.classList.add('btn-loading');

            try {
                // Strong Validation
                if (isNaN(totalAmount) || totalAmount <= 0) {
                    throw new Error("Amount must be a positive number.");
                }

                if (!date) {
                    throw new Error("Date is required.");
                }

                if (type === 'transfer') {
                    const from = document.getElementById('tx-from-account').value;
                    const to = document.getElementById('tx-to-account').value;
                    
                    if (!from || !to) {
                        throw new Error("Both source and destination are required for transfer.");
                    }
                    if (from === to) {
                        throw new Error("Source and Destination cannot be the same!");
                    }
                    
                    // Atomic Transfer Logic (Outflow)
                    await DB.add("transactions", {
                        date, categoryName: `Transfer Out to ${to}`, type: 'expense',
                        amount: totalAmount, method: from, description: `[Transfer] ${desc}`, createdAt: new Date().toISOString()
                    });
                    // Atomic Transfer Logic (Inflow)
                    await DB.add("transactions", {
                        date, categoryName: `Transfer In from ${from}`, type: 'income',
                        amount: totalAmount, method: to, description: `[Transfer] ${desc}`, createdAt: new Date().toISOString()
                    });
                } else {
                    const isSplit = !splitContainer.classList.contains('hidden');
                    if (isSplit) {
                        const splitRows = Array.from(splitList.querySelectorAll('.form-row'));
                        if (splitRows.length === 0) throw new Error("At least one split category is required.");

                        const splits = splitRows.map(row => ({
                            catId: row.querySelector('.split-cat').value,
                            catName: row.querySelector('.split-cat').selectedOptions[0].text,
                            amount: parseFloat(row.querySelector('.split-amt').value) || 0
                        }));

                        const sum = splits.reduce((s, x) => s + x.amount, 0);
                        if (Math.abs(sum - totalAmount) > 0.01) {
                            throw new Error(`Total amount (৳${totalAmount}) must match sum of splits (৳${sum})`);
                        }

                        for (const s of splits) {
                            if (s.amount <= 0) throw new Error("Split amounts must be positive.");
                            await DB.add("transactions", {
                                date, categoryId: s.catId, categoryName: s.catName, type: 'expense',
                                amount: s.amount, method, description: `[Split] ${desc}`, createdAt: new Date().toISOString()
                            });
                        }
                    } else {
                        const catId = document.getElementById('tx-account').value;
                        if (!catId) throw new Error("Category is required.");

                        const cat = state.categories.find(c => c.id === catId);
                        if (!cat) throw new Error("Invalid category selected.");

                        const vatPercent = parseFloat(document.getElementById('tx-vat').value) || 0;
                        const vatAmount = totalAmount * (vatPercent / 100);
                        const finalAmount = totalAmount + vatAmount;

                        await DB.add("transactions", {
                            date, categoryId: catId, categoryName: cat.name, type: cat.type,
                            amount: finalAmount, vatAmount, method, description: desc, createdAt: new Date().toISOString()
                        });

                        // Automated bKash fee calculation with validation
                        const bkashCheck = document.getElementById('tx-bkash-fee');
                        if (method === 'bKash' && bkashCheck && bkashCheck.checked) {
                            const fee = Math.ceil(totalAmount * 0.0185);
                            if (fee > 0) {
                                await DB.add("transactions", {
                                    date, categoryName: "bKash Fee (Cash Out)", type: 'expense',
                                    amount: fee, method: 'bKash', description: `Auto-fee for transaction of ৳${totalAmount}`, createdAt: new Date().toISOString()
                                });
                            }
                        }
                    }
                }

                showToast("Transaction Recorded Successfully!");
                e.target.reset();
                document.getElementById('tx-date').valueAsDate = new Date();
                splitContainer.classList.add('hidden');
                splitList.innerHTML = '';
                document.getElementById('tx-account').disabled = false;
                populateDropdowns();
                switchSection('overview');
            } catch (err) {
                console.error("[Validation Error]", err);
                showToast(err.message, true);
            } finally {
                saveBtn.classList.remove('btn-loading');
            }
        };
    }

    const debtForm = document.getElementById('debt-form');
    if (debtForm) {
        debtForm.onsubmit = async (e) => {
            e.preventDefault();
            await DB.add("debts_registry", {
                name: document.getElementById('debt-name').value,
                balance: parseFloat(document.getElementById('debt-balance').value),
                apr: parseFloat(document.getElementById('debt-apr').value),
                minPayment: parseFloat(document.getElementById('debt-min').value)
            });
            e.target.reset();
        };
    }

    document.getElementById('goal-form').onsubmit = async (e) => {
        e.preventDefault();
        await DB.add("financial_goals", { name: document.getElementById('goal-name').value, target: parseFloat(document.getElementById('goal-target').value) });
        e.target.reset();
    };
    document.getElementById('category-form').onsubmit = async (e) => {
        e.preventDefault();
        await DB.add("accounts", { name: document.getElementById('cat-name').value, type: document.getElementById('cat-type').value });
        e.target.reset();
    };
    document.getElementById('budget-form').onsubmit = async (e) => {
        e.preventDefault();
        const catId = document.getElementById('budget-account').value;
        await DB.update("budgets", catId, { amount: parseFloat(document.getElementById('budget-amount').value) });
        e.target.reset();
    };
    const fab = document.getElementById('global-fab');
    if (fab) fab.onclick = () => switchSection('transactions');
}

// --- UI Helpers ---
let lastChartHash = "";

function renderCharts() {
    const txHash = JSON.stringify(state.transactions.map(t => `${t.id}_${t.amount}`));
    const theme = document.body.getAttribute('data-theme');
    const currentHash = `${txHash}_${theme}`;
    
    if (lastChartHash === currentHash) return;
    
    renderTrendChart();
    renderPieChart();
    lastChartHash = currentHash;
}

function renderTrendChart() {
    const canvas = document.getElementById('overviewChart');
    if (!canvas || state.transactions.length === 0) return;
    if (state.chart) state.chart.destroy();
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f8fafc' : '#020617';
    const monthly = {};
    state.transactions.forEach(tx => { const m = tx.date.substring(0, 7); if(!monthly[m]) monthly[m] = { income: 0, expense: 0 }; monthly[m][tx.type] += tx.amount; });
    const labels = Object.keys(monthly).sort();
    state.chart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets: [{ label: t('overview.income_label'), data: labels.map(l => monthly[l].income), borderColor: '#059669', tension: 0.3 }, { label: t('overview.expense_label'), data: labels.map(l => monthly[l].expense), borderColor: '#dc2626', tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: textColor } }, y: { ticks: { color: textColor } } }, plugins: { legend: { labels: { color: textColor } } } }
    });
}

function renderPieChart() {
    const canvas = document.getElementById('pieChart');
    if (!canvas || state.transactions.length === 0) return;
    if (state.pieChart) state.pieChart.destroy();
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f8fafc' : '#020617';
    const categories = {};
    state.transactions.filter(t => t.type === 'expense').forEach(t => { categories[t.categoryName] = (categories[t.categoryName] || 0) + t.amount; });
    const labels = Object.keys(categories);
    state.pieChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data: Object.values(categories), backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textColor } } } }
    });
}

window.runProjectionSimulation = () => {
    const p = parseFloat(document.getElementById('proj-principal').value) || 0;
    const m = parseFloat(document.getElementById('proj-monthly').value) || 0;
    const r = (parseFloat(document.getElementById('proj-rate').value) || 0) / 100 / 12;
    const n = (parseFloat(document.getElementById('proj-years').value) || 0) * 12;
    const cut = parseFloat(document.getElementById('proj-whatif-cut').value) || 0;
    
    const labels = [];
    const baseData = [];
    const optData = [];
    let base = p;
    let opt = p;
    
    for (let i = 0; i <= n; i++) {
        if (i % 12 === 0) {
            labels.push(`Year ${i / 12}`);
            baseData.push(Math.round(base));
            optData.push(Math.round(opt));
        }
        base = base * (1 + r) + m;
        opt = opt * (1 + r) + (m + cut);
    }
    
    renderProjectionChart(labels, baseData, optData);
};

function renderProjectionChart(labels, base, opt) {
    const canvas = document.getElementById('projectionChart');
    if (!canvas) return;
    if (state.projectionChart) state.projectionChart.destroy();
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f8fafc' : '#020617';
    state.projectionChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { 
            labels, 
            datasets: [
                { label: 'Base Projection', data: base, borderColor: '#64748b', fill: false, tension: 0.4 },
                { label: 'Optimized (Extra Savings)', data: opt, borderColor: '#22c55e', fill: false, tension: 0.4 }
            ] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: { x: { ticks: { color: textColor } }, y: { ticks: { color: textColor } } }, 
            plugins: { legend: { labels: { color: textColor } } } 
        }
    });
};
}

function populateDropdowns() {
    const typeSelect = document.getElementById('tx-type');
    const accSelect = document.getElementById('tx-account');
    if (!typeSelect || !accSelect) return;
    const type = typeSelect.value;
    const cats = state.categories.filter(c => c.type === type);
    const wrap = (c) => `<option value="${c.id}">${c.name}</option>`;
    accSelect.innerHTML = cats.map(wrap).join('');
    const recSelect = document.getElementById('rec-account');
    const budSelect = document.getElementById('budget-account');
    const expCats = state.categories.filter(c => c.type === 'expense');
    if (recSelect) recSelect.innerHTML = expCats.map(wrap).join('');
    if (budSelect) budSelect.innerHTML = expCats.map(wrap).join('');
    const methSelect = document.getElementById('tx-method');
    if (methSelect) {
        methSelect.innerHTML = state.paymentMethods.map(p => `<option value="${p.name}">${p.icon} ${p.name}</option>`).join('');
        methSelect.onchange = () => {
            const wrap = document.getElementById('bkash-fee-wrap');
            if (wrap) wrap.classList.toggle('hidden', methSelect.value !== 'bKash');
        };
    }
}

function renderCategoryList() {
    const list = document.getElementById('category-list');
    if (!list) return;
    list.innerHTML = state.categories.map(c => `<li class="chip">${c.name} (${c.type==='income'?t('transactions.income'):t('transactions.expense')}) <span onclick="window.deleteCat('${c.id}')" style="cursor:pointer; color:red">×</span></li>`).join('');
}

function updateBudgetProgress() {
    const list = document.getElementById('budget-list');
    if (!list) return;
    const curMonth = new Date().toISOString().substring(0, 7);
    list.innerHTML = state.budgets.map(b => {
        const cat = state.categories.find(c => c.id === b.id);
        if (!cat) return '';
        const spent = state.transactions.filter(t => t.categoryId === b.id && t.date.startsWith(curMonth)).reduce((s, t) => s + t.amount, 0);
        const percent = Math.min((spent / b.amount) * 100, 100);
        const color = percent > 90 ? '#ef4444' : percent > 70 ? '#f59e0b' : '#10b981';
        return `<div class="budget-item"><div class="budget-info"><span>${cat.name}</span><span>৳ ${spent.toLocaleString()}/৳ ${b.amount.toLocaleString()}</span></div><div class="progress-bar"><div class="progress-fill" style="width: ${percent}%; background: ${color}"></div></div></div>`;
    }).join('');
}

function renderGoals() {
    const list = document.getElementById('goals-list');
    if (!list) return;
    list.innerHTML = state.goals.map(g => {
        const percent = Math.min((state.totalBalance / g.target) * 100, 100);
        return `<div class="card goal-card"><div style="display:flex; justify-content:space-between"><strong>${g.name}</strong><button onclick="window.deleteGoal('${g.id}')" style="border:none; color:red; cursor:pointer">×</button></div><div class="goal-status">৳ ${state.totalBalance.toLocaleString()} / ৳ ${g.target.toLocaleString()}</div><div class="progress-bar" style="margin-top:10px"><div class="progress-fill" style="width:${percent}%; background:var(--primary)"></div></div><small>${percent.toFixed(1)}% ${t('goals.achieved')}</small></div>`;
    }).join('');
}

function renderRecurringList() {
    const list = document.getElementById('recurring-list');
    if (!list) return;
    list.innerHTML = state.recurring.map(r => `<div class="chip">🔄 ${r.categoryName}: ৳${r.amount} (Day ${r.day})<span onclick="window.deleteRec('${r.id}')" style="cursor:pointer; color:red; margin-left:10px">×</span></div>`).join('');
}

function renderTransactionTable() {
    const body = document.getElementById('report-list-body');
    if (!body) return;
    const filtered = state.transactions.filter(tx => tx.categoryName.toLowerCase().includes(state.searchTerm) || (tx.description || "").toLowerCase().includes(state.searchTerm));
    body.innerHTML = filtered.map(item => `
        <tr>
            <td class="no-print"><input type="checkbox" class="tx-check" data-id="${item.id}" onchange="window.updateBulkBtnVisibility()"></td>
            <td>${item.date}</td>
            <td>${item.categoryName}</td>
            <td class="${item.type==='income'?'amt-income':'amt-expense'}">৳ ${item.amount.toLocaleString()}</td>
            <td>${item.method}</td>
            <td><button class="btn-delete" onclick="window.deleteTx('${item.id}')">❌</button></td>
        </tr>
    `).join('');
    window.updateBulkBtnVisibility();
}

function setupBulkActions() {
    const selectAll = document.getElementById('select-all-tx');
    const bulkBtn = document.getElementById('bulk-delete-btn');
    if (!selectAll || !bulkBtn) return;

    selectAll.onchange = () => {
        const checks = document.querySelectorAll('.tx-check');
        checks.forEach(c => c.checked = selectAll.checked);
        window.updateBulkBtnVisibility();
    };

    bulkBtn.onclick = async () => {
        const checked = Array.from(document.querySelectorAll('.tx-check:checked')).map(c => c.getAttribute('data-id'));
        if (checked.length === 0) return;
        if (!confirm(`${t('transactions.delete_confirm')} (${checked.length} items)`)) return;
        
        bulkBtn.classList.add('btn-loading');
        try {
            for (const id of checked) {
                await DB.delete("transactions", id);
            }
            showToast(`Deleted ${checked.length} items!`);
            selectAll.checked = false;
            window.updateBulkBtnVisibility();
        } catch (err) {
            console.error(err);
            showToast("Error during bulk delete!", true);
        } finally {
            bulkBtn.classList.remove('btn-loading');
        }
    };
}

window.updateBulkBtnVisibility = () => {
    const checked = document.querySelectorAll('.tx-check:checked').length;
    const bulkBtn = document.getElementById('bulk-delete-btn');
    if (bulkBtn) bulkBtn.classList.toggle('hidden', checked === 0);
};

window.deleteTx = async (id) => { if(confirm(t('transactions.delete_confirm'))) await DB.delete("transactions", id); };
window.deleteCat = async (id) => { if(confirm(t('transactions.delete_confirm'))) await DB.delete("accounts", id); };
window.deleteRec = async (id) => { if(confirm(t('transactions.delete_confirm'))) await DB.delete("recurring_templates", id); };
window.deleteGoal = async (id) => { if(confirm(t('transactions.delete_confirm'))) await DB.delete("financial_goals", id); };
window.deleteDebt = async (id) => { if(confirm(t('transactions.delete_confirm'))) await DB.delete("debts_registry", id); };

function setupNavigation() {
    document.querySelectorAll('.nav-links li').forEach(l => {
        l.onclick = () => switchSection(l.getAttribute('data-section'));
    });
}

function switchSection(section) {
    document.querySelectorAll('.nav-links li').forEach(x => x.classList.toggle('active', x.getAttribute('data-section') === section));
    document.querySelectorAll('.content-section').forEach(x => x.classList.toggle('hidden', x.id !== `section-${section}`));
    const fab = document.getElementById('global-fab');
    if (fab) fab.classList.toggle('hidden', section === 'transactions');
    if (section === 'overview') renderCharts();
    if (section === 'business-health') renderBusinessHealth();
}

// --- Business Health Logic ---
let stateTargets = [];

function renderBusinessHealth() {
    const totalInc = state.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExp = state.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const profit = totalInc - totalExp;
    const margin = totalInc > 0 ? ((profit / totalInc) * 100).toFixed(1) : 0;

    document.getElementById('biz-profit').textContent = `৳ ${profit.toLocaleString()}`;
    document.getElementById('biz-margin').textContent = `${margin}%`;

    const targetList = document.getElementById('target-list');
    targetList.innerHTML = stateTargets.map(t => `
        <div class="card mb-2" style="padding:0.5rem; display:flex; justify-content:space-between">
            <span>${t.target_name} (${t.target_type})</span>
            <strong>৳ ${t.amount.toLocaleString()}</strong>
        </div>
    `).join('');
}

function setupProjectSelector() {
    const selector = document.getElementById('project-selector');
    if (!selector) return;

    // Load Projects
    DB.sync('projects', (data) => {
        state.projects = data;
        selector.innerHTML = '<option value="all" data-i18n="projects.all">সব প্রজেক্ট</option>' +
            data.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    });

    selector.onchange = (e) => {
        state.selectedProjectId = e.target.value;
        // Trigger re-render of current view
        if (state.activeSection === 'overview') renderCharts();
        if (state.activeSection === 'business-health') renderBusinessHealth();
        // Add more view triggers if needed
    };
}

function setupAIAuditor() {
    const btn = document.getElementById('btn-ai-audit');
    const results = document.getElementById('ai-audit-results');
    if (!btn) return;

    btn.onclick = async () => {
        const pId = state.selectedProjectId;
        if (pId === 'all') {
            results.innerHTML = 'Please select a specific project to audit.';
            return;
        }

        const projectData = state.transactions.filter(t => t.project_id === pId);
        const projectTargets = stateTargets.filter(t => t.project_id === pId); 
        
        results.innerHTML = 'AI is auditing project metrics...';
        
        try {
            // Using /api/audit to match the Next.js backend endpoint
            const response = await fetch('/api/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    transactions: projectData,
                    query: `Analyze this construction project's financial data. Compare transactions against these targets and identify anomalies, budget overruns, or potential profit leaks. Targets: ${JSON.stringify(projectTargets)}` 
                })
            });
            
            if (!response.ok) throw new Error("AI Service Unavailable");
            
            const data = await response.json();
            results.innerHTML = `<div class="card p-3" style="background: var(--card-bg); border-left: 4px solid var(--primary)">${data.content || 'Audit complete.'}</div>`;
        } catch (err) {
            results.innerHTML = 'Audit failed: ' + err.message;
        }
    };
}


console.log("[App] IS_CI_TEST:", IS_CI_TEST);
init().catch(err => console.error("[App] Init failed:", err));
