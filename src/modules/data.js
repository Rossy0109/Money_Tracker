import { supabaseClient } from './supabase.js';

export let allTransactions = [];

export async function fetchCategories(userId) {
    if (!userId) return [];
    const { data, error } = await supabaseClient.from('categories')
        .select('*')
        .eq('user_id', userId);
    if (error) throw error;
    return data || [];
}

export async function addCategory(categoryData) {
    const { data, error } = await supabaseClient.from('categories').insert([categoryData]);
    if (error) throw error;
    return data;
}

export async function deleteCategory(id) {
    const { error } = await supabaseClient.from('categories').delete().eq('id', id);
    if (error) throw error;
}

export async function fetchTransactions(userId) {
    if (!userId) return [];
    
    const { data: txs, error } = await supabaseClient.from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false });
    
    if (error) {
        console.error("Supabase Data Error:", error);
        throw error;
    }
    
    allTransactions = txs || [];
    return allTransactions;
}

export async function deleteTransaction(id) {
    const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
    if (error) throw error;
}

export async function addTransaction(transactionData) {
    const { data, error } = await supabaseClient.from('transactions').insert([transactionData]);
    if (error) throw error;
    return data;
}
