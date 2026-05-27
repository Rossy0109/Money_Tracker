'use client';
/**
 * hooks/useAppInit.js
 * Centralized initialization logic with robust error handling.
 * Fixes Audit Issue #10.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { DataHub } from '@/lib/data-hub';

export function useAppInit() {
    const { user } = useAuth();
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cleanup = () => {};

        async function initialize() {
            if (!user) return;
            
            try {
                // Set DataHub user context
                DataHub.setUser(user.id);
                
                // Attempt to sync any pending offline changes
                await DataHub.syncQueue();

                // Setup online listener for future syncs
                const handleOnline = () => {
                    console.log("[AppInit] App is back online. Syncing queue...");
                    DataHub.syncQueue();
                };
                window.addEventListener('online', handleOnline);
                cleanup = () => window.removeEventListener('online', handleOnline);
                
                setIsReady(true);
            } catch (err) {
                console.error("[AppInit] Critical failure:", err);
                setError(err);
            }
        }

        initialize();
        return () => cleanup();
    }, [user]);

    return { isReady, error };
}
