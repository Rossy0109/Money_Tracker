import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import './App.css';
import Summary from './Summary';
import TransactionForm from './TransactionForm';
import TransactionList from './TransactionList';
import Login from './Login';
import DataManagement from './DataManagement';
import API_URL from './config';

function App() {
  const { t, i18n } = useTranslation();
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loggedIn, setLoggedIn] = useState(localStorage.getItem('isLoggedIn') === 'true');
  const [error, setError] = useState(null);
  const [darkMode, setDarkMode] = useState(localStorage.getItem('darkMode') === 'true');

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const fetchTransactions = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/transactions`, { withCredentials: true });
      setTransactions(response.data);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      if (err.response?.status === 403) setError(t('permission_denied_rls'));
    }
  }, [t]);

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/accounts`, { withCredentials: true });
      setAccounts(response.data);
    } catch (err) {
      console.error('Error fetching accounts:', err);
    }
  }, []);

  const fetchPaymentMethods = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/payment_methods`, { withCredentials: true });
      setPaymentMethods(response.data);
    } catch (err) {
      console.error('Error fetching payment methods:', err);
    }
  }, []);

  useEffect(() => {
    if (loggedIn) {
      fetchAccounts();
      fetchTransactions();
      fetchPaymentMethods();
    }
  }, [loggedIn, fetchAccounts, fetchTransactions, fetchPaymentMethods]);

  const handleTransactionAdded = () => {
    fetchTransactions();
  };

  const handleTransactionUpdated = () => {
    fetchTransactions();
  };

  const handleDeleteTransaction = async (id) => {
    try {
      await axios.delete(`${API_URL}/api/transactions/${id}`, { withCredentials: true });
      setTransactions(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('Error deleting transaction:', err);
      alert('Failed to delete transaction');
    }
  };

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  const handleLogin = () => {
    setLoggedIn(true);
    localStorage.setItem('isLoggedIn', 'true');
  };

  const handleLogout = () => {
    setLoggedIn(false);
    localStorage.removeItem('isLoggedIn');
  };

  if (!loggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="container mt-5">
      <div className="d-flex justify-content-end mb-3 gap-2">
        <button 
          className={`btn ${darkMode ? 'btn-light' : 'btn-dark'}`} 
          onClick={() => setDarkMode(!darkMode)}
          title={t('toggle_dark_mode')}
        >
          <i className={`bi ${darkMode ? 'bi-sun' : 'bi-moon'}`}></i>
        </button>
        <button className="btn btn-secondary" onClick={() => changeLanguage('en')}>English</button>
        <button className="btn btn-secondary" onClick={() => changeLanguage('bn')}>বাংলা</button>
        <button className="btn btn-danger" onClick={handleLogout}>Logout</button>
      </div>
      <h1 className="text-center mb-4">{t('title')}</h1>
      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)} aria-label="Close"></button>
        </div>
      )}
      <Summary transactions={transactions} />
      <TransactionForm 
        onTransactionAdded={handleTransactionAdded} 
        accounts={accounts} 
        paymentMethods={paymentMethods} 
      />
      <TransactionList
        transactions={transactions}
        accounts={accounts}
        paymentMethods={paymentMethods}
        onTransactionUpdated={handleTransactionUpdated}
        onDeleteTransaction={handleDeleteTransaction}
      />
      <DataManagement 
        transactions={transactions} 
        accounts={accounts} 
        paymentMethods={paymentMethods} 
      />
    </div>
  );
}

export default App;
