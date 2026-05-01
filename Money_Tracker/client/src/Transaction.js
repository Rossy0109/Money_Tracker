import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from './supabase';

const Transaction = ({ transaction, accounts, paymentMethods, onTransactionUpdated, onDeleteTransaction }) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTransaction, setEditedTransaction] = useState({ ...transaction });

  const handleUpdate = async () => {
    const { error } = await supabase
      .from('transactions')
      .update({
        transaction_date: editedTransaction.transaction_date,
        account_id: editedTransaction.account_id,
        payment_method_id: editedTransaction.payment_method_id,
        amount: editedTransaction.amount,
        description: editedTransaction.description
      })
      .eq('transaction_id', transaction.id);

    if (error) {
      console.error('Error updating transaction:', error);
      alert('Error updating transaction');
    } else {
      onTransactionUpdated(editedTransaction);
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    onDeleteTransaction(transaction.id);
  };

  const handleAccountChange = (e) => {
    const selectedAccount = accounts.find(a => a.account_id === parseInt(e.target.value));
    setEditedTransaction({ ...editedTransaction, account_id: selectedAccount.account_id, account_name: selectedAccount.account_name, account_type: selectedAccount.account_type });
  }

  const handlePaymentMethodChange = (e) => {
    const selectedMethod = paymentMethods.find(m => m.method_id === parseInt(e.target.value));
    setEditedTransaction({ ...editedTransaction, payment_method_id: selectedMethod.method_id, payment_method: selectedMethod.method_name });
  }

  if (isEditing) {
    return (
      <tr>
        <td>
          <input
            type="date"
            className="form-control"
            value={editedTransaction.transaction_date}
            onChange={e => setEditedTransaction({ ...editedTransaction, transaction_date: e.target.value })}
          />
        </td>
        <td>
          <select
            className="form-control"
            value={editedTransaction.account_id}
            onChange={handleAccountChange}
          >
            {accounts.map(account => (
              <option key={account.account_id} value={account.account_id}>
                {account.account_name}
              </option>
            ))}
          </select>
        </td>
        <td>
          <select
            className="form-control"
            value={editedTransaction.payment_method_id}
            onChange={handlePaymentMethodChange}
          >
            {paymentMethods && paymentMethods.map(method => (
              <option key={method.method_id} value={method.method_id}>
                {method.method_name}
              </option>
            ))}
          </select>
        </td>
        <td>
          <input
            type="number"
            className="form-control"
            value={editedTransaction.amount}
            onChange={e => setEditedTransaction({ ...editedTransaction, amount: e.target.value })}
          />
        </td>
        <td>
          <input
            type="text"
            className="form-control"
            value={editedTransaction.description}
            onChange={e => setEditedTransaction({ ...editedTransaction, description: e.target.value })}
          />
        </td>
        <td>
          <button className="btn btn-success me-2" onClick={handleUpdate}>{t('save')}</button>
          <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>{t('cancel')}</button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{transaction.transaction_date}</td>
      <td>{transaction.account_name}</td>
      <td>{transaction.payment_method}</td>
      <td>{transaction.amount}</td>
      <td>{transaction.description}</td>
      <td>
        <button className="btn btn-primary me-2" onClick={() => setIsEditing(true)}>{t('edit')}</button>
        <button className="btn btn-danger" onClick={handleDelete}>{t('delete')}</button>
      </td>
    </tr>
  );
};

export default Transaction;
