
import React from 'react';
import { useTranslation } from 'react-i18next';

function TransactionList({ transactions, accounts, onDeleteTransaction }) {
  const { t } = useTranslation();

  const getAccountName = (accountId) => {
    const account = accounts.find(acc => acc.account_id === accountId);
    return account ? account.account_name : 'Unknown Account';
  };

  return (
    <div className="card">
      <div className="card-body">
        <h5 className="card-title">{t('transactions')}</h5>
        <div className="table-responsive">
          <table className="table table-striped table-hover">
            <thead>
              <tr>
                <th>{t('date')}</th>
                <th>{t('account')}</th>
                <th>{t('description')}</th>
                <th>{t('type')}</th>
                <th>{t('category')}</th>
                <th className="text-end">{t('amount')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id} className={t.account_type === 'আয়' ? 'table-success' : 'table-danger'}>
                  <td>{new Date(t.transaction_date).toLocaleDateString()}</td>
                  <td>{getAccountName(t.account_id)}</td>
                  <td>{t.description}</td>
                  <td>{t(t.account_type)}</td>
                  <td>{t(t.category)}</td>
                  <td className="text-end">${t.amount.toFixed(2)}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => onDeleteTransaction(t.id)}
                    >
                      {t('delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {transactions.length === 0 && (
          <p className="text-center text-muted mt-3">{t('no_transactions_yet')}</p>
        )}
      </div>
    </div>
  );
}

export default TransactionList;
