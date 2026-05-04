import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { supabase } from './supabase';

ChartJS.register(ArcElement, Tooltip, Legend);

function Summary({ transactions }) {
  const { t } = useTranslation();
  const [dailySummary, setDailySummary] = useState({ totalIncome: 0, totalExpense: 0, balance: 0 });
  const [weeklyExpense, setWeeklyExpense] = useState(0);

  const incomeBreakdown = transactions
    .filter(t => t.account_type === 'আয়' && !t.is_deleted)
    .reduce((acc, t) => {
      const cat = t.category || 'Other';
      acc[cat] = (acc[cat] || 0) + parseFloat(t.amount);
      return acc;
    }, {});

  const expenseBreakdown = transactions
    .filter(t => t.account_type === 'খরচ' && !t.is_deleted)
    .reduce((acc, t) => {
      const cat = t.category || 'Other';
      acc[cat] = (acc[cat] || 0) + parseFloat(t.amount);
      return acc;
    }, {});

  const totalIncomeForBreakdown = Object.values(incomeBreakdown).reduce((sum, val) => sum + val, 0);
  const totalExpenseForBreakdown = Object.values(expenseBreakdown).reduce((sum, val) => sum + val, 0);

  const pieData = {
    labels: Object.keys(expenseBreakdown),
    datasets: [
      {
        data: Object.values(expenseBreakdown),
        backgroundColor: [
          '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF'
        ],
        hoverBackgroundColor: [
          '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF'
        ]
      }
    ]
  };

  useEffect(() => {
    const fetchSummaries = async () => {
      const today = new Date().toISOString().split('T')[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Daily Summary
      const { data: dailyData, error: dailyError } = await supabase
        .from('transactions')
        .select('amount, accounts(account_type)')
        .eq('transaction_date', today)
        .eq('is_deleted', false);

      if (!dailyError) {
        const income = dailyData.filter(d => d.accounts?.account_type === 'আয়').reduce((sum, d) => sum + parseFloat(d.amount), 0);
        const expense = dailyData.filter(d => d.accounts?.account_type === 'খরচ').reduce((sum, d) => sum + parseFloat(d.amount), 0);
        setDailySummary({ totalIncome: income, totalExpense: expense, balance: income - expense });
      }

      // Weekly Summary
      const { data: weeklyData, error: weeklyError } = await supabase
        .from('transactions')
        .select('amount, accounts(account_type)')
        .gte('transaction_date', sevenDaysAgo)
        .eq('is_deleted', false);

      if (!weeklyError) {
        const wExpense = weeklyData.filter(d => d.accounts?.account_type === 'খরচ').reduce((sum, d) => sum + parseFloat(d.amount), 0);
        setWeeklyExpense(wExpense);
      }
    };

    fetchSummaries();
  }, [transactions]);

  const renderBreakdown = (title, breakdown, total) => (
    <div className="col-md-6 mt-3">
      <div className="card h-100 shadow-sm">
        <div className="card-body">
          <h5 className="card-title">{title}</h5>
          {Object.keys(breakdown).length > 0 ? (
            <div className="mt-3">
              {Object.entries(breakdown).map(([cat, amount]) => {
                const percentage = ((amount / (total || 1)) * 100).toFixed(1);
                const colorClass = title === t('income_breakdown') ? 'bg-success' : 'bg-danger';
                return (
                  <div key={cat} className="mb-3">
                    <div className="d-flex justify-content-between small mb-1">
                      <span className="fw-bold">{cat}</span>
                      <span>${amount.toFixed(2)} ({percentage}%)</span>
                    </div>
                    <div className="progress" style={{ height: '8px' }}>
                      <div 
                        className={`progress-bar ${colorClass}`} 
                        role="progressbar" 
                        style={{ width: `${percentage}%` }} 
                        aria-valuenow={percentage} 
                        aria-valuemin="0" 
                        aria-valuemax="100"
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted small">{t('no_transactions_yet')}</p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="row mb-4">
      <div className="col-md-4">
        <div className="card shadow-sm border-0 border-start border-success border-4">
          <div className="card-body">
            <h6 className="text-muted text-uppercase small">{t('total_income')} (Today)</h6>
            <h4 className="fw-bold text-success">${dailySummary.totalIncome.toFixed(2)}</h4>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card shadow-sm border-0 border-start border-danger border-4">
          <div className="card-body">
            <h6 className="text-muted text-uppercase small">{t('total_expense')} (Today)</h6>
            <h4 className="fw-bold text-danger">৳{dailySummary.totalExpense.toFixed(2)}</h4>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card shadow-sm border-0 border-start border-primary border-4">
          <div className="card-body">
            <h6 className="text-muted text-uppercase small">{t('balance')} (Today)</h6>
            <h4 className="fw-bold">${dailySummary.balance.toFixed(2)}</h4>
          </div>
        </div>
      </div>

      <div className="col-md-12 mt-3">
        <div className="card shadow-sm">
          <div className="card-body">
            <h5 className="card-title text-center">{t('expense_breakdown')} (Pie Chart)</h5>
            <div style={{ maxWidth: '350px', margin: '0 auto' }}>
              {Object.keys(expenseBreakdown).length > 0 ? (
                <Pie data={pieData} />
              ) : (
                <p className="text-muted small text-center">{t('no_transactions_yet')}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {renderBreakdown(t('income_breakdown'), incomeBreakdown, totalIncomeForBreakdown)}
      {renderBreakdown(t('expense_breakdown'), expenseBreakdown, totalExpenseForBreakdown)}

      <div className="col-12 mt-3">
        <div className="card bg-light border-0 shadow-sm">
          <div className="card-body d-flex justify-content-between align-items-center">
            <h6 className="mb-0 text-muted">{t('weekly_expense')} (Last 7 Days)</h6>
            <h5 className="mb-0 fw-bold">${weeklyExpense.toFixed(2)}</h5>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Summary;
