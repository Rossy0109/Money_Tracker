-- Preserve transaction and budget history: a legacy category is removed only when nothing references it.
DELETE c
FROM finance_categories c
LEFT JOIN finance_transactions t ON t.categoryId = c.id
LEFT JOIN finance_budgets b ON b.categoryId = c.id
WHERE c.type = 'expense'
  AND c.name IN ('Food', 'Transport', 'Housing', 'Utilities', 'Education', 'Health', 'Shopping', 'Family')
  AND t.id IS NULL
  AND b.id IS NULL;

-- Add the user-approved Bengali expense categories for every existing user.
INSERT IGNORE INTO finance_categories (userId, name, type, isDefault)
SELECT u.id, defaults.name, 'expense', TRUE
FROM users u
CROSS JOIN (
  SELECT 'মেয়র স্যার' AS name
  UNION ALL SELECT 'রছি ভাই'
  UNION ALL SELECT 'মুক্তার বাড়ির বাজার'
  UNION ALL SELECT 'ইউটিলিটি বিল'
  UNION ALL SELECT 'বেতন'
  UNION ALL SELECT 'বাজারের বাসা খরচ'
  UNION ALL SELECT 'যাতায়াত খরচ'
  UNION ALL SELECT 'ঠিকাদারী ব্যবসা'
  UNION ALL SELECT 'ঠিকাদার লাইসেন্স রেনুয়াল'
  UNION ALL SELECT 'দেনা পাওনা'
  UNION ALL SELECT 'রাজনৈতিক খরচ'
  UNION ALL SELECT 'অনুদান'
) AS defaults;
