import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from './supabase';
import './App.css';
import Summary from './Summary';
import TransactionForm from './TransactionForm';
import TransactionList from './TransactionList';
import Login from './Login';
import DataManagement from './DataManagement';

function App() {
  const { t, i18n } = useTranslation();
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(localStorage.getItem('darkMode') === 'true');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const seedDefaultData = async () => {
    console.log('Seeding default data for new user...');
    const defaultAccounts = [
      { account_name: 'ঠিকাদারী আয়', account_type: 'আয়', category: 'ব্যবসায়িক', icon: '💼', color: '#4CAF50' },
      { account_name: 'অন্যান্য আয়', account_type: 'আয়', category: 'অন্যান্য', icon: '💰', color: '#8BC34A' },
      { account_name: 'দৈনিক বাজার', account_type: 'খরচ', category: 'পারিবারিক', icon: '🛒', color: '#FF5722' },
      { account_name: 'যাতায়াত খরচ', account_type: 'খরচ', category: 'নিয়মিত', icon: '🚗', color: '#3F51B5' },
      { account_name: 'নাস্তা/আপ্যায়ন', account_type: 'খরচ', category: 'নিয়মিত', icon: '☕', color: '#FF9800' }
    ];

    const defaultMethods = [
      { method_name: 'নগদ টাকা', method_type: 'নগদ', balance: 0, icon: '💵' },
      { method_name: 'bKash', method_type: 'মোবাইল ব্যাংকিং', balance: 0, icon: '📱' }
    ];

    await supabase.from('accounts').insert(defaultAccounts);
    await supabase.from('payment_methods').insert(defaultMethods);
  };

  const fetchTransactions = useCallback(async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, accounts(account_name, account_type, category), payment_methods(method_name)')
      .eq('is_deleted', false)
      .order('transaction_date', { ascending: false })
      .order('transaction_time', { ascending: false });

    if (error) {
      console.error('Error fetching transactions:', error);
    } else {
      setTransactions(data.map(tx => ({
        ...tx,
        id: tx.transaction_id,
        account_name: tx.accounts?.account_name || 'N/A',
        account_type: tx.accounts?.account_type || 'N/A',
        category: tx.accounts?.category || 'N/A',
        payment_method: tx.payment_methods?.method_name
      })));
    }
  }, []);

  const fetchData = useCallback(async () => {
    const [accRes, payRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('is_active', true),
      supabase.from('payment_methods').select('*').eq('is_active', true)
    ]);

    if (accRes.data && accRes.data.length === 0) {
      await seedDefaultData();
      // Refetch after seeding
      const [accRes2, payRes2] = await Promise.all([
        supabase.from('accounts').select('*').eq('is_active', true),
        supabase.from('payment_methods').select('*').eq('is_active', true)
      ]);
      setAccounts(accRes2.data || []);
      setPaymentMethods(payRes2.data || []);
    } else {
      setAccounts(accRes.data || []);
      setPaymentMethods(payRes.data || []);
    }
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session, fetchData]);

  const handleTransactionAdded = () => {
    fetchTransactions();
    fetchData(); // Refresh balances
  };

  const handleTransactionUpdated = () => {
    fetchTransactions();
    fetchData(); // Refresh balances
  };

  const handleDeleteTransaction = async (id) => {
    const { error } = await supabase
      .from('transactions')
      .update({ is_deleted: true })
      .eq('transaction_id', id);

    if (error) {
      console.error('Error deleting transaction:', error);
    } else {
      handleTransactionUpdated();
    }
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border text-primary"></div></div>;

  if (!session) {
    return <Login onLogin={() => {}} />;
  }

  return (
    <div className="container mt-5 pb-5">
      <div className="d-flex justify-content-end mb-3 gap-2">
        <button 
          className={`btn ${darkMode ? 'btn-light' : 'btn-dark'}`} 
          onClick={() => setDarkMode(!darkMode)}
        >
          <i className={`bi ${darkMode ? 'bi-sun' : 'bi-moon'}`}></i>
        </button>
        <button className="btn btn-outline-secondary" onClick={() => i18n.changeLanguage('en')}>EN</button>
        <button className="btn btn-outline-secondary" onClick={() => i18n.changeLanguage('bn')}>বাংলা</button>
        <button className="btn btn-danger" onClick={() => supabase.auth.signOut()}>Logout</button>
      </div>
      
      <h1 className="text-center mb-4 fw-bold text-primary">{t('title')}</h1>
      
      {error && (
        <div className="alert alert-danger alert-dismissible fade show shadow-sm" role="alert">
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)}></button>
        </div>
      )}

      <Summary transactions={transactions} />
      
      <div className="row">
        <div className="col-lg-12">
          <TransactionForm 
            onTransactionAdded={handleTransactionAdded} 
            accounts={accounts} 
            paymentMethods={paymentMethods} 
          />
        </div>
        <div className="col-lg-12">
          <TransactionList
            transactions={transactions}
            accounts={accounts}
            paymentMethods={paymentMethods}
            onTransactionUpdated={handleTransactionUpdated}
            onDeleteTransaction={handleDeleteTransaction}
          />
        </div>
      </div>

      <div className="mt-5 pt-4 border-top">
        <DataManagement 
          transactions={transactions} 
          accounts={accounts} 
          paymentMethods={paymentMethods}
          onDataChange={fetchData}
        />

      </div>
    </div>
  );
}

export default App;
