/**
 * DataHub: Supabase Implementation with Schema Guardian
 * Architecture: 10-Year Sustainability with strict structural integrity.
 * Shared Schema Logic with Next.js Version.
 */

// Helper to robustly fetch environment variables
const _getEnv = (key) => {
    if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key];
    if (typeof window !== 'undefined' && window.__ENV && window.__ENV[key]) return window.__ENV[key];
    return `__${key}__`;
};

// --- Offline-First Infrastructure ---
const CACHE_PREFIX = 'fom_cache_';
const QUEUE_KEY = 'fom_sync_queue';

const _getCache = (coll) => JSON.parse(localStorage.getItem(CACHE_PREFIX + coll) || '[]');
const _setCache = (coll, data) => localStorage.setItem(CACHE_PREFIX + coll, JSON.stringify(data));
const _getQueue = () => JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
const _setQueue = (queue) => localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));

// Initialize Supabase Client
const supabaseUrl = _getEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = _getEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || _getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

const { createClient } = window.supabase;
const supabase = createClient(supabaseUrl, supabaseKey);

const SchemaVersion = "1.1.0";

/**
 * SCHEMA GUARDIAN: Hardened definitions for all collections
 * Aligned with Next.js version for cross-stack compatibility.
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
    financial_goals: {
        required: ['name', 'target_amount'],
        allowed: ['name', 'target_amount', 'current_amount', 'is_completed', 'project_id', 'user_id'],
        defaults: { target_amount: 0, current_amount: 0, is_completed: false },
        pk: 'id'
    },
    bill_reminders: {
        required: ['title', 'due_date'],
        allowed: ['title', 'amount', 'due_date', 'repeat_monthly', 'is_paid', 'project_id', 'user_id'],
        defaults: { amount: 0, repeat_monthly: false, is_paid: false },
        pk: 'id'
    },
    recurring_transactions: {
        required: ['name', 'amount', 'type'],
        allowed: ['name', 'amount', 'type', 'frequency', 'category_name', 'next_date', 'is_active', 'user_id'],
        defaults: { type: 'expense', frequency: 'monthly', is_active: true },
        pk: 'id'
    },
    financial_targets: {
        required: ['target_name', 'target_type', 'amount'],
        allowed: ['target_name', 'target_type', 'amount', 'month_year', 'is_active', 'user_id', 'project_id'],
        defaults: { target_type: 'monthly_profit', amount: 0, is_active: true },
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
    /**
     * Synchronizes a collection in real-time.
     */
    sync: async (coll, callback, orderField = null) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const userId = user.id;
        
        // 1. Immediate Cache Fallback
        const cached = _getCache(coll);
        if (cached.length > 0) callback(cached);

        const fetchInitialData = async () => {
            if (!navigator.onLine) return;
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

        if (navigator.onLine) {
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
        }
        return () => {};
    },

    /**
     * Adds a record with Schema Guard validation.
     */
    add: async (coll, data) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Unauthorized");

        try {
            const validatedData = validate(coll, data);
            const record = { ...validatedData, user_id: user.id, _schema: SchemaVersion };

            if (!navigator.onLine) {
                const tempId = 'temp_' + Date.now();
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
        } catch (error) {
            console.error(`[DataHub/Guardian] Add failed for ${coll}:`, error.message);
            throw error;
        }
    },

    /**
     * Updates a record with Schema Guard validation.
     */
    update: async (coll, id, data) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Unauthorized");

        try {
            const validatedData = validate(coll, data);
            const { error } = await supabase.from(coll).update(validatedData).eq('id', id).eq('user_id', user.id);
            if (error) throw error;
        } catch (error) {
            console.error(`[DataHub/Guardian] Update failed for ${coll}:`, error.message);
            throw error;
        }
    },

    /**
     * Deletes a record.
     */
    delete: async (coll, id) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Unauthorized");

        try {
            if (!navigator.onLine) {
                const cache = _getCache(coll);
                _setCache(coll, cache.filter(i => i.id !== id));
                const queue = _getQueue();
                queue.push({ action: 'delete', coll, id });
                _setQueue(queue);
                return;
            }

            const { error } = await supabase.from(coll).delete().eq('id', id).eq('user_id', user.id);
            if (error) throw error;
        } catch (error) {
            console.error(`[DataHub] Delete error:`, error);
            throw error;
        }
    }
};
