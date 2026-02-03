
import { render, screen, within } from '@testing-library/react';
import Summary from './Summary';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';

const mockTransactions = [
  { transaction_date: new Date().toISOString().split('T')[0], amount: 100, account_type: 'আয়' },
  { transaction_date: new Date().toISOString().split('T')[0], amount: 50, account_type: 'খরচ' }
];

test('calculates daily summary correctly', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <Summary transactions={mockTransactions} />
    </I18nextProvider>
  );

  // Total Income
  const incomeCard = screen.getByText('Total Income').closest('.card-body');
  expect(within(incomeCard).getByText(/\$100\.00/i)).toBeInTheDocument();

  // Total Expense
  const expenseCard = screen.getByText('Total Expense').closest('.card-body');
  expect(within(expenseCard).getByText(/\$50\.00/i)).toBeInTheDocument();

  // Balance
  const balanceCard = screen.getByText('Balance').closest('.card-body');
  expect(within(balanceCard).getByText(/\$50\.00/i)).toBeInTheDocument();

  // Weekly Expense
  const weeklyCard = screen.getByText('Weekly Expense').closest('.card-body');
  expect(within(weeklyCard).getByText(/\$50\.00/i)).toBeInTheDocument();
});
