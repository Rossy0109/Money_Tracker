import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * ⚡ Bolt Optimization:
 * Calculates daily and weekly summaries locally from the transactions prop.
 *
 * Benefits:
 * 1. Eliminates 2 redundant API calls (/api/summary/daily and /api/summary/weekly) on every mount.
 * 2. Provides instant updates to the summary when transactions are added or modified.
 * 3. Reduces server load and improves frontend responsiveness.
 */
function Summary({ transactions = [] }) {
  const { t } = useTranslation();

  const { dailySummary, weeklyExpense } = useMemo(() => {
    const now = new Date();
    // Get local date string in YYYY-MM-DD format, matching SQLite date storage.
    // Adjusting for timezone offset ensures we get the correct local date.
    const todayStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60 * 1000)).toISOString().split('T')[0];

    // Weekly range: Monday to Sunday (matching server-side logic)
    const day = (now.getDay() + 6) % 7; // Sunday(0) becomes 6, Monday(1) becomes 0.
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - day);
    const startOfWeekStr = new Date(startOfWeek.getTime() - (startOfWeek.getTimezoneOffset() * 60 * 1000)).toISOString().split('T')[0];

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    const endOfWeekStr = new Date(endOfWeek.getTime() - (endOfWeek.getTimezoneOffset() * 60 * 1000)).toISOString().split('T')[0];

    let income = 0;
    let expense = 0;
    let weeklyEx = 0;

    transactions.forEach(transaction => {
      const amount = parseFloat(transaction.amount) || 0;
      // Daily summary calculation
      if (transaction.transaction_date === todayStr) {
        if (transaction.account_type === 'আয়') {
          income += amount;
        } else if (transaction.account_type === 'খরচ') {
          expense += amount;
        }
      }
      // Weekly expense calculation
      if (transaction.account_type === 'খরচ' &&
          transaction.transaction_date >= startOfWeekStr &&
          transaction.transaction_date <= endOfWeekStr) {
        weeklyEx += amount;
      }
    });

    return {
      dailySummary: {
        totalIncome: income,
        totalExpense: expense,
        balance: income - expense
      },
      weeklyExpense: weeklyEx
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

export default React.memo(Summary);
