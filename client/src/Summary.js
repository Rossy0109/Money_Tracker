
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import API_URL from './config';

function Summary({ transactions }) {
  const { t } = useTranslation();
  const [dailySummary, setDailySummary] = useState({ totalIncome: 0, totalExpense: 0, balance: 0 });
  const [weeklyExpense, setWeeklyExpense] = useState(0);

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
