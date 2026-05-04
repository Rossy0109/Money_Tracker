// --- DataHub: Vendor Agnostic Data Interface ---
// This module provides a clean abstraction layer to ensure the application 
// remains decoupled from any specific database technology (e.g., Firebase).

import { db } from './firebase-config.js';
import { 
    collection, addDoc, onSnapshot, query, doc, 
    deleteDoc, setDoc, Timestamp, where, orderBy 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const SchemaVersion = "1.0.0";

export const DataHub = {
    /**
     * Synchronizes a collection in real-time.
     */
    sync: (coll, callback, orderField = null, userId) => {
        console.log(`[DataHub] Syncing collection: ${coll} for user: ${userId}`);
        let q = collection(db, coll);
        if (orderField) {
            q = query(q, where('userId', '==', userId), orderBy(orderField, "desc"));
        } else {
            q = query(q, where('userId', '==', userId));
        }
        
        return onSnapshot(q, 
            (snap) => {
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                console.log(`[DataHub] Received ${data.length} items from ${coll}`);
                callback(data);
            },
            (error) => {
                console.error(`[DataHub] Sync error for ${coll}:`, error);
                // Trigger a global event or callback for the UI to show an error if needed
                window.dispatchEvent(new CustomEvent('data-sync-error', { detail: { coll, error } }));
            }
        );
    },

    /**
     * Adds a record to the data store.
     */
    add: async (coll, data, userId) => {
        try {
            console.log(`[DataHub] Adding to ${coll}:`, data);
            const docRef = await addDoc(collection(db, coll), { 
                ...data, 
                userId, 
                _schema: SchemaVersion,
                _updatedAt: Timestamp.now() 
            });
            console.log(`[DataHub] Added successfully to ${coll}, ID: ${docRef.id}`);
            return docRef;
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
            await setDoc(doc(db, coll, id), { 
                ...data, 
                userId,
                _schema: SchemaVersion,
                _updatedAt: Timestamp.now() 
            }, { merge: true });
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
            await deleteDoc(doc(db, coll, id));
            console.log(`[DataHub] Deleted successfully ${coll}/${id}`);
        } catch (error) {
            console.error(`[DataHub] Delete error for ${coll}/${id}:`, error);
            throw error;
        }
    }
};
