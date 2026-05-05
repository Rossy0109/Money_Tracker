import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from './supabase';

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
    
    // Strong Validation
    const parsedAmount = parseFloat(amount);
    if (!selectedAccountId) {
      alert('Please select an account/category.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Please enter a valid positive amount.');
      return;
    }
    if (!description.trim()) {
      alert('Please enter a description.');
      return;
    }
    if (!selectedPaymentMethodId) {
      alert('Please select a payment method.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('transactions')
        .insert({
          account_id: selectedAccountId,
          amount: parsedAmount,
          description: description.trim(),
          payment_method_id: selectedPaymentMethodId,
          transaction_date: new Date().toISOString().split('T')[0],
          transaction_time: new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5)
        });

      if (error) {
        if (error.code === '42501') throw new Error('Permission denied. Please check your login status.');
        throw error;
      }
      
      onTransactionAdded(); // Trigger refresh in parent
      setDescription('');
      setAmount('');
      alert('Transaction added successfully!');
    } catch (err) {
      console.error('Error adding transaction:', err);
      alert('Error: ' + (err.message || 'Failed to add transaction. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredAccounts = accounts.filter(acc => acc.account_type === transactionType);

  return (
    <div className="card mb-4 shadow-sm">
      <div className="card-body">
        <h5 className="card-title fw-bold">{t('add_new_transaction')}</h5>
        <form onSubmit={handleSubmit}>
          <div className="row mb-3">
            <div className="col-md-4 d-flex align-items-center">
              <div className="btn-group w-100" role="group">
                <input
                  type="radio"
                  className="btn-check"
                  name="transactionType"
                  id="incomeRadio"
                  autoComplete="off"
                  checked={transactionType === 'আয়'}
                  onChange={() => setTransactionType('আয়')}
                />
                <label className="btn btn-outline-success" htmlFor="incomeRadio">{t('deposit')}</label>

                <input
                  type="radio"
                  className="btn-check"
                  name="transactionType"
                  id="expenseRadio"
                  autoComplete="off"
                  checked={transactionType === 'খরচ'}
                  onChange={() => setTransactionType('খরচ')}
                />
                <label className="btn btn-outline-danger" htmlFor="expenseRadio">{t('expense')}</label>
              </div>
            </div>
            <div className="col-md-4">
              <label className="form-label small text-muted">{t('select_account')}</label>
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
              <label className="form-label small text-muted">{t('payment_method')}</label>
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
              <div className="input-group">
                <span className="input-group-text">৳</span>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  placeholder={t('amount')}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>
          <button type="submit" className="btn btn-primary px-4" disabled={isSubmitting}>
            {isSubmitting ? <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> : null}
            {t('add_transaction')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default TransactionForm;
