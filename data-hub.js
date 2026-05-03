// --- DataHub: Vendor Agnostic Data Interface ---
// This module provides a clean abstraction layer to ensure the application 
// remains decoupled from any specific database technology (e.g., Firebase).

import { db } from './firebase-config.js';
import { 
    collection, addDoc, onSnapshot, query, doc, 
    deleteDoc, setDoc, Timestamp, where, orderBy 
} from "firebase/firestore";

const SchemaVersion = "1.0.0";

export const DataHub = {
    /**
     * Synchronizes a collection in real-time.
     * @param {string} coll - The collection name.
     * @param {Function} callback - Function called with data snapshots.
     * @param {string|null} orderField - Optional field to order results by.
     * @param {string} userId - Current user's UID.
     */
    sync: (coll, callback, orderField = null, userId) => {
        let q = collection(db, coll);
        if (orderField) {
            q = query(q, where('userId', '==', userId), orderBy(orderField, "desc"));
        } else {
            q = query(q, where('userId', '==', userId));
        }
        
        return onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            callback(data);
        });
    },

    /**
     * Adds a record to the data store.
     */
    add: async (coll, data, userId) => {
        return await addDoc(collection(db, coll), { 
            ...data, 
            userId, 
            _schema: SchemaVersion,
            _updatedAt: Timestamp.now() 
        });
    },

    /**
     * Updates an existing record.
     */
    update: async (coll, id, data, userId) => {
        return await setDoc(doc(db, coll, id), { 
            ...data, 
            userId,
            _schema: SchemaVersion,
            _updatedAt: Timestamp.now() 
        }, { merge: true });
    },

    /**
     * Deletes a record.
     */
    delete: async (coll, id) => {
        return await deleteDoc(doc(db, coll, id));
    }
};
