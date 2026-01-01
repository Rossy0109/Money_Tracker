import React, { useState } from 'react';
import axios from 'axios';

// The Transaction component is wrapped in React.memo to prevent unnecessary re-renders.
// This is a performance optimization that can significantly speed up the application
// when there are a large number of transactions.
const Transaction = ({ transaction, accounts, onTransactionUpdated, onDeleteTransaction }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTransaction, setEditedTransaction] = useState({ ...transaction });

  const handleUpdate = () => {
    axios.put(`http://localhost:5000/api/transactions/${transaction.id}`, editedTransaction, { withCredentials: true })
      .then(() => {
        onTransactionUpdated(editedTransaction);
        setIsEditing(false);
      })
      .catch(error => {
        console.error('Error updating transaction:', error);
      });
  };

  const handleDelete = () => {
    onDeleteTransaction(transaction.id);
  };

  const handleAccountChange = (e) => {
    const selectedAccount = accounts.find(a => a.account_id === parseInt(e.target.value));
    setEditedTransaction({ ...editedTransaction, account_id: selectedAccount.account_id, account_name: selectedAccount.account_name, account_type: selectedAccount.account_type });
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
          <button className="btn btn-success me-2" onClick={handleUpdate}>Save</button>
          <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>Cancel</button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{transaction.transaction_date}</td>
      <td>{transaction.account_name}</td>
      <td>{transaction.amount}</td>
      <td>{transaction.description}</td>
      <td>
        <button className="btn btn-primary me-2" onClick={() => setIsEditing(true)}>Edit</button>
        <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
      </td>
    </tr>
  );
};

export default React.memo(Transaction);
