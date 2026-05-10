/**
 * DataHub: Supabase Implementation (PostgreSQL)
 * This module provides a clean abstraction layer, now pivoting from Firestore to Supabase.
 * Architecture: 10-Year Sustainability with Supabase as primary DB.
 */

// Helper to robustly fetch environment variables
const _getEnv = (key) => {
    try { if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key]; } catch (e) {}
    try { if (typeof window !== 'undefined' && window.__ENV && window.__ENV[key]) return window.__ENV[key]; } catch (e) {}
    return `__${key}__`;
};

// Initialize Supabase Client
const supabaseUrl = _getEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = _getEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || _getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const { createClient } = window.supabase;
const supabase = createClient(supabaseUrl, supabaseKey);

const SchemaVersion = "1.0.0";

export const DataHub = {
    /**
     * Synchronizes a collection (table) in real-time.
     */
    sync: (coll, callback, orderField = null, userId) => {
        console.log(`[DataHub] Syncing table: ${coll} for user: ${userId}`);
        
        // Initial Fetch
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

        // Subscribe to real-time changes
        const channel = supabase
            .channel(`public:${coll}:user_${userId}`)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: coll,
                filter: `user_id=eq.${userId}`
            }, (payload) => {
                console.log(`[DataHub] Change received for ${coll}:`, payload);
                fetchInitialData(); // Refetch for consistency
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    },

    /**
     * Adds a record to the data store.
     */
    add: async (coll, data, userId) => {
        try {
            console.log(`[DataHub] Adding to ${coll}:`, data);
            const { data: result, error } = await supabase.from(coll).insert({
                ...data,
                user_id: userId,
                _schema: SchemaVersion
            }).select().single();

            if (error) throw error;
            console.log(`[DataHub] Added successfully to ${coll}`);
            return result;
        } catch (error) {
            console.error(`[DataHub] Add error for ${coll}:`, error);
            throw error;
        }
    },

    /**
     * Updates an existing record.
     */
    update: async (coll, id, data, userId) => {
        try {
            console.log(`[DataHub] Updating ${coll}/${id}:`, data);
            const primaryKey = coll === 'accounts' ? 'account_id' : 
                               coll === 'transactions' ? 'transaction_id' : 
                               coll === 'payment_methods' ? 'method_id' : 'id';

            const { error } = await supabase.from(coll).update({
                ...data,
                user_id: userId,
                _schema: SchemaVersion
            }).eq(primaryKey, id);

            if (error) throw error;
            console.log(`[DataHub] Updated successfully ${coll}/${id}`);
        } catch (error) {
            console.error(`[DataHub] Update error for ${coll}/${id}:`, error);
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
            console.log(`[DataHub] Deleted successfully ${coll}/${id}`);
        } catch (error) {
            console.error(`[DataHub] Delete error for ${coll}/${id}:`, error);
            throw error;
        }
    }
};
