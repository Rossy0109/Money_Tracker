
const express = require('express');
const cors = require('cors');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Initialize LowDB
const adapter = new FileSync('db.json');
const db = low(adapter);

// Set defaults if db.json is empty
db.defaults({ accounts: [], transactions: [], budget: [] }).write();

// Pre-populate accounts if empty, mimicking Python app
if (db.get('accounts').isEmpty().value()) {
  const accountsData = [
    { account_name: 'ঠিকাদারী আয়', account_type: 'আয়', category: 'ব্যবসায়িক', is_active: 1 },
    { account_name: 'অন্যান্য আয়', account_type: 'আয়', category: 'অন্যান্য', is_active: 1 },
    { account_name: 'দৈনিক বাজার', account_type: 'খরচ', category: 'পারিবারিক', is_active: 1 },
    { account_name: 'মুক্তার বাড়ী আনুষঙ্গিক খরচ', account_type: 'খরচ', category: 'পারিবারিক', is_active: 1 },
    { account_name: 'বাজারে বাসার আনুষঙ্গিক খরচ', account_type: 'খরচ', category: 'পারিবারিক', is_active: 1 },
    { account_name: 'ইউটিলিটি মুক্তার বাড়ি', account_type: 'খরচ', category: 'পারিবারিক', is_active: 1 },
    { account_name: 'ইউটিলিটি বাজারে বাসা', account_type: 'খরচ', category: 'পারিবারিক', is_active: 1 },
    { account_name: 'ঠিকাদারী ব্যবসা', account_type: 'খরচ', category: 'ব্যবসায়িক', is_active: 1 },
    { account_name: 'ঠিকাদারী লাইসেন্স রিনিউয়াল', account_type: 'খরচ', category: 'ব্যবসায়িক', is_active: 1 },
    { account_name: 'অফিসে স্টেশনারি', account_type: 'খরচ', category: 'ব্যবসায়িক', is_active: 1 },
    { account_name: 'রাজনৈতিক খরচ', account_type: 'খরচ', category: 'সামাজিক', is_active: 1 },
    { account_name: 'অনুদান', account_type: 'খরচ', category: 'সামাজিক', is_active: 1 },
    { account_name: 'মেয়র স্যারের খরচ', account_type: 'খরচ', category: 'সামাজিক', is_active: 1 },
    { account_name: 'রছি ভাইয়ের খরচ', account_type: 'খরচ', category: 'সামাজিক', is_active: 1 },
    { account_name: 'বেতন', account_type: 'খরচ', category: 'নিয়মিত', is_active: 1 },
    { account_name: 'যাতায়াত খরচ', account_type: 'খরচ', category: 'নিয়মিত', is_active: 1 },
    { account_name: 'নাস্তা/আপ্যায়ন', account_type: 'খরচ', category: 'নিয়মিত', is_active: 1 }
  ];
  db.get('accounts').push(...accountsData).write();
}

app.get('/', (req, res) => {
  res.send('Hello from the Expense Tracker backend!');
});

// API to get all accounts
app.get('/api/accounts', (req, res) => {
  res.json(db.get('accounts').value());
});

// API to get all transactions
app.get('/api/transactions', (req, res) => {
  res.json(db.get('transactions').value());
});

// API to add a new transaction
app.post('/api/transactions', (req, res) => {
  const newTransaction = {
    id: Date.now(), // Simple unique ID
    transaction_date: new Date().toISOString().split('T')[0],
    transaction_time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    ...req.body
  };
  db.get('transactions').push(newTransaction).write();
  res.status(201).json(newTransaction);
});

// API to delete a transaction
app.delete('/api/transactions/:id', (req, res) => {
  const { id } = req.params;
  db.get('transactions').remove({ id: parseInt(id) }).write();
  res.status(204).send();
});

// API for daily summary
app.get('/api/summary/daily', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const transactionsToday = db.get('transactions').filter({ transaction_date: today }).value();

  const totalIncome = transactionsToday
    .filter(t => t.account_type === 'আয়')
    .reduce((acc, t) => acc + t.amount, 0);

  const totalExpense = transactionsToday
    .filter(t => t.account_type === 'খরচ')
    .reduce((acc, t) => acc + t.amount, 0);

  res.json({
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
  });
});

// API for weekly summary (total expenses for the current week)
app.get('/api/summary/weekly', (req, res) => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 for Sunday, 1 for Monday, etc.
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek); // Go back to Sunday
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Go to Saturday
  endOfWeek.setHours(23, 59, 59, 999);

  const transactionsThisWeek = db.get('transactions').filter(t => {
    const transactionDate = new Date(t.transaction_date);
    return transactionDate >= startOfWeek && transactionDate <= endOfWeek;
  }).value();

  const weeklyExpense = transactionsThisWeek
    .filter(t => t.account_type === 'খরচ')
    .reduce((acc, t) => acc + t.amount, 0);

  res.json({ weeklyExpense });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
