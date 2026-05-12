/**
 * lib/constants.js
 * Centralized application constants.
 */

export const APP_NAME = "Foot Print of Money";
export const APP_DESCRIPTION = "আপনার নিরাপদ আর্থিক বন্ধু";
export const SCHEMA_VERSION = "2.0.0";

export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "kamrul01@gmail.com";

export const ROLES = {
    ADMIN: 'ADMIN',
    ACCOUNTANT: 'ACCOUNTANT',
    VIEWER: 'VIEWER'
};

export const COLORS = {
    income: '#10b981', // green-500
    expense: '#ef4444', // red-500
    primary: '#2563eb', // blue-600
    secondary: '#6366f1', // indigo-500
    accent: '#f59e0b', // amber-500
    chart: ['#2563eb', '#10b981', '#ef4444', '#f59e0b', '#6366f1', '#8b5cf6']
};

export const CURRENCIES = {
    BDT: { symbol: '৳', label: 'BDT' },
    USD: { symbol: '$', label: 'USD' }
};
