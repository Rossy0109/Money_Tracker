import React from 'react';
import { useTranslation } from 'react-i18next';

function DataManagement({ transactions, accounts, paymentMethods }) {
  const { t } = useTranslation();

  const exportToCSV = () => {
    const headers = ['Date', 'Time', 'Account', 'Type', 'Category', 'Amount', 'Payment Method', 'Description'];
    const rows = transactions.map(tx => [
      tx.transaction_date,
      tx.transaction_time,
      tx.account_name,
      tx.account_type,
      tx.category,
      tx.amount,
      tx.payment_method,
      `"${tx.description.replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `money_tracker_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const backupToJSON = () => {
    const backupData = {
      metadata: {
        version: "2.0 (Export)",
        export_date: new Date().toISOString(),
        source: "Client Browser"
      },
      accounts,
      payment_methods: paymentMethods,
      transactions
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `money_tracker_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="card mt-4 mb-5">
      <div className="card-body">
        <h5 className="card-title">{t('data_management')}</h5>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-success" onClick={exportToCSV}>
            <i className="bi bi-file-earmark-spreadsheet me-1"></i>
            {t('export_csv')}
          </button>
          <button className="btn btn-outline-primary" onClick={backupToJSON}>
            <i className="bi bi-filetype-json me-1"></i>
            {t('export_json')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DataManagement;
