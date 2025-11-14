import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import './App.css';
import Summary from './Summary';
import TransactionForm from './TransactionForm';
import TransactionList from './TransactionList';
import Login from './Login';

function App() {
  const { t, i18n } = useTranslation();
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loggedIn, setLoggedIn] = useState(false);

  const fetchTransactions = useCallback(() => {
    axios.get('http://localhost:5000/api/transactions', { withCredentials: true })
      .then(response => {
        setTransactions(response.data);
      })
      .catch(error => {
        console.error('Error fetching transactions:', error);
      });
  }, []);

  const fetchAccounts = useCallback(() => {
    axios.get('http://localhost:5000/api/accounts', { withCredentials: true })
      .then(response => {
        setAccounts(response.data);
      })
      .catch(error => {
        console.error('Error fetching accounts:', error);
      });
  }, []);

  useEffect(() => {
    if (loggedIn) {
      fetchAccounts();
      fetchTransactions();
    }
  }, [loggedIn, fetchAccounts, fetchTransactions]);

  const handleTransactionAdded = (newTransaction) => {
    setTransactions(prevTransactions => [newTransaction, ...prevTransactions]);
  };

  const handleTransactionUpdated = (updatedTransaction) => {
    setTransactions(prevTransactions =>
      prevTransactions.map(t => (t.id === updatedTransaction.id ? updatedTransaction : t))
    );
  };

  const handleDeleteTransaction = (id) => {
    axios.delete(`http://localhost:5000/api/transactions/${id}`, { withCredentials: true })
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
      <Summary transactions={transactions} />
      <TransactionForm onTransactionAdded={handleTransactionAdded} accounts={accounts} />
      <TransactionList
        transactions={transactions}
        accounts={accounts}
        onTransactionUpdated={handleTransactionUpdated}
        onDeleteTransaction={handleDeleteTransaction}
      />
    </div>
  );
}

export default App;
