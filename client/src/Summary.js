
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Summary component calculates and displays daily and weekly financial statistics.
 *
 * PERFORMANCE OPTIMIZATION:
 * Instead of making separate API calls to /api/summary/daily and /api/summary/weekly,
 * this component now calculates these statistics locally from the 'transactions' prop.
 *
 * Benefits:
 * 1. Reduces network requests by 2 on every mount/refresh.
 * 2. Ensures instant updates when transactions are added, updated, or deleted.
 * 3. Reduces backend load and improves perceived performance.
 *
 * Note: While this involves an O(N) loop on the client, N is typically small enough
 * in a personal tracker that local calculation is significantly faster than a network round-trip.
 */
function Summary({ transactions = [] }) {
  const { t } = useTranslation();

  const { dailySummary, weeklyExpense } = useMemo(() => {
    const now = new Date();

    // Timezone-safe date string (YYYY-MM-DD) to match SQLite format
    const todayStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60 * 1000)).toISOString().split('T')[0];

    // Weekly logic: Monday to Sunday (matching server.py implementation)
    const dayOfWeek = now.getDay(); // Sunday is 0, Monday is 1...
    const diffToMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - diffToMonday);
    const startOfWeekStr = new Date(startOfWeek.getTime() - (startOfWeek.getTimezoneOffset() * 60 * 1000)).toISOString().split('T')[0];

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    const endOfWeekStr = new Date(endOfWeek.getTime() - (endOfWeek.getTimezoneOffset() * 60 * 1000)).toISOString().split('T')[0];

    let totalIncome = 0;
    let totalExpense = 0;
    let weeklyExpense = 0;

    transactions.forEach(tx => {
      // Skip deleted transactions (though they should already be filtered by the API)
      if (tx.is_deleted) return;

      // Daily summary (Income/Expense for today)
      if (tx.transaction_date === todayStr) {
        if (tx.account_type === 'আয়') {
          totalIncome += tx.amount;
        } else if (tx.account_type === 'খরচ') {
          totalExpense += tx.amount;
        }
      }

      // Weekly expense (Total expense from Monday to Sunday of current week)
      if (tx.transaction_date >= startOfWeekStr && tx.transaction_date <= endOfWeekStr) {
        if (tx.account_type === 'খরচ') {
          weeklyExpense += tx.amount;
        }
      }
    });

    return {
      dailySummary: {
        totalIncome,
        totalExpense,
        balance: totalIncome - totalExpense
      },
      weeklyExpense
    };
  }, [transactions]);

  return (
    <div className="row mb-4">
      <div className="col-md-4">
        <div className="card shadow-sm">
          <div className="card-body">
            <h5 className="card-title">{t('total_income')}</h5>
            <p className="card-text text-success h4">${dailySummary.totalIncome.toFixed(2)}</p>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card shadow-sm">
          <div className="card-body">
            <h5 className="card-title">{t('total_expense')}</h5>
            <p className="card-text text-danger h4">${dailySummary.totalExpense.toFixed(2)}</p>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card shadow-sm">
          <div className="card-body">
            <h5 className="card-title">{t('balance')}</h5>
            <p className="card-text h4">${dailySummary.balance.toFixed(2)}</p>
          </div>
        </div>
      </div>
      <div className="col-12 mt-3">
        <div className="card shadow-sm border-primary">
          <div className="card-body">
            <h5 className="card-title text-primary">{t('weekly_expense')}</h5>
            <p className="card-text h3">${weeklyExpense.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Summary;
