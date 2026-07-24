const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const app = require('./index.cjs');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const resetDb = () => {
  const adapter = new FileSync('db.json');
  const db = low(adapter);
  db.setState({ accounts: [], transactions: [], budget: [] }).write();
};

test('Server API Tests', async (t) => {
  let server;
  let baseUrl;

  t.beforeEach(async () => {
    resetDb();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  t.afterEach(async () => {
    resetDb();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('should reject transactions with missing fields', async () => {
    const malformedTransaction = {
      account_name: 'Test Expense',
      account_type: 'খরচ',
      payment_method: 'নগদ'
    };

    const res = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(malformedTransaction)
    });

    assert.strictEqual(res.status, 400);
  });

  await t.test('should process valid transaction and return correct daily summary', async () => {
    const validTransaction = {
      account_name: 'Test Expense',
      account_type: 'খরচ',
      amount: 100,
      payment_method: 'নগদ'
    };

    const postRes = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validTransaction)
    });

    assert.strictEqual(postRes.status, 201);

    const summaryRes = await fetch(`${baseUrl}/api/summary/daily`);
    assert.strictEqual(summaryRes.status, 200);

    const summaryData = await summaryRes.json();
    assert.strictEqual(Number.isNaN(summaryData.totalExpense), false);
    assert.strictEqual(summaryData.totalExpense, 100);
  });
});
