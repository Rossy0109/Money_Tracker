# Bolt's Journal - CRITICAL LEARNINGS ONLY

## 2023-10-27 - [Database Indexing for SQLite]
**Learning:** SQLite doesn't automatically index foreign keys or frequently used filtering/sorting columns. For a transaction-heavy application, missing indexes on `transaction_date` and `account_id` lead to full table scans and temporary B-trees for sorting, which degrades performance as the database grows.
**Action:** Always check the query plan with `EXPLAIN QUERY PLAN` and add composite indexes for columns used together in `ORDER BY` and `WHERE` clauses.
