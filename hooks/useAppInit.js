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
        async function initialize() {
            if (!user) return;
            
            try {
                // Set DataHub user context
                DataHub.setUser(user.uid);
                
                // Perform any additional startup checks here (e.g. connectivity, migration check)
                
                setIsReady(true);
            } catch (err) {
                console.error("[AppInit] Critical failure:", err);
                setError(err);
            }
        }

        initialize();
    }, [user]);

    return { isReady, error };
}
