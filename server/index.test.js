const request = require('supertest');
const app = require('./index');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

// Helper to reset the database
const resetDb = () => {
  const adapter = new FileSync('db.json');
  const db = low(adapter);
  db.setState({ accounts: [], transactions: [], budget: [] }).write();
};

describe('Bug Fix: Transaction and Summary API', () => {
  beforeEach(() => {
    resetDb();
  });

  afterAll(() => {
    resetDb();
  });

  it('should reject transactions with missing fields', async () => {
    const malformedTransaction = {
      account_name: 'Test Expense',
      account_type: 'খরচ',
      payment_method: 'নগদ'
      // Missing 'amount'
    };

    await request(app)
      .post('/api/transactions')
      .send(malformedTransaction)
      .expect(400); // Expect a Bad Request response
  });

  it('should not return NaN for summaries when transactions are valid', async () => {
    // 1. Post a valid transaction
    const validTransaction = {
      account_name: 'Test Expense',
      account_type: 'খরচ',
      amount: 100,
      payment_method: 'নগদ'
    };

    await request(app)
      .post('/api/transactions')
      .send(validTransaction)
      .expect(201);

    // 2. Fetch the daily summary
    const res = await request(app).get('/api/summary/daily').expect(200);

    // 3. Assert that the totalExpense is a valid number
    expect(isNaN(res.body.totalExpense)).toBe(false);
    expect(res.body.totalExpense).toBe(100);
  });
});
