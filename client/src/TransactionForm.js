
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

function TransactionForm({ onTransactionAdded, accounts }) {
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [transactionType, setTransactionType] = useState('খরচ'); // 'আয়' or 'খরচ'

  useEffect(() => {
    // Set default selected account when accounts load or type changes
    const filteredAccounts = accounts.filter(acc => acc.account_type === transactionType);
    if (filteredAccounts.length > 0) {
      setSelectedAccountId(filteredAccounts[0].account_id);
    } else {
      setSelectedAccountId('');
    }
  }, [accounts, transactionType]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedAccountId || !amount || !description) {
      alert('Please fill in all fields.');
      return;
    }

    const selectedAccount = accounts.find(acc => acc.account_id === selectedAccountId);
    if (!selectedAccount) {
      alert('Selected account not found.');
      return;
    }

    const newTransaction = {
      account_id: selectedAccount.account_id,
      account_name: selectedAccount.account_name,
      amount: parseFloat(amount),
      description,
      account_type: selectedAccount.account_type, // Add account_type for filtering/display
      category: selectedAccount.category, // Add category for filtering/display
    };

    axios.post('http://localhost:5000/api/transactions', newTransaction)
      .then(response => {
        onTransactionAdded(response.data); // Pass the new transaction data
        setDescription('');
        setAmount('');
      })
      .catch(error => {
        console.error('Error adding transaction:', error);
      });
  };

  const filteredAccounts = accounts.filter(acc => acc.account_type === transactionType);

  return (
    <div className="card mb-4">
      <div className="card-body">
        <h5 className="card-title">{t('add_new_transaction')}</h5>
        <form onSubmit={handleSubmit}>
          <div className="row mb-3">
            <div className="col-md-6">
              <div className="form-check form-check-inline">
                <input
                  className="form-check-input"
                  type="radio"
                  name="transactionType"
                  id="incomeRadio"
                  value="আয়"
                  checked={transactionType === 'আয়'}
                  onChange={() => setTransactionType('আয়')}
                />
                <label className="form-check-label" htmlFor="incomeRadio">{t('deposit')}</label>
              </div>
              <div className="form-check form-check-inline">
                <input
                  className="form-check-input"
                  type="radio"
                  name="transactionType"
                  id="expenseRadio"
                  value="খরচ"
                  checked={transactionType === 'খরচ'}
                  onChange={() => setTransactionType('খরচ')}
                />
                <label className="form-check-label" htmlFor="expenseRadio">{t('expense')}</label>
              </div>
            </div>
            <div className="col-md-6">
              <select
                className="form-select"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(parseInt(e.target.value))}
                required
              >
                <option value="">{t('select_account')}</option>
                {filteredAccounts.map(account => (
                  <option key={account.account_id} value={account.account_id}>
                    {account.account_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="row">
            <div className="col-md-6 mb-3">
              <input
                type="text"
                className="form-control"
                placeholder={t('description')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
            <div className="col-md-6 mb-3">
              <input
                type="number"
                className="form-control"
                placeholder={t('amount')}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary">{t('add_transaction')}</button>
        </form>
      </div>
    </div>
  );
}

export default TransactionForm;
