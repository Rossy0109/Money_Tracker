
import React, { useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Summary component that calculates daily and weekly financial statistics.
 * ⚡ Optimization: Calculates data locally from the transactions prop instead of making redundant API calls.
 */
const Summary = memo(({ transactions }) => {
  const { t } = useTranslation();

  const { totalIncome, totalExpense, balance, weeklyExpense } = useMemo(() => {
    const now = new Date();
    // Use ISO string and adjust for local timezone offset to get local YYYY-MM-DD
    const offset = now.getTimezoneOffset();
    const localNow = new Date(now.getTime() - (offset * 60 * 1000));
    const today = localNow.toISOString().split('T')[0];

    // Weekly range calculation (Monday to Sunday)
    const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0, Sunday = 6
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const startOfWeekLocal = new Date(startOfWeek.getTime() - (offset * 60 * 1000));
    const endOfWeekLocal = new Date(endOfWeek.getTime() - (offset * 60 * 1000));
    const startOfWeekStr = startOfWeekLocal.toISOString().split('T')[0];
    const endOfWeekStr = endOfWeekLocal.toISOString().split('T')[0];

    let incomeToday = 0;
    let expenseToday = 0;
    let expenseWeekly = 0;

    transactions.forEach(t => {
      const amount = parseFloat(t.amount) || 0;
      // Match account types as defined in the database/backend
      const IS_INCOME = t.account_type === 'আয়';
      const IS_EXPENSE = t.account_type === 'খরচ';

      if (t.transaction_date === today) {
        if (IS_INCOME) {
          incomeToday += amount;
        } else if (IS_EXPENSE) {
          expenseToday += amount;
        }
      }

      if (t.transaction_date >= startOfWeekStr && t.transaction_date <= endOfWeekStr) {
        if (IS_EXPENSE) {
          expenseWeekly += amount;
        }
      }
    });

    return {
      totalIncome: incomeToday,
      totalExpense: expenseToday,
      balance: incomeToday - expenseToday,
      weeklyExpense: expenseWeekly
    };
  }, [transactions]);

  return (
    <div className="row mb-4">
      <div className="col-md-4">
        <div className="card">
          <div className="card-body">
            <h5 className="card-title">{t('total_income')}</h5>
            <p className="card-text text-success">${totalIncome.toFixed(2)}</p>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card">
          <div className="card-body">
            <h5 className="card-title">{t('total_expense')}</h5>
            <p className="card-text text-danger">${totalExpense.toFixed(2)}</p>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card">
          <div className="card-body">
            <h5 className="card-title">{t('balance')}</h5>
            <p className="card-text">${balance.toFixed(2)}</p>
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
});

export default Summary;
