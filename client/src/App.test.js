import { render, screen } from '@testing-library/react';
import App from './App';

test('renders total income card', () => {
  render(<App />);
  const linkElement = screen.getByText(/total income/i);
  expect(linkElement).toBeInTheDocument();
});
