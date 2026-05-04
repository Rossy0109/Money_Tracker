import { locales } from './locales.js';
import { db, auth, googleProvider, ADMIN_EMAIL, logEvent } from './firebase-config.js';
import { 
    collection, addDoc, onSnapshot, query, orderBy, doc, 
    deleteDoc, setDoc, Timestamp, where, enableIndexedDbPersistence 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

// --- Infrastructure: DataHub Wrapper ---
const DB = {
    sync: (coll, callback, orderField = null) => DataHub.sync(coll, callback, orderField, state.user.uid),
    add: async (coll, data) => await DataHub.add(coll, data, state.user.uid),
    update: async (coll, id, data) => await DataHub.update(coll, id, data, state.user.uid),
    delete: async (coll, id) => await DataHub.delete(coll, id)
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
    try {
        await enableIndexedDbPersistence(db);
    } catch (err) {
        console.warn("[App] Persistence issue:", err.code);
    }

    setupAuth();
    setupNavigation();
    setupTheme();
    setupForms();
    setupExports();
    setupBackup();
    setupSearch();
    setupLab();

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

// --- Auth Hub ---
function setupAuth() {
    const authForm = document.getElementById('auth-form');
    const googleBtn = document.getElementById('google-login-btn');
    const authError = document.getElementById('auth-error');
    const toggleLink = document.getElementById('auth-toggle-link');
    const submitBtn = document.getElementById('auth-submit-btn');

    if (!authForm) return;

    // Initial check
    checkLockout();

    googleBtn.onclick = async () => {
        if (checkLockout()) return;
        authError.classList.add('hidden');
        try {
            const result = await signInWithPopup(auth, googleProvider);
            await logEvent("login_google", result.user.uid);
        } catch (error) {
            authError.classList.remove('hidden');
            authError.textContent = `Google Error: ${error.message}`;
            await logEvent("failed_login_google", null, { error: error.message });
        }
    };

    authForm.onsubmit = async (e) => {
        e.preventDefault();
        if (checkLockout()) return;

        submitBtn.disabled = true;
        authError.classList.add('hidden');
        const email = document.getElementById('auth-email').value.trim();
        const pass = document.getElementById('auth-password').value.trim();

        try {
            let result;
            if (state.isSignupMode) {
                result = await createUserWithEmailAndPassword(auth, email, pass);
                await logEvent("signup_email", result.user.uid);
            } else {
                result = await signInWithEmailAndPassword(auth, email, pass);
                await logEvent("login_email", result.user.uid);
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
        if (user) {
            state.user = user;
            state.isAdmin = (user.email === ADMIN_EMAIL);
            const userDisplay = document.getElementById('user-display');
            if (userDisplay) userDisplay.textContent = user.displayName || user.email;
            resetSessionTimer();
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

            if (type === 'transfer') {
                const from = document.getElementById('tx-from-account').value;
                const to = document.getElementById('tx-to-account').value;
                if (from === to) return alert("Source and Destination cannot be the same!");
                
                // Outflow
                await DB.add("transactions", {
                    date, categoryName: `Transfer Out to ${to}`, type: 'expense',
                    amount: totalAmount, method: from, description: desc, createdAt: Timestamp.now()
                });
                // Inflow
                await DB.add("transactions", {
                    date, categoryName: `Transfer In from ${from}`, type: 'income',
                    amount: totalAmount, method: to, description: desc, createdAt: Timestamp.now()
                });
            } else {
                const isSplit = !splitContainer.classList.contains('hidden');
                if (isSplit) {
                    const splits = Array.from(splitList.querySelectorAll('.form-row')).map(row => ({
                        catId: row.querySelector('.split-cat').value,
                        catName: row.querySelector('.split-cat').selectedOptions[0].text,
                        amount: parseFloat(row.querySelector('.split-amt').value) || 0
                    }));
                    const sum = splits.reduce((s, x) => s + x.amount, 0);
                    if (Math.abs(sum - totalAmount) > 0.01) return alert(`Total amount (৳${totalAmount}) must match sum of splits (৳${sum})`);

                    for (const s of splits) {
                        await DB.add("transactions", {
                            date, categoryId: s.catId, categoryName: s.catName, type: 'expense',
                            amount: s.amount, method, description: `[Split] ${desc}`, createdAt: Timestamp.now()
                        });
                    }
                } else {
                    const catId = document.getElementById('tx-account').value;
                    const cat = state.categories.find(c => c.id === catId);
                    if (!cat) return;

                    const vatPercent = parseFloat(document.getElementById('tx-vat').value) || 0;
                    const vatAmount = totalAmount * (vatPercent / 100);
                    const finalAmount = totalAmount + vatAmount;

                    await DB.add("transactions", {
                        date, categoryId: catId, categoryName: cat.name, type: cat.type,
                        amount: finalAmount, vatAmount, method, description: desc, createdAt: Timestamp.now()
                    });

                    // bKash fee
                    const bkashCheck = document.getElementById('tx-bkash-fee');
                    if (method === 'bKash' && bkashCheck && bkashCheck.checked) {
                        const fee = Math.ceil(totalAmount * 0.0185);
                        await DB.add("transactions", {
                            date, categoryName: "bKash Fee (Cash Out)", type: 'expense',
                            amount: fee, method: 'bKash', description: `Auto-fee for ৳${totalAmount}`, createdAt: Timestamp.now()
                        });
                    }
                }
            }

            e.target.reset();
            document.getElementById('tx-date').valueAsDate = new Date();
            splitContainer.classList.add('hidden');
            splitList.innerHTML = '';
            document.getElementById('tx-account').disabled = false;
            populateDropdowns();
            switchSection('overview');
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
function renderCharts() { renderTrendChart(); renderPieChart(); }

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

function renderProjectionChart(labels, nominal, real) {
    const canvas = document.getElementById('projectionChart');
    if (!canvas) return;
    if (state.projectionChart) state.projectionChart.destroy();
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f8fafc' : '#020617';
    state.projectionChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets: [{ label: t('lab.nominal_label'), data: nominal, borderColor: '#2563eb', fill: false, tension: 0.4 }, { label: t('lab.real_label'), data: real, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: textColor } }, y: { ticks: { color: textColor } } }, plugins: { legend: { labels: { color: textColor } } } }
    });
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
    body.innerHTML = filtered.map(item => `<tr><td>${item.date}</td><td>${item.categoryName}</td><td class="${item.type==='income'?'amt-income':'amt-expense'}">৳ ${item.amount.toLocaleString()}</td><td>${item.method}</td><td><button class="btn-delete" onclick="window.deleteTx('${item.id}')">❌</button></td></tr>`).join('');
}

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
}

function setupTheme() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    const update = (mode) => {
        document.body.setAttribute('data-theme', mode);
        toggle.textContent = mode === 'dark' ? t('sidebar.light_mode') : t('sidebar.dark_mode');
    };
    update(localStorage.getItem('theme') || 'light');
    toggle.onclick = () => {
        const n = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', n);
        update(n);
    };
}

function setupSearch() {
    const input = document.getElementById('search-input');
    if (input) input.oninput = (e) => { state.searchTerm = e.target.value.toLowerCase(); renderTransactionTable(); };
}

function setupExports() {
    document.getElementById('export-excel').onclick = async () => {
        await logEvent("export_excel", state.user.uid);
        const data = state.transactions.map(t => ({ Date: t.date, Category: t.categoryName, Type: t.type, Amount: t.amount, Method: t.method }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Transactions");
        XLSX.writeFile(wb, "Money_Record_Report.xlsx");
    };
    document.getElementById('export-pdf').onclick = async () => {
        await logEvent("export_pdf", state.user.uid);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.text("Foot Print of Money Report", 14, 15);
        doc.autoTable({ head: [['Date', 'Category', 'Amount', 'Method']], body: state.transactions.map(t => [t.date, t.categoryName, t.amount, t.method]), startY: 20 });
        doc.save("Money_Record_Report.pdf");
    };
}

function setupBackup() {
    document.getElementById('backup-btn').onclick = async () => {
        await logEvent("export_json", state.user.uid);
        const backupData = { version: SchemaVersion, timestamp: new Date().toISOString(), data: { transactions: state.transactions, accounts: state.categories, budgets: state.budgets, recurring: state.recurring, goals: state.goals } };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Money_Record_Backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    };
    const restoreBtn = document.getElementById('restore-btn');
    const restoreInput = document.getElementById('restore-input');
    if (restoreBtn) {
        restoreBtn.onclick = () => restoreInput.click();
        restoreInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const backup = JSON.parse(ev.target.result);
                    if (!backup.data || !confirm(t('settings.confirm'))) return;
                    await logEvent("restore_json", state.user.uid, { timestamp: backup.timestamp });
                    const { transactions, accounts } = backup.data;
                    if (accounts) for (const item of accounts) await DB.add("accounts", { name: item.name, type: item.type });
                    if (transactions) for (const item of transactions) await DB.add("transactions", { date: item.date, amount: item.amount, categoryName: item.categoryName, type: item.type, method: item.method, description: item.description });
                    alert("Restored successfully!"); location.reload();
                } catch (err) { alert("Invalid format!"); }
            };
            reader.readAsText(file);
        };
    }
}

let unsubscribers = [];
let recurringPrompted = false;

function displayDailyTip() {
    const tipEl = document.getElementById('daily-tip');
    if (!tipEl) return;
    const tips = t('overview.tips');
    if (Array.isArray(tips)) tipEl.textContent = tips[Math.floor(Math.random() * tips.length)];
}

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
                    date: todayStr, categoryId: r.categoryId, categoryName: r.categoryName, type: 'expense',
                    amount: r.amount, method: 'নগদ টাকা', description: 'Auto-Recurring Entry', createdAt: Timestamp.now()
                });
                await DB.update("recurring_templates", r.id, { lastTriggered: todayStr });
            }
        }
    }
}

init().catch(err => {
    console.error("[App] Application initialization failed:", err);
    document.body.innerHTML += `<div style="position:fixed; top:0; color:red; background:white; padding:10px; z-index:9999;">Init Error: ${err.message}</div>`;
});
