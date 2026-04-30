import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import './App.css';
import Summary from './Summary';
import TransactionForm from './TransactionForm';
import TransactionList from './TransactionList';
import Login from './Login';
import API_URL from './config';

function App() {
  const { t, i18n } = useTranslation();
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState(null);

  // Setup Axios interceptor to catch 403 Forbidden (RLS violations)
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      err => {
        if (err.response && err.response.status === 403) {
          setError(t('permission_denied_rls'));
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, [t]);

  const fetchTransactions = useCallback(() => {
    axios.get(`${API_URL}/api/transactions`, { withCredentials: true })
      .then(response => {
        setTransactions(response.data);
      })
      .catch(error => {
        console.error('Error fetching transactions:', error);
      });
  }, []);

  const fetchAccounts = useCallback(() => {
    axios.get(`${API_URL}/api/accounts`, { withCredentials: true })
      .then(response => {
        setAccounts(response.data);
      })
      .catch(error => {
        console.error('Error fetching accounts:', error);
      });
  }, []);

  const fetchPaymentMethods = useCallback(() => {
    axios.get(`${API_URL}/api/payment_methods`, { withCredentials: true })
      .then(response => {
        setPaymentMethods(response.data);
      })
      .catch(error => {
        console.error('Error fetching payment methods:', error);
      });
  }, []);

  useEffect(() => {
    if (loggedIn) {
      fetchAccounts();
      fetchTransactions();
      fetchPaymentMethods();
    }
  }, [loggedIn, fetchAccounts, fetchTransactions, fetchPaymentMethods]);

  const handleTransactionAdded = (newTransaction) => {
    setTransactions(prevTransactions => [newTransaction, ...prevTransactions]);
  };

  const handleTransactionUpdated = (updatedTransaction) => {
    setTransactions(prevTransactions =>
      prevTransactions.map(t => (t.id === updatedTransaction.id ? updatedTransaction : t))
    );
  };

  const handleDeleteTransaction = (id) => {
    axios.delete(`${API_URL}/api/transactions/${id}`, { withCredentials: true })
      .then(() => {
        setTransactions(prevTransactions => prevTransactions.filter(t => t.id !== id));
      })
      .catch(error => {
        console.error('Error deleting transaction:', error);
      });
  };

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  const handleLogin = () => {
    setLoggedIn(true);
  };

  const handleLogout = () => {
    setLoggedIn(false);
  };

  if (!loggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="container mt-5">
      <div className="d-flex justify-content-end mb-3">
        <button className="btn btn-secondary me-2" onClick={() => changeLanguage('en')}>English</button>
        <button className="btn btn-secondary me-2" onClick={() => changeLanguage('bn')}>বাংলা</button>
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
    </div>
  );
}

export default App;
