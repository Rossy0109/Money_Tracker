import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from './supabase';

function DataManagement({ transactions, accounts, paymentMethods, onDataChange }) {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);

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
    link.setAttribute("download", `foot_print_of_money_export_${new Date().toISOString().split('T')[0]}.csv`);
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
    link.setAttribute("download", `foot_print_of_money_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importFromUltimate = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const backup = JSON.parse(e.target.result);
        if (!backup.data || !backup.data.transactions) {
          alert(t('import_failed'));
          return;
        }

        if (!window.confirm(t('confirm_import'))) return;

        const importedTransactions = backup.data.transactions;
        let importCount = 0;

        for (const tx of importedTransactions) {
          // 1. Resolve Account (Category in Firestore)
          let accountId;
          const existingAcc = accounts.find(a => a.account_name === tx.categoryName);
          
          if (existingAcc) {
            accountId = existingAcc.account_id;
          } else {
            const { data: newAcc, error: accErr } = await supabase
              .from('accounts')
              .insert({ 
                account_name: tx.categoryName, 
                account_type: tx.type === 'income' ? 'আয়' : 'খরচ',
                category: 'Imported'
              })
              .select()
              .single();
            
            if (accErr) {
              console.error('Account creation failed:', accErr);
              continue;
            }
            accountId = newAcc.account_id;
            accounts.push(newAcc);
          }

          // 2. Resolve Payment Method
          let methodId;
          const existingMethod = paymentMethods.find(m => m.method_name === tx.method);
          
          if (existingMethod) {
            methodId = existingMethod.method_id;
          } else {
            const { data: newMethod, error: methErr } = await supabase
              .from('payment_methods')
              .insert({ 
                method_name: tx.method, 
                method_type: 'নগদ',
                balance: 0 
              })
              .select()
              .single();
            
            if (methErr) {
              console.error('Method creation failed:', methErr);
              continue;
            }
            methodId = newMethod.method_id;
            paymentMethods.push(newMethod);
          }

          // 3. Insert Transaction
          const { error: txErr } = await supabase
            .from('transactions')
            .insert({
              account_id: accountId,
              amount: parseFloat(tx.amount),
              description: tx.description || '',
              payment_method_id: methodId,
              transaction_date: tx.date
            });

          if (!txErr) importCount++;
        }

        alert(t('import_success').replace('{{count}}', importCount));
        if (onDataChange) onDataChange();
      } catch (err) {
        console.error('Import failed:', err);
        alert(t('import_failed'));
      }
      // Reset input
      event.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="card mt-4 mb-5">
      <div className="card-body">
        <h5 className="card-title">{t('data_management')}</h5>
        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-outline-success" onClick={exportToCSV}>
            <i className="bi bi-file-earmark-spreadsheet me-1"></i>
            {t('export_csv')}
          </button>
          <button className="btn btn-outline-primary" onClick={backupToJSON}>
            <i className="bi bi-filetype-json me-1"></i>
            {t('export_json')}
          </button>
          
          <div className="border-start ps-2 ms-2 d-flex gap-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={importFromUltimate} 
              accept=".json" 
              style={{ display: 'none' }} 
            />
            <button 
              className="btn btn-primary" 
              onClick={() => fileInputRef.current.click()}
            >
              <i className="bi bi-cloud-download me-1"></i>
              {t('import_ultimate_json')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DataManagement;
