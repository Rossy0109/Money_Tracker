import { supabaseClient } from './supabase.js';

export let allTransactions = [];

const LOCAL_TX_KEY = 'local_transactions';
const LOCAL_CAT_KEY = 'local_categories';

function getLocalTransactions() {
    try {
        return JSON.parse(localStorage.getItem(LOCAL_TX_KEY) || '[]');
    } catch { return []; }
}

function saveLocalTransactions(txs) {
    localStorage.setItem(LOCAL_TX_KEY, JSON.stringify(txs));
}

export async function fetchCategories(userId) {
    if (!userId) return getLocalCategories();
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('categories').select('*').eq('user_id', userId);
            if (!error && data) return data;
        } catch (e) {
            console.warn("Supabase fetchCategories failed, fallback to local:", e);
        }
    }
    return getLocalCategories();
}

function getLocalCategories() {
    const defaults = [
        { id: 'cat-1', name: 'Food', icon: '🍔', type: 'expense' },
        { id: 'cat-2', name: 'Transport', icon: '🚗', type: 'expense' },
        { id: 'cat-3', name: 'Rent', icon: '🏠', type: 'expense' },
        { id: 'cat-4', name: 'Utilities', icon: '💡', type: 'expense' },
        { id: 'cat-5', name: 'Health', icon: '💊', type: 'expense' },
        { id: 'cat-6', name: 'Education', icon: '📚', type: 'expense' },
        { id: 'cat-7', name: 'Salary', icon: '💼', type: 'income' },
        { id: 'cat-8', name: 'Business', icon: '🏪', type: 'income' },
        { id: 'cat-9', name: 'Gift', icon: '🎁', type: 'income' },
        { id: 'cat-10', name: 'Investment', icon: '📈', type: 'income' },
        { id: 'cat-11', name: 'Other', icon: '📦', type: 'expense' }
    ];
    try {
        const saved = JSON.parse(localStorage.getItem(LOCAL_CAT_KEY) || '[]');
        return saved.length ? saved : defaults;
    } catch { return defaults; }
}

export async function addCategory(categoryData) {
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('categories').insert([categoryData]);
            if (!error) return data;
        } catch (e) { console.warn(e); }
    }
    const cats = getLocalCategories();
    const newCat = { ...categoryData, id: 'cat-' + Date.now() };
    cats.push(newCat);
    localStorage.setItem(LOCAL_CAT_KEY, JSON.stringify(cats));
    return [newCat];
}

export async function deleteCategory(id) {
    if (supabaseClient) {
        try { await supabaseClient.from('categories').delete().eq('id', id); } catch (e) { console.warn(e); }
    }
    const cats = getLocalCategories().filter(c => c.id !== id);
    localStorage.setItem(LOCAL_CAT_KEY, JSON.stringify(cats));
}

export async function fetchTransactions(userId) {
    if (supabaseClient && userId && userId !== 'local-user-id' && userId !== 'demo-user-101') {
        try {
            const { data: txs, error } = await supabaseClient.from('transactions')
                .select('*')
                .eq('user_id', userId)
                .order('occurred_at', { ascending: false });
            
            if (!error && txs) {
                allTransactions = txs;
                saveLocalTransactions(txs);
                return allTransactions;
            }
        } catch (err) {
            console.warn("Supabase fetchTransactions failed, using local storage:", err);
        }
    }
    
    allTransactions = getLocalTransactions();
    // Sort descending by occurred_at
    allTransactions.sort((a, b) => new Date(b.occurred_at || 0) - new Date(a.occurred_at || 0));
    return allTransactions;
}

export async function addTransaction(transactionData) {
    const txWithId = {
        id: transactionData.id || 'tx-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        ...transactionData,
        created_at: new Date().toISOString()
    };

    if (supabaseClient && transactionData.user_id && transactionData.user_id !== 'local-user-id' && transactionData.user_id !== 'demo-user-101') {
        try {
            const { data, error } = await supabaseClient.from('transactions').insert([transactionData]);
            if (!error) {
                await fetchTransactions(transactionData.user_id);
                return data;
            }
        } catch (e) {
            console.warn("Supabase insert failed, saving locally:", e);
        }
    }

    const localTxs = getLocalTransactions();
    localTxs.unshift(txWithId);
    saveLocalTransactions(localTxs);
    allTransactions = localTxs;
    return [txWithId];
}

export async function updateTransaction(id, updatedFields) {
    if (supabaseClient) {
        try {
            await supabaseClient.from('transactions').update(updatedFields).eq('id', id);
        } catch (e) { console.warn(e); }
    }
    const localTxs = getLocalTransactions().map(tx => tx.id === id ? { ...tx, ...updatedFields } : tx);
    saveLocalTransactions(localTxs);
    allTransactions = localTxs;
}

export async function deleteTransaction(id) {
    if (supabaseClient) {
        try {
            await supabaseClient.from('transactions').delete().eq('id', id);
        } catch (e) {
            console.warn("Supabase delete failed, removing locally:", e);
        }
    }
    const localTxs = getLocalTransactions().filter(tx => tx.id !== id);
    saveLocalTransactions(localTxs);
    allTransactions = localTxs;
}

export function seedDemoData() {
    const now = new Date();
    const curMonthStr = now.toISOString().substring(0, 7);
    
    // Sample transactions across current and previous month
    const sampleTxs = [
        {
            id: 'demo-tx-1',
            amount: 120000,
            type: 'income',
            category_name: 'Salary',
            method: 'Bank',
            notes: 'Monthly Tech Lead Salary Direct Deposit',
            occurred_at: `${curMonthStr}-01T09:00:00.000Z`,
            currency: 'BDT',
            metadata: { sector: 'Personal' }
        },
        {
            id: 'demo-tx-2',
            amount: 35000,
            type: 'income',
            category_name: 'Business',
            method: 'bKash',
            notes: 'Freelance Web Design Client Milestone 2',
            occurred_at: `${curMonthStr}-05T14:30:00.000Z`,
            currency: 'BDT',
            metadata: { sector: 'Business' }
        },
        {
            id: 'demo-tx-3',
            amount: 32000,
            type: 'expense',
            category_name: 'Rent',
            method: 'Bank',
            notes: 'Apartment Monthly Rent & Maintenance',
            occurred_at: `${curMonthStr}-02T10:00:00.000Z`,
            currency: 'BDT',
            metadata: { sector: 'Personal' }
        },
        {
            id: 'demo-tx-4',
            amount: 14500,
            type: 'expense',
            category_name: 'Food',
            method: 'Card',
            notes: 'Weekly Family Supermarket Groceries',
            occurred_at: `${curMonthStr}-06T18:20:00.000Z`,
            currency: 'BDT',
            metadata: { sector: 'Personal' }
        },
        {
            id: 'demo-tx-5',
            amount: 4200,
            type: 'expense',
            category_name: 'Utilities',
            method: 'bKash',
            notes: 'Electricity & High-Speed Fiber Internet',
            occurred_at: `${curMonthStr}-08T11:15:00.000Z`,
            currency: 'BDT',
            metadata: { sector: 'General' }
        },
        {
            id: 'demo-tx-6',
            amount: 6800,
            type: 'expense',
            category_name: 'Food',
            method: 'Cash',
            notes: 'Dinner with Team & Coffee Meetings',
            occurred_at: `${curMonthStr}-10T20:00:00.000Z`,
            currency: 'BDT',
            metadata: { sector: 'Business' }
        },
        {
            id: 'demo-tx-7',
            amount: 5200,
            type: 'expense',
            category_name: 'Transport',
            method: 'Card',
            notes: 'Fuel & Highway Tolls',
            occurred_at: `${curMonthStr}-12T08:45:00.000Z`,
            currency: 'BDT',
            metadata: { sector: 'Personal' }
        },
        {
            id: 'demo-tx-8',
            amount: 12500,
            type: 'income',
            category_name: 'Investment',
            method: 'Bank',
            notes: 'Quarterly Mutual Fund Dividend',
            occurred_at: `${curMonthStr}-14T16:00:00.000Z`,
            currency: 'BDT',
            metadata: { sector: 'Personal' }
        },
        {
            id: 'demo-tx-9',
            amount: 6500,
            type: 'expense',
            category_name: 'Health',
            method: 'Card',
            notes: 'Full Body Medical Checkup & Vitamins',
            occurred_at: `${curMonthStr}-15T12:00:00.000Z`,
            currency: 'BDT',
            metadata: { sector: 'Personal' }
        },
        {
            id: 'demo-tx-10',
            amount: 4500,
            type: 'expense',
            category_name: 'Education',
            method: 'bKash',
            notes: 'Cloud Architecture Certification Course',
            occurred_at: `${curMonthStr}-18T19:30:00.000Z`,
            currency: 'BDT',
            metadata: { sector: 'Business' }
        }
    ];

    saveLocalTransactions(sampleTxs);
    allTransactions = sampleTxs;

    // Seed default assets
    const sampleAssets = [
        { name: 'City Bank Checking', balance: 185000, type: 'Bank' },
        { name: 'Cash Wallet', balance: 18500, type: 'Cash' },
        { name: 'bKash Mobile Wallet', balance: 24200, type: 'Mobile' },
        { name: 'Fixed Deposit (FDR)', balance: 350000, type: 'Investment' }
    ];
    localStorage.setItem('assets', JSON.stringify(sampleAssets));

    // Seed default liabilities
    const sampleDebts = [
        { name: 'Visa Platinum Credit Card', balance: 28500 },
        { name: 'Car Loan Remaining', balance: 140000 }
    ];
    localStorage.setItem('debts', JSON.stringify(sampleDebts));

    // Seed default budgets
    const sampleBudgets = {
        'Food': 22000,
        'Transport': 9000,
        'Rent': 35000,
        'Utilities': 6000,
        'Health': 10000,
        'Education': 8000
    };
    localStorage.setItem('budgets', JSON.stringify(sampleBudgets));

    // Seed default savings goals
    const sampleGoals = [
        { id: 'g1', name: 'Emergency Fund (6 Months)', target: 300000, saved: 180000, deadline: '2026-12-31' },
        { id: 'g2', name: 'MacBook Pro M3 Max', target: 240000, saved: 160000, deadline: '2026-10-15' },
        { id: 'g3', name: 'Annual Family Vacation', target: 100000, saved: 45000, deadline: '2026-11-30' }
    ];
    localStorage.setItem('savings_goals', JSON.stringify(sampleGoals));

    // Seed default recurring transactions
    const sampleRecs = [
        { name: 'Monthly Rent', amount: 32000, type: 'expense', day: 2, category: 'Rent' },
        { name: 'Fiber Internet Bill', amount: 1500, type: 'expense', day: 5, category: 'Utilities' },
        { name: 'Software Engineering Salary', amount: 120000, type: 'income', day: 1, category: 'Salary' }
    ];
    localStorage.setItem('recurrings', JSON.stringify(sampleRecs));

    return sampleTxs;
}

export function exportData(transactions, categories) {
    const payload = { 
        exported_at: new Date().toISOString(),
        transactions: transactions || getLocalTransactions(),
        categories: categories || getLocalCategories(),
        assets: JSON.parse(localStorage.getItem('assets') || '[]'),
        debts: JSON.parse(localStorage.getItem('debts') || '[]'),
        budgets: JSON.parse(localStorage.getItem('budgets') || '{}'),
        goals: JSON.parse(localStorage.getItem('savings_goals') || '[]'),
        recurrings: JSON.parse(localStorage.getItem('recurrings') || '[]')
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `money_footprint_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export function importData(jsonData) {
    if (!jsonData) return false;
    if (Array.isArray(jsonData.transactions)) {
        saveLocalTransactions(jsonData.transactions);
    }
    if (Array.isArray(jsonData.categories)) {
        localStorage.setItem(LOCAL_CAT_KEY, JSON.stringify(jsonData.categories));
    }
    if (Array.isArray(jsonData.assets)) {
        localStorage.setItem('assets', JSON.stringify(jsonData.assets));
    }
    if (Array.isArray(jsonData.debts)) {
        localStorage.setItem('debts', JSON.stringify(jsonData.debts));
    }
    if (jsonData.budgets && typeof jsonData.budgets === 'object') {
        localStorage.setItem('budgets', JSON.stringify(jsonData.budgets));
    }
    if (Array.isArray(jsonData.goals)) {
        localStorage.setItem('savings_goals', JSON.stringify(jsonData.goals));
    }
    if (Array.isArray(jsonData.recurrings)) {
        localStorage.setItem('recurrings', JSON.stringify(jsonData.recurrings));
    }
    return true;
}

