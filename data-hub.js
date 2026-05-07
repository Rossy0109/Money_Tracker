/**
 * DataHub: Supabase Implementation with Schema Guardian
 * Architecture: 10-Year Sustainability with strict structural integrity.
 */

// Initialize Supabase Client
const supabaseUrl = window.SUPABASE_URL || "__SUPABASE_URL__";
const supabaseKey = window.SUPABASE_KEY || "__SUPABASE_KEY__";
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
        defaults: { type: 'expense' }
    },
    transactions: {
        required: ['amount', 'date', 'type', 'categoryName'],
        allowed: ['amount', 'date', 'type', 'categoryName', 'method', 'description', 'categoryId', 'vatAmount', 'createdAt'],
        defaults: { method: 'Cash', description: '' }
    },
    budgets: {
        required: ['amount'],
        allowed: ['amount', 'categoryName'],
        defaults: {}
    },
    financial_goals: {
        required: ['name', 'target'],
        allowed: ['name', 'target'],
        defaults: {}
    },
    recurring_templates: {
        required: ['amount', 'categoryName', 'day'],
        allowed: ['amount', 'categoryName', 'day', 'createdAt'],
        defaults: {}
    },
    debts_registry: {
        required: ['name', 'balance'],
        allowed: ['name', 'balance', 'apr', 'minPayment'],
        defaults: { apr: 0, minPayment: 0 }
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
    sync: (coll, callback, orderField = null, userId) => {
        console.log(`[DataHub] Syncing ${coll} for user: ${userId}`);
        
        const fetchInitialData = async () => {
            let query = supabase.from(coll).select('*').eq('user_id', userId);
            if (orderField) {
                query = query.order(orderField, { ascending: false });
            }
            const { data, error } = await query;
            if (error) {
                console.error(`[DataHub] Initial fetch error for ${coll}:`, error);
            } else {
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
            }, (payload) => {
                console.log(`[DataHub] Change received for ${coll}:`, payload);
                fetchInitialData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    },

    /**
     * Adds a record with Schema Guard validation.
     */
    add: async (coll, data, userId) => {
        try {
            const validatedData = validate(coll, data);
            console.log(`[DataHub] Adding (Validated) to ${coll}`);
            
            const { data: result, error } = await supabase.from(coll).insert({
                ...validatedData,
                user_id: userId,
                _schema: SchemaVersion
            }).select().single();

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
    update: async (coll, id, data, userId) => {
        try {
            // For updates, we only validate what is provided
            const schema = SCHEMAS[coll];
            const cleaned = {};
            if (schema) {
                Object.keys(data).forEach(key => {
                    if (schema.allowed.includes(key)) cleaned[key] = data[key];
                });
            } else {
                Object.assign(cleaned, data);
            }

            console.log(`[DataHub] Updating (Validated) ${coll}/${id}`);
            const primaryKey = coll === 'accounts' ? 'account_id' : 
                               coll === 'transactions' ? 'transaction_id' : 
                               coll === 'payment_methods' ? 'method_id' : 'id';

            const { error } = await supabase.from(coll).update({
                ...cleaned,
                user_id: userId,
                _schema: SchemaVersion
            }).eq(primaryKey, id);

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
        try {
            console.log(`[DataHub] Deleting ${coll}/${id}`);
            const primaryKey = coll === 'accounts' ? 'account_id' : 
                               coll === 'transactions' ? 'transaction_id' : 
                               coll === 'payment_methods' ? 'method_id' : 'id';

            const { error } = await supabase.from(coll).delete().eq(primaryKey, id);
            if (error) throw error;
        } catch (error) {
            console.error(`[DataHub] Delete error:`, error);
            throw error;
        }
    }
};
