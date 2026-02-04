
import { render, screen } from '@testing-library/react';
import Summary from './Summary';
import React from 'react';

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}));

describe('Summary Component Performance Optimization', () => {
  const now = new Date();
  const todayStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60 * 1000)).toISOString().split('T')[0];

  const mockTransactions = [
    { id: 1, transaction_date: todayStr, amount: 1000.00, account_type: 'আয়' },
    { id: 2, transaction_date: todayStr, amount: 350.00, account_type: 'খরচ' },
    { id: 3, transaction_date: '2020-01-01', amount: 500.00, account_type: 'খরচ' }, // Not today
  ];

  test('calculates daily totals locally from transactions prop', () => {
    render(<Summary transactions={mockTransactions} />);

    // Check for "total_income" value (1000.00)
    const incomeElements = screen.getAllByText(/\$1000\.00/);
    expect(incomeElements.length).toBeGreaterThan(0);

    // Check for "total_expense" value (350.00)
    const expenseElements = screen.getAllByText(/\$350\.00/);
    expect(expenseElements.length).toBeGreaterThan(0);

    // Check for "balance" value (1000 - 350 = 650)
    const balanceElements = screen.getAllByText(/\$650\.00/);
    expect(balanceElements.length).toBeGreaterThan(0);
  });

  test('handles empty transactions array', () => {
    render(<Summary transactions={[]} />);
    const zeroElements = screen.getAllByText(/\$0\.00/);
    expect(zeroElements.length).toBeGreaterThanOrEqual(4); // 3 for daily + 1 for weekly
  });
});
