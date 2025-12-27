import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import Login from './Login';

describe('Login', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(axios);
  });

  afterEach(() => {
    mock.restore();
  });

  it('renders the login form', () => {
    render(<Login />);

    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  it('calls onLogin on successful login', async () => {
    const onLogin = jest.fn();
    mock.onPost('http://localhost:5000/api/login').reply(200);

    render(<Login onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    // Use waitFor to wait for the assertion to pass, which is the correct way
    // to handle async operations in @testing-library/react.
    await waitFor(() => {
        expect(onLogin).toHaveBeenCalledTimes(1);
    });
  });

  it('shows an error message on failed login', async () => {
    mock.onPost('http://localhost:5000/api/login').reply(401);

    render(<Login />);

    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrongpassword' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    expect(await screen.findByText('Invalid password')).toBeInTheDocument();
  });
});
