# 🔌 API Documentation

The Foot Print of Money Backend provides a RESTful API for managing transactions and summaries.

## 📍 Base URL
`http://localhost:5000/api`

## 🛣️ Endpoints

### 🔐 Authentication
- `POST /login`: Validates the master password.
  - Body: `{ "password": "..." }`

### 🏦 Accounts
- `GET /accounts`: List all active accounts.

### 💳 Payment Methods
- `GET /payment_methods`: List all active payment methods and their balances.

### 💸 Transactions
- `GET /transactions`: Retrieve the last 100 transactions.
- `POST /transactions`: Add a new transaction.
  - Body: `{ "account_id": 1, "amount": 100, "description": "...", "payment_method_id": 1 }`
- `PUT /transactions/<id>`: Update an existing transaction.
- `DELETE /transactions/<id>`: Soft-delete a transaction.

### 📊 Summaries
- `GET /summary/daily`: Get today's income, expense, and balance.
- `GET /summary/weekly`: Get the total expense for the last 7 days.

## 🛠️ MCP Tools
The backend also exposes tools for the **Gemini CLI** and other agents via `foot_print_of_money_mcp_tools.py`:
- `get_accounts()`
- `get_payment_methods()`
- `add_new_transaction()`
- `get_foot_print_of_money_report_summary()`
- `backup_to_google_drive()`
