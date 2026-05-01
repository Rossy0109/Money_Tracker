import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import API_URL from './config';

function TransactionForm({ onTransactionAdded, accounts, paymentMethods }) {
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState('');
  const [transactionType, setTransactionType] = useState('খরচ'); // 'আয়' or 'খরচ'
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Set default selected account
    const filtered = accounts.filter(acc => acc.account_type === transactionType);
    if (filtered.length > 0) {
      setSelectedAccountId(filtered[0].account_id);
    }
  }, [accounts, transactionType]);

  useEffect(() => {
    if (paymentMethods && paymentMethods.length > 0 && !selectedPaymentMethodId) {
      setSelectedPaymentMethodId(paymentMethods[0].method_id);
    }
  }, [paymentMethods, selectedPaymentMethodId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAccountId || !amount || !description || !selectedPaymentMethodId) {
      alert('Please fill in all fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        account_id: selectedAccountId,
        amount: parseFloat(amount),
        description,
        payment_method_id: selectedPaymentMethodId,
        transaction_date: new Date().toISOString().split('T')[0]
      };

      await axios.post(`${API_URL}/api/transactions`, payload, { withCredentials: true });
      
      onTransactionAdded(); // Trigger refresh in parent
      setDescription('');
      setAmount('');
    } catch (err) {
      console.error('Error adding transaction:', err);
      alert('Error adding transaction: ' + (err.response?.data?.error?.message || err.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredAccounts = accounts.filter(acc => acc.account_type === transactionType);

  return (
    <div className="card mb-4">
      <div className="card-body">
        <h5 className="card-title">{t('add_new_transaction')}</h5>
        <form onSubmit={handleSubmit}>
          <div className="row mb-3">
            <div className="col-md-4">
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
            <div className="col-md-4">
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
            <div className="col-md-4">
              <select
                className="form-select"
                value={selectedPaymentMethodId}
                onChange={(e) => setSelectedPaymentMethodId(parseInt(e.target.value))}
                required
              >
                <option value="">{t('payment_method')}</option>
                {paymentMethods && paymentMethods.map(method => (
                  <option key={method.method_id} value={method.method_id}>
                    {method.method_name}
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
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> : null}
            {t('add_transaction')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default TransactionForm;
