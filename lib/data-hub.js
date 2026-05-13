/**
 * lib/data-hub.js
 * Refactored Supabase Implementation for Next.js
 * Fixes Audit Issues: #5, #6, #7, #8, #9, #12
 * Rule: All .eq() must use 'id' for primary keys.
 */
import { supabase } from './supabase.js';
import { SCHEMA_VERSION } from './constants';

// --- State Management (Internal) ---
let currentUserId = null;

// --- Offline-First Helpers ---
const CACHE_PREFIX = 'fom_cache_';
const QUEUE_KEY = 'fom_sync_queue';

const _getCache = (coll) => {
    if (typeof window === 'undefined') return [];
    return JSON.parse(localStorage.getItem(CACHE_PREFIX + coll) || '[]');
};

const _setCache = (coll, data) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CACHE_PREFIX + coll, JSON.stringify(data));
};

const _getQueue = () => {
    if (typeof window === 'undefined') return [];
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
};

const _setQueue = (queue) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

/**
 * SCHEMA GUARDIAN: Hardened definitions for all collections
 */
const SCHEMAS = {
    accounts: {
        required: ['name', 'type'],
        allowed: ['name', 'type', 'currency', 'balance', 'institution', 'metadata', 'user_id'],
        defaults: { type: 'cash', currency: 'USD', balance: 0 },
        pk: 'id'
    },
    categories: {
        required: ['name', 'type'],
        allowed: ['name', 'type', 'icon', 'color', 'user_id'],
        defaults: { type: 'expense', icon: '📁', color: '#6366f1' },
        pk: 'id'
    },
    transactions: {
        required: ['amount', 'date', 'type', 'category_name'],
        allowed: ['amount', 'date', 'type', 'category_name', 'method', 'description', 'category_id', 'project_id', 'currency', 'user_id', 'metadata'],
        defaults: { method: 'Cash', description: '', currency: 'USD' },
        pk: 'id'
    },
    budgets: {
        required: ['amount', 'category_name'],
        allowed: ['amount', 'category_name', 'category_id', 'project_id', 'month_year', 'user_id'],
        defaults: { amount: 0 },
        pk: 'id'
    },
    projects: {
        required: ['name'],
        allowed: ['name', 'budget', 'status', 'user_id'],
        defaults: { status: 'active', budget: 0 },
        pk: 'id'
    },
    debts: {
        required: ['name', 'balance'],
        allowed: ['name', 'balance', 'apr', 'min_payment', 'project_id', 'user_id'],
        defaults: { apr: 0, min_payment: 0, balance: 0 },
        pk: 'id'
    },
    financial_targets: {
        required: ['target_name', 'target_type', 'amount'],
        allowed: ['target_name', 'target_type', 'amount', 'month_year', 'is_active', 'user_id', 'project_id'],
        defaults: { target_type: 'monthly_profit', amount: 0, is_active: true },
        pk: 'id'
    },
    recurring_transactions: {
        required: ['name', 'amount', 'type'],
        allowed: ['name', 'amount', 'type', 'frequency', 'category_name', 'next_date', 'is_active', 'user_id'],
        defaults: { type: 'expense', frequency: 'monthly', is_active: true },
        pk: 'id'
    },
    profiles: {
        required: ['email'],
        allowed: ['id', 'email', 'display_name', 'avatar_url', 'currency', 'locale', 'metadata'],
        defaults: { currency: 'USD' },
        pk: 'id'
    }
};

/**
 * Validates and cleans data before DB operations
 */
const validate = (coll, data) => {
    const schema = SCHEMAS[coll];
    if (!schema) return data; 

    const mappedData = { ...data };
    
    // Normalization logic for mixed camel/snake case from UI
    if (data.categoryName) mappedData.category_name = data.categoryName;
    if (data.categoryId) mappedData.category_id = data.categoryId;
    if (data.projectId) mappedData.project_id = data.projectId;
    if (data.targetName) mappedData.target_name = data.targetName;
    if (data.targetType) mappedData.target_type = data.targetType;
    if (data.categoryName) mappedData.category_name = data.categoryName; // Duplicate but safe
    if (data.nextDate) mappedData.next_date = data.nextDate;

    for (const key of schema.required) {
        if (mappedData[key] === undefined || mappedData[key] === null || mappedData[key] === '') {
            throw new Error(`[Schema Guardian] Missing required field: ${key} in ${coll}`);
        }
    }

    const cleaned = {};
    for (const key of schema.allowed) {
        cleaned[key] = mappedData[key] !== undefined ? mappedData[key] : (schema.defaults[key] !== undefined ? schema.defaults[key] : null);
    }
    return cleaned;
};

export const DataHub = {
    setUser: (uid) => {
        currentUserId = uid;
    },

    getUserId: async () => {
        if (currentUserId) return currentUserId;
        const { data: { user } } = await supabase.auth.getUser();
        return user ? user.id : null;
    },

    upsertProfile: async (profileData) => {
        const { data, error } = await supabase
            .from('profiles')
            .upsert({ 
                ...profileData, 
                updated_at: new Date().toISOString() 
            }, { onConflict: 'id' })
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    sync: async (coll, callback, orderField = null) => {
        const userId = await DataHub.getUserId();
        if (!userId) return;
        
        const cached = _getCache(coll);
        if (cached.length > 0) callback(cached);

        const fetchInitialData = async () => {
            if (typeof navigator !== 'undefined' && !navigator.onLine) return;
            let query = supabase.from(coll).select('*').eq('user_id', userId);
            
            if (orderField) {
                query = query.order(orderField, { ascending: false });
            }
            
            const { data, error } = await query;
            if (!error) {
                _setCache(coll, data);
                callback(data);
            }
        };

        fetchInitialData();

        const channel = supabase
            .channel(`public:${coll}:user_${userId}`)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: coll,
                filter: `user_id=eq.${userId}`
            }, () => fetchInitialData())
            .subscribe();

        return () => supabase.removeChannel(channel);
    },

    /**
     * One-time data fetch for non-streaming context
     */
    get: async (coll, orderField = null) => {
        const userId = await DataHub.getUserId();
        if (!userId) return [];

        let query = supabase.from(coll).select('*').eq('user_id', userId);
        if (orderField) query = query.order(orderField, { ascending: false });

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    add: async (coll, data) => {
        const userId = await DataHub.getUserId();
        if (!userId) throw new Error("Unauthorized");

        const validatedData = validate(coll, data);
        const record = { ...validatedData, user_id: userId, _schema: SCHEMA_VERSION };

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            const tempId = crypto.randomUUID();
            const offlineRecord = { ...record, id: tempId, _offline: true };
            const cache = _getCache(coll);
            _setCache(coll, [offlineRecord, ...cache]);
            
            const queue = _getQueue();
            queue.push({ action: 'add', coll, data: record, tempId });
            _setQueue(queue);
            return offlineRecord;
        }

        const { data: result, error } = await supabase.from(coll).insert(record).select().single();
        if (error) throw error;
        return result;
    },

    batchAdd: async (coll, items) => {
        const userId = await DataHub.getUserId();
        if (!userId) throw new Error("Unauthorized");

        const records = items.map(item => ({
            ...validate(coll, item),
            user_id: userId,
            _schema: SCHEMA_VERSION
        }));

        const { data, error } = await supabase.from(coll).insert(records).select();
        if (error) throw error;
        return data;
    },

    update: async (coll, id, data) => {
        const userId = await DataHub.getUserId();
        if (!userId) throw new Error("Unauthorized");

        const validatedData = validate(coll, data);
        const { error } = await supabase
            .from(coll)
            .update(validatedData)
            .eq('id', id)
            .eq('user_id', userId);
        
        if (error) throw error;
    },

    delete: async (coll, id) => {
        const userId = await DataHub.getUserId();
        if (!userId) throw new Error("Unauthorized");

        const { error } = await supabase
            .from(coll)
            .delete()
            .eq('id', id)
            .eq('user_id', userId);
        
        if (error) throw error;
    },

    getFinancialSummary: (transactions) => {
        const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
        const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
        return { income, expense, balance: income - expense };
    }
};
