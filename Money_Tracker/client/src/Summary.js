import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import API_URL from './config';

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
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40',
          '#C9CBCF'
        ],
        hoverBackgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40',
          '#C9CBCF'
        ]
      }
    ]
  };

  useEffect(() => {
    axios.get(`${API_URL}/api/summary/daily`, { withCredentials: true })
      .then(response => {
        setDailySummary(response.data);
      })
      .catch(error => {
        console.error('Error fetching daily summary:', error);
      });

    axios.get(`${API_URL}/api/summary/weekly`, { withCredentials: true })
      .then(response => {
        setWeeklyExpense(response.data.weeklyExpense);
      })
      .catch(error => {
        console.error('Error fetching weekly expense:', error);
      });
  }, [transactions]);

  const renderBreakdown = (title, breakdown, total) => (
    <div className="col-md-6 mt-3">
      <div className="card h-100">
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

      <div className="col-md-12 mt-3">
        <div className="card">
          <div className="card-body">
            <h5 className="card-title text-center">{t('expense_breakdown')} (Pie Chart)</h5>
            <div style={{ maxWidth: '400px', margin: '0 auto' }}>
              {Object.keys(expenseBreakdown).length > 0 ? (
                <Pie data={pieData} />
              ) : (
                <p className="text-muted small text-center">{t('no_transactions_yet')}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Categorized Breakdowns */}
      {renderBreakdown(t('income_breakdown'), incomeBreakdown, totalIncomeForBreakdown)}
      {renderBreakdown(t('expense_breakdown'), expenseBreakdown, totalExpenseForBreakdown)}

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
