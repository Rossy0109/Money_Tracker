
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Summary component that calculates daily and weekly financial statistics locally
 * from the transactions prop. This optimization eliminates redundant API calls
 * to /api/summary/daily and /api/summary/weekly, reducing initial load time
 * and ensuring real-time updates when transactions change.
 */
function Summary({ transactions = [] }) {
  const { t } = useTranslation();

  const { dailySummary, weeklyExpense } = useMemo(() => {
    const now = new Date();
    // Use local today's date in YYYY-MM-DD format, accounting for timezone offset
    const localToday = new Date(now.getTime() - (now.getTimezoneOffset() * 60 * 1000)).toISOString().split('T')[0];

    // Weekly calculation (starting from Monday)
    const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0, Sunday = 6
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    const startOfWeekStr = new Date(startOfWeek.getTime() - (startOfWeek.getTimezoneOffset() * 60 * 1000)).toISOString().split('T')[0];

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    const endOfWeekStr = new Date(endOfWeek.getTime() - (endOfWeek.getTimezoneOffset() * 60 * 1000)).toISOString().split('T')[0];

    let income = 0;
    let expense = 0;
    let weeklyExp = 0;

    transactions.forEach(transaction => {
      // Daily statistics
      if (transaction.transaction_date === localToday) {
        if (transaction.account_type === 'আয়') {
          income += transaction.amount;
        } else if (transaction.account_type === 'খরচ') {
          expense += transaction.amount;
        }
      }

      // Weekly statistics (only for expenses)
      if (transaction.transaction_date >= startOfWeekStr &&
          transaction.transaction_date <= endOfWeekStr &&
          transaction.account_type === 'খরচ') {
        weeklyExp += transaction.amount;
      }
    });

    return {
      dailySummary: {
        totalIncome: income,
        totalExpense: expense,
        balance: income - expense
      },
      weeklyExpense: weeklyExp
    };
  }, [transactions]);

  return (
    <div className="row mb-4">
      <div className="col-md-4">
        <div className="card">
          <div className="card-body">
            <h5 className="card-title">{t('total_income')}</h5>
            <p className="card-text text-success">${dailySummary.totalIncome.toFixed(2)}</p>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card">
          <div className="card-body">
            <h5 className="card-title">{t('total_expense')}</h5>
            <p className="card-text text-danger">${dailySummary.totalExpense.toFixed(2)}</p>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card">
          <div className="card-body">
            <h5 className="card-title">{t('balance')}</h5>
            <p className="card-text">${dailySummary.balance.toFixed(2)}</p>
          </div>
        </div>
      </div>
      <div className="col-12 mt-3">
        <div className="card">
          <div className="card-body">
            <h5 className="card-title">{t('weekly_expense')}</h5>
            <p className="card-text">${weeklyExpense.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Summary;
