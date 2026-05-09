/**
 * DataHub: Supabase Implementation with Schema Guardian
 * Architecture: 10-Year Sustainability with strict structural integrity.
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
const supabaseUrl = _getEnv('SUPABASE_URL');
const supabaseKey = _getEnv('SUPABASE_KEY');
const { createClient } = window.supabase;
const supabase = createClient(supabaseUrl, supabaseKey);

const SchemaVersion = "1.0.0";

/**
 * SCHEMA GUARDIAN: Hardened definitions for all collections
 */
const SCHEMAS = {
    accounts: {
        required: ['name', 'type'],
        allowed: ['name', 'type'],
        defaults: { type: 'expense' },
        pk: 'account_id'
    },
    transactions: {
        required: ['amount', 'date', 'type', 'categoryName'],
        allowed: ['amount', 'date', 'type', 'categoryName', 'method', 'description', 'categoryId', 'vatAmount', 'createdAt'],
        defaults: { method: 'Cash', description: '' },
        pk: 'transaction_id'
    },
    budgets: {
        required: ['amount'],
        allowed: ['amount', 'categoryName'],
        defaults: {},
        pk: 'id'
    },
    financial_goals: {
        required: ['name', 'target'],
        allowed: ['name', 'target'],
        defaults: {},
        pk: 'id'
    },
    recurring_templates: {
        required: ['amount', 'categoryName', 'day'],
        allowed: ['amount', 'categoryName', 'day', 'createdAt'],
        defaults: {},
        pk: 'id'
    },
    debts_registry: {
        required: ['name', 'balance'],
        allowed: ['name', 'balance', 'apr', 'minPayment'],
        defaults: { apr: 0, minPayment: 0 },
        pk: 'id'
    }
};

/**
 * Validates and cleans data before DB operations
 */
const validate = (coll, data) => {
    const schema = SCHEMAS[coll];
    if (!schema) return data; // Pass-through for unknown collections

    // 1. Check required fields
    for (const key of schema.required) {
        if (data[key] === undefined || data[key] === null || data[key] === '') {
            throw new Error(`[Schema Guardian] Missing required field: ${key} in ${coll}`);
        }
    }

    // 2. Filter only allowed fields (strip "dirty" data)
    const cleaned = {};
    for (const key of schema.allowed) {
        cleaned[key] = data[key] !== undefined ? data[key] : (schema.defaults[key] || null);
    }

    return cleaned;
};

export const DataHub = {
    /**
     * Synchronizes a collection in real-time.
     */
    sync: async (coll, callback, orderField = null) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { console.error("[DataHub] No user logged in for sync"); return; }
        const userId = user.id;
        
        console.log(`[DataHub] Syncing ${coll} for user: ${userId}`);
        
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
            if (error) {
                console.error(`[DataHub] Initial fetch error for ${coll}:`, error);
            } else {
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
                }, (payload) => {
                    console.log(`[DataHub] Change received for ${coll}:`, payload);
                    fetchInitialData();
                })
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
        return () => {};
    },

    /**
     * Adds a record with Schema Guard validation.
     */
    add: async (coll, data) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("[DataHub] User not authenticated");

        try {
            const validatedData = validate(coll, data);
            const record = { ...validatedData, user_id: user.id, _schema: SchemaVersion };

            // Handle Offline
            if (!navigator.onLine) {
                const tempId = 'temp_' + Date.now();
                const pk = SCHEMAS[coll]?.pk || 'id';
                const offlineRecord = { ...record, [pk]: tempId, _offline: true };
                
                // Update Cache
                const cache = _getCache(coll);
                _setCache(coll, [offlineRecord, ...cache]);
                
                // Queue for Sync
                const queue = _getQueue();
                queue.push({ action: 'add', coll, data: record, tempId });
                _setQueue(queue);
                
                console.warn(`[DataHub] Offline: Added to queue for ${coll}`);
                return offlineRecord;
            }

            console.log(`[DataHub] Adding (Validated) to ${coll}`);
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
        if (!user) throw new Error("[DataHub] User not authenticated");

        try {
            const schema = SCHEMAS[coll];
            const pk = schema?.pk || 'id';
            const cleaned = {};
            if (schema) {
                Object.keys(data).forEach(key => {
                    if (schema.allowed.includes(key)) cleaned[key] = data[key];
                });
            } else {
                Object.assign(cleaned, data);
            }

            const record = { ...cleaned, user_id: user.id, _schema: SchemaVersion };

            // Handle Offline
            if (!navigator.onLine) {
                const cache = _getCache(coll);
                const idx = cache.findIndex(i => i[pk] === id);
                if (idx !== -1) {
                    cache[idx] = { ...cache[idx], ...record };
                    _setCache(coll, cache);
                }

                const queue = _getQueue();
                queue.push({ action: 'update', coll, id, data: record });
                _setQueue(queue);
                
                console.warn(`[DataHub] Offline: Update queued for ${coll}/${id}`);
                return;
            }

            console.log(`[DataHub] Updating (Validated) ${coll}/${id}`);
            const { error } = await supabase.from(coll).update(record).eq(pk, id).eq('user_id', user.id);
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
        if (!user) throw new Error("[DataHub] User not authenticated");

        try {
            const pk = SCHEMAS[coll]?.pk || 'id';

            // Handle Offline
            if (!navigator.onLine) {
                const cache = _getCache(coll);
                const filtered = cache.filter(i => i[pk] !== id);
                _setCache(coll, filtered);

                const queue = _getQueue();
                queue.push({ action: 'delete', coll, id });
                _setQueue(queue);
                
                console.warn(`[DataHub] Offline: Delete queued for ${coll}/${id}`);
                return;
            }

            console.log(`[DataHub] Deleting ${coll}/${id}`);
            const { error } = await supabase.from(coll).delete().eq(pk, id).eq('user_id', user.id);
            if (error) throw error;
        } catch (error) {
            console.error(`[DataHub] Delete error:`, error);
            throw error;
        }
    },

    /**
     * Pushes all pending offline changes to Supabase.
     */
    processSyncQueue: async () => {
        if (!navigator.onLine) return;
        const queue = _getQueue();
        if (queue.length === 0) return;

        console.log(`[DataHub] Processing ${queue.length} queued items...`);
        const remaining = [];

        for (const item of queue) {
            try {
                const pk = SCHEMAS[item.coll]?.pk || 'id';
                if (item.action === 'add') {
                    await supabase.from(item.coll).insert(item.data);
                } else if (item.action === 'update') {
                    await supabase.from(item.coll).update(item.data).eq(pk, item.id);
                } else if (item.action === 'delete') {
                    await supabase.from(item.coll).delete().eq(pk, item.id);
                }
            } catch (err) {
                console.error(`[DataHub] Sync failed for item:`, item, err);
                remaining.push(item);
            }
        }

        _setQueue(remaining);
        if (remaining.length === 0) console.log("[DataHub] Sync Queue cleared successfully.");
    }
};
