// app.js - Production Grade Logic
const SUPABASE_URL = window.__ENV?.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = window.__ENV?.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Critical Error: Missing Supabase Configuration.");
}

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Global State ---
let user = null;
let isSignup = false;
let currency = localStorage.getItem('base_currency') || '৳';
let charts = { main: null, pie: null };

const DEFAULT_CATEGORIES = [
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

// --- DOM Elements ---
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const authForm = document.getElementById('auth-form');
const transactionForm = document.getElementById('transaction-form');
const transactionList = document.getElementById('transaction-list');
const categorySelect = document.getElementById('category');
const typeSelect = document.getElementById('type');
const tabs = document.querySelectorAll('.tab[data-tab]');

// --- UI Helpers ---
function updateCategoryOptions() {
    const type = typeSelect.value;
    const filtered = DEFAULT_CATEGORIES.filter(c => c.type === type);
    categorySelect.innerHTML = filtered.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    document.getElementById('budget-category').innerHTML = DEFAULT_CATEGORIES.filter(c => c.type === 'expense').map(c => `<option value="${c.name}">${c.name}</option>`).join('');
}
typeSelect.onchange = updateCategoryOptions;

// --- Auth logic ---
async function handleAuth(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = isSignup ? await supabaseClient.auth.signUp({ email, password }) : await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
}
document.getElementById('github-login-btn').onclick = async () => {
    await supabaseClient.auth.signInWithOAuth({ provider: 'github' });
};
document.getElementById('toggle-auth').onclick = () => {
    isSignup = !isSignup;
    document.getElementById('auth-title').innerText = isSignup ? "Sign Up" : "Login";
    document.getElementById('submit-btn').innerText = isSignup ? "Sign Up" : "Login";
};
document.getElementById('logout-btn').onclick = () => supabaseClient.auth.signOut();

// --- Main Data Sync ---
async function fetchData() {
    if (!user) return;
    updateCategoryOptions();

    const { data: txs } = await supabaseClient.from('transactions').select('*').eq('user_id', user.id).order('occurred_at', { ascending: false });
    
    let inc = 0, exp = 0;
    txs?.forEach(t => { if (t.type === 'income') inc += parseFloat(t.amount); else exp += parseFloat(t.amount); });

    document.getElementById('total-balance').innerText = `${currency}${(inc - exp).toFixed(0)}`;
    document.getElementById('total-income').innerText = `${currency}${inc.toFixed(0)}`;
    document.getElementById('total-expense').innerText = `${currency}${exp.toFixed(0)}`;

    renderTransactions(txs?.slice(0, 10) || []);
    renderCharts(txs || []);
    updateAssistant(inc, exp, txs || []);
    processRecurring(txs || []);
}

function renderTransactions(list) {
    transactionList.innerHTML = list.map(t => `
        <div class="transaction-item">
            <div><strong>${t.category_name || 'N/A'}</strong><br><small>${t.metadata?.sector || 'Gen'} | ${t.method || 'Cash'}</small></div>
            <span style="color:${t.type === 'income' ? 'var(--income)' : 'var(--expense)'}">${t.type === 'income' ? '+' : '-'}${currency}${Math.abs(t.amount).toFixed(0)}</span>
        </div>
    `).join('');
}

// --- Visual Analytics (Charts) ---
function renderCharts(txs) {
    const ctxMain = document.getElementById('income-expense-chart').getContext('2d');
    const ctxPie = document.getElementById('category-chart').getContext('2d');

    // Aggregate by category
    const catData = {};
    txs.filter(t => t.type === 'expense').forEach(t => {
        catData[t.category_name] = (catData[t.category_name] || 0) + parseFloat(t.amount);
    });

    if (charts.main) charts.main.destroy();
    if (charts.pie) charts.pie.destroy();

    charts.main = new Chart(ctxMain, {
        type: 'bar',
        data: {
            labels: ['Income', 'Expense'],
            datasets: [{
                label: 'Monthly Summary',
                data: [
                    txs.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0),
                    txs.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0)
                ],
                backgroundColor: ['#10b981', '#ef4444']
            }]
        }
    });

    charts.pie = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: Object.keys(catData),
            datasets: [{
                data: Object.values(catData),
                backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899']
            }]
        },
        options: { plugins: { title: { display: true, text: 'Expense Distribution' } } }
    });
}

// --- Recurring Engine ---
async function processRecurring(txs) {
    const { data: recs } = await supabaseClient.from('recurring_transactions').select('*').eq('user_id', user.id).eq('is_active', true);
    const today = new Date().getDate();
    
    for (const r of (recs || [])) {
        if (r.next_date === today) {
            // Check if already added today
            const already = txs.find(t => t.notes === `Auto:${r.name}` && new Date(t.occurred_at).toDateString() === new Date().toDateString());
            if (!already) {
                await supabaseClient.from('transactions').insert([{
                    user_id: user.id, amount: r.amount, type: r.type, category_name: r.category_name, 
                    notes: `Auto:${r.name}`, occurred_at: new Date().toISOString()
                }]);
                console.log(`[Recurring] Added: ${r.name}`);
            }
        }
    }
}

// --- Assistant Logic ---
async function updateAssistant(inc, exp, txs) {
    const { data: budgets } = await supabaseClient.from('budgets').select('*').eq('user_id', user.id);
    const healthBadge = document.getElementById('health-score-badge');
    const adviceEl = document.getElementById('assistant-advice');

    const savings = inc - exp;
    const score = Math.max(0, Math.min(100, Math.round((inc > 0 ? (savings / inc) : 0) * 200)));
    healthBadge.innerText = `Score: ${score}`;
    healthBadge.style.background = score > 70 ? '#10b981' : (score > 40 ? '#f59e0b' : '#ef4444');

    let tips = [];
    budgets?.forEach(b => {
        const spent = txs.filter(t => t.category_name === b.category_name && t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        if (spent > b.amount * 0.8) tips.push(`• ⚠️ Budget Alert: You reached 80% of <strong>${b.category_name}</strong> limit!`);
    });
    
    if (exp > inc) tips.push("• 🔴 High Alert: Your spending is higher than income!");
    adviceEl.innerHTML = tips.length > 0 ? tips.join('<br>') : "• Your finances look stable. Keep tracking!";
}

// --- Tabs and UI logic ---
function switchTab(tabName) {
    document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    if (tabName === 'accounting') fetchAccountingData();
    if (tabName === 'reports') generateReport();
}

tabs.forEach(tab => tab.onclick = () => switchTab(tab.dataset.tab));

// Sub-tabs handlers
['acc', 'lab'].forEach(prefix => {
    document.querySelectorAll(`.${prefix}-subtab`).forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll(`.${prefix}-subtab`).forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll(`.${prefix}-content`).forEach(c => c.classList.add('hidden'));
            document.getElementById(`${prefix}-${tab.dataset[prefix]}`).classList.remove('hidden');
            if (prefix === 'acc') fetchAccountingData();
        };
    });
});

// Settings: Currency & PIN
document.getElementById('set-currency').onchange = (e) => {
    currency = e.target.value;
    localStorage.setItem('base_currency', currency);
    fetchData();
};
document.getElementById('save-pin-btn').onclick = () => {
    const pin = document.getElementById('set-pin').value;
    if (pin.length === 4) { localStorage.setItem('app_pin', pin); alert("PIN Saved!"); }
};
document.getElementById('unlock-btn').onclick = () => {
    if (document.getElementById('unlock-pin').value === localStorage.getItem('app_pin')) {
        document.getElementById('pin-overlay').classList.add('hidden');
    } else { document.getElementById('pin-error').classList.remove('hidden'); }
};

// Lifecycle
supabaseClient.auth.onAuthStateChange((event, session) => {
    user = session?.user;
    if (user) {
        authSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        if (localStorage.getItem('app_pin')) document.getElementById('pin-overlay').classList.remove('hidden');
        fetchData();
    } else {
        authSection.classList.remove('hidden');
        appSection.classList.add('hidden');
    }
});

// Form Submissions
transactionForm.onsubmit = async (e) => {
    e.preventDefault();
    await supabaseClient.from('transactions').insert([{
        user_id: user.id, amount: parseFloat(document.getElementById('amount').value),
        type: typeSelect.value, category_name: categorySelect.value,
        metadata: { sector: document.getElementById('sector').value },
        method: document.getElementById('account').value, notes: document.getElementById('note').value,
        occurred_at: new Date().toISOString()
    }]);
    transactionForm.reset();
    switchTab('dashboard');
    fetchData();
};

document.getElementById('budget-form').onsubmit = async (e) => {
    e.preventDefault();
    await supabaseClient.from('budgets').upsert([{
        user_id: user.id, category_name: document.getElementById('budget-category').value,
        amount: parseFloat(document.getElementById('budget-amount').value)
    }], { onConflict: 'user_id,category_name' });
    alert("Budget Set!");
    fetchAccountingData();
};

document.getElementById('recurring-form').onsubmit = async (e) => {
    e.preventDefault();
    await supabaseClient.from('recurring_transactions').insert([{
        user_id: user.id, name: document.getElementById('rec-name').value,
        amount: parseFloat(document.getElementById('rec-amount').value),
        type: document.getElementById('rec-type').value,
        next_date: parseInt(document.getElementById('rec-day').value),
        is_active: true
    }]);
    alert("Recurring Added!");
    fetchAccountingData();
};

// --- Reporting Logic ---
async function generateReport() {
    if (!user) return;
    const sectorFilter = document.getElementById('report-sector').value;
    const { data: txs } = await supabaseClient.from('transactions').select('*').eq('user_id', user.id).order('occurred_at', { ascending: false });
    const filtered = txs?.filter(t => sectorFilter === 'all' || (t.metadata?.sector === sectorFilter)) || [];
    document.getElementById('report-date-range').innerText = `As of ${new Date().toLocaleDateString()} | Sector: ${sectorFilter}`;
    const tbody = document.getElementById('report-table-body');
    tbody.innerHTML = filtered.map(t => `
        <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 10px;">${new Date(t.occurred_at).toLocaleDateString()}</td>
            <td style="padding: 10px;">${t.category_name || 'N/A'}</td>
            <td style="padding: 10px;">${t.metadata?.sector || 'General'}</td>
            <td style="padding: 10px; text-align: right; color: ${t.type === 'income' ? 'var(--income)' : 'var(--expense)'}">
                ${t.type === 'income' ? '+' : '-'}${currency}${Math.abs(t.amount).toFixed(0)}
            </td>
        </tr>
    `).join('') || '<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-muted);">No records found.</td></tr>';
}

document.getElementById('report-sector').onchange = generateReport;
document.getElementById('print-btn').onclick = () => window.print();

// --- Accounting Logic (Expanded) ---
async function fetchAccountingData() {
    const { data: txs } = await supabaseClient.from('transactions').select('*').eq('user_id', user.id);
    const { data: buds } = await supabaseClient.from('budgets').select('*').eq('user_id', user.id);
    const { data: recs } = await supabaseClient.from('recurring_transactions').select('*').eq('user_id', user.id);

    // Render P&L
    const sectors = {};
    txs?.forEach(t => {
        const s = t.metadata?.sector || 'General';
        if (!sectors[s]) sectors[s] = { inc: 0, exp: 0 };
        if (t.type === 'income') sectors[s].inc += parseFloat(t.amount); else sectors[s].exp += parseFloat(t.amount);
    });
    document.getElementById('pnl-report').innerHTML = Object.entries(sectors).map(([n, d]) => `
        <div class="card" style="margin-bottom: 10px; border-left: 4px solid ${d.inc >= d.exp ? 'var(--income)' : 'var(--expense)'}">
            <div style="display:flex; justify-content:space-between; font-weight:bold;">
                <span>Sector: ${n}</span>
                <span style="color: ${d.inc >= d.exp ? 'var(--income)' : 'var(--expense)'}">Net: ${currency}${(d.inc - d.exp).toFixed(0)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-top:5px;">
                <span>Total Income: ${currency}${d.inc.toFixed(0)}</span>
                <span>Total Expense: ${currency}${d.exp.toFixed(0)}</span>
            </div>
        </div>
    `).join('') || 'No data.';

    // Render Budgets
    document.getElementById('budget-list').innerHTML = buds?.map(b => {
        const spent = txs.filter(t => t.category_name === b.category_name && t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        const percent = Math.min(100, Math.round((spent / b.amount) * 100));
        return `
            <div class="card" style="margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <strong>${b.category_name}</strong>
                    <span>${currency}${spent} / ${currency}${b.amount}</span>
                </div>
                <div style="width:100%; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
                    <div style="width:${percent}%; height:100%; background:${percent > 90 ? 'var(--expense)' : 'var(--primary)'}"></div>
                </div>
            </div>
        `;
    }).join('') || 'No budgets set.';

    // Render Recurring
    document.getElementById('recurring-list').innerHTML = recs?.map(r => `
        <div class="card" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong>${r.name}</strong><br>
                <small>${r.type.toUpperCase()} | Day ${r.next_date} of month</small>
            </div>
            <strong>${currency}${r.amount}</strong>
        </div>
    `).join('') || 'No recurring items.';
}

// Data Export/Import logic (from previous version)
document.getElementById('export-btn').onclick = async () => {
    const { data: transactions } = await supabaseClient.from('transactions').select('*').eq('user_id', user.id);
    const blob = new Blob([JSON.stringify({ transactions }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'backup.json'; a.click();
};
const importFile = document.getElementById('import-file');
document.getElementById('import-btn').onclick = () => importFile.click();
importFile.onchange = (e) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const data = JSON.parse(ev.target.result);
        if (data.transactions) await supabaseClient.from('transactions').insert(data.transactions.map(t => ({...t, id: undefined, user_id: user.id})));
        location.reload();
    };
    reader.readAsText(e.target.files[0]);
};
