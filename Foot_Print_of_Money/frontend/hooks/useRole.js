/**
 * hooks/useRole.js
 * Logic to check if user has specific access
 */
import { useAuth } from '@/context/AuthContext';

export function useRole() {
    const { profile } = useAuth();
    
    const role = profile?.role || 'VIEWER';
    
    return {
        role,
        isAdmin: role === 'ADMIN',
        isAccountant: role === 'ACCOUNTANT' || role === 'ADMIN',
        canManageFinancials: role === 'ADMIN' || role === 'ACCOUNTANT'
    };
}
