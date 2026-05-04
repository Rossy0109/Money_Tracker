// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import i18n from './i18n';
import { I18nextProvider } from 'react-i18next';

// Initialize i18next for tests
i18n.init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        "total_income": "Total Income",
        "total_expense": "Total Expense",
        "balance": "Balance",
        "weekly_expense": "Weekly Expense",
        "add_new_transaction": "Add New Transaction",
        "deposit": "Deposit",
        "expense": "Expense",
        "select_account": "Select Account",
        "description": "Description",
        "amount": "Amount",
        "add_transaction": "Add Transaction",
        "transactions": "Transactions",
        "date": "Date",
        "account": "Account",
        "type": "Type",
        "category": "Category",
        "no_transactions_yet": "No transactions yet."
      }
    }
  }
});
