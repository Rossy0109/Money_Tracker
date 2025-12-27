import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import Transaction from './Transaction';

// ⚡ Bolt: Memoized TransactionList component to prevent unnecessary re-renders.
// This component will only re-render if its props (transactions, accounts, etc.) have changed.
const TransactionList = memo(({ transactions, accounts, onTransactionUpdated, onDeleteTransaction }) => {
  const { t } = useTranslation();

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
                <th>{t('amount')}</th>
                <th>{t('description')}</th>
                <th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <Transaction
                  key={t.id}
                  transaction={t}
                  accounts={accounts}
                  onTransactionUpdated={onTransactionUpdated}
                  onDeleteTransaction={onDeleteTransaction}
                />
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
});

export default TransactionList;
