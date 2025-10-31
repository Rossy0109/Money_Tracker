
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import './App.css';
import Summary from './Summary';
import TransactionForm from './TransactionForm';
import TransactionList from './TransactionList';

function App() {
  const { t, i18n } = useTranslation();
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);

  const fetchTransactions = useCallback(() => {
    axios.get('http://localhost:5000/api/transactions')
      .then(response => {
        setTransactions(response.data);
      })
      .catch(error => {
        console.error('Error fetching transactions:', error);
      });
  }, []);

  const fetchAccounts = useCallback(() => {
    axios.get('http://localhost:5000/api/accounts')
      .then(response => {
        setAccounts(response.data);
      })
      .catch(error => {
        console.error('Error fetching accounts:', error);
      });
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchTransactions();
  }, [fetchAccounts, fetchTransactions]);

  const handleTransactionAdded = () => {
    fetchTransactions(); // Re-fetch all transactions to update the list
  };

  const handleDeleteTransaction = (id) => {
    axios.delete(`http://localhost:5000/api/transactions/${id}`)
      .then(() => {
        fetchTransactions(); // Re-fetch transactions after deletion
      })
      .catch(error => {
        console.error('Error deleting transaction:', error);
      });
  };

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="container mt-5">
      <div className="d-flex justify-content-end mb-3">
        <button className="btn btn-secondary me-2" onClick={() => changeLanguage('en')}>English</button>
        <button className="btn btn-secondary" onClick={() => changeLanguage('bn')}>বাংলা</button>
      </div>
      <h1 className="text-center mb-4">{t('title')}</h1>
      <Summary transactions={transactions} />
      <TransactionForm onTransactionAdded={handleTransactionAdded} accounts={accounts} />
      <TransactionList transactions={transactions} accounts={accounts} onDeleteTransaction={handleDeleteTransaction} />
    </div>
  );
}

export default App;
