import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

function Summary() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState({ totalIncome: 0, totalExpense: 0, balance: 0 });
  const [weeklyExpense, setWeeklyExpense] = useState(0);

  useEffect(() => {
    // Add withCredentials: true to send the session cookie
    axios.get('http://localhost:5000/api/summary/daily', { withCredentials: true })
      .then(response => {
        setSummary(response.data);
      })
      .catch(error => console.error('Error fetching daily summary:', error));

    // Add withCredentials: true to send the session cookie
    axios.get('http://localhost:5000/api/summary/weekly', { withCredentials: true })
      .then(response => {
        setWeeklyExpense(response.data.weeklyExpense);
      })
      .catch(error => console.error('Error fetching weekly summary:', error));
  }, []);

  return (
    <div className="card mb-4">
      <div className="card-body">
        <div className="row">
          <div className="col-md-3">
            <h4>{t('total_income')}</h4>
            <p className="text-success fs-5">৳ {summary.totalIncome.toFixed(2)}</p>
          </div>
          <div className="col-md-3">
            <h4>{t('total_expense')}</h4>
            <p className="text-danger fs-5">৳ {summary.totalExpense.toFixed(2)}</p>
          </div>
          <div className="col-md-3">
            <h4>{t('balance')}</h4>
            <p className="fs-5">৳ {summary.balance.toFixed(2)}</p>
          </div>
          <div className="col-md-3">
            <h4>{t('weekly_expense')}</h4>
            <p className="text-warning fs-5">৳ {weeklyExpense.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Summary;
