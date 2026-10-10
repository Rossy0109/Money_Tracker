# server/db.ts — logical function test coverage ledger

Living record of hermetic/unit coverage for every exported logical function
in `server/db.ts`, grouped by section. Updated each batch.

- **H** = covered by `server/db.hermetic.test.ts` (real disposable MariaDB;
  runs in CI's `test` job, which provisions MariaDB — it only self-skips
  when no DB is reachable)
- **M** = covered by a mock-DB unit test (imports `./db` with mocked drizzle)
- **–** = not yet covered by a direct test (may still be exercised by e2e)

Last updated: 2026-09-30 · hermetic suite: **24/24 passing** · `pnpm check` clean

## 1. Users & passwords
| Function | Status |
|---|---|
| upsertUser | H |
| getUserByOpenId | H |
| getUserIdByOpenId | H |
| getUserByEmail | – |
| createPasswordUser | – |
| setUserPassword | – |
| createPasswordResetToken | – |
| validatePasswordResetToken | – |
| consumePasswordResetToken | – |
| clearPasswordResetToken | – |
| recordFailedLoginAttempt | – |
| clearFailedLoginAttempts | – |
| isLockedOut | – |
| recordLoginHistory | – |
| getLoginHistory | – |
| cleanupOldFailedLoginAttempts | – |
| updateUserStatus | – |

## 2. Sessions
| Function | Status |
|---|---|
| createUserSession | H |
| getSessionByRefreshToken | H |
| revokeSession | H |
| revokeSessionByToken | – |
| revokeAllUserSessions | H |
| findRevokedSessionByToken | H |
| updateSessionLastUsed | – |
| cleanupExpiredSessions | H |
| countActiveSessions | H |

## 3. Projects
| Function | Status |
|---|---|
| createProject | H |
| listProjects | M |
| assertOwnedProject | H (implicit, every guarded call) |

## 4. Voucher lifecycle
| Function | Status |
|---|---|
| createVoucherWithEntries | H |
| submitVoucher | H |
| approveVoucher | H |
| postVoucher | H (transition guards) |
| reverseVoucher | H (transition guards) |

## 5. Chart of accounts & groups
| Function | Status |
|---|---|
| seedDefaultAccountTypes | H |
| getAccountTypes | H |
| getChartOfAccounts | H |
| getChartOfAccountById | H |
| createChartOfAccount | H |
| updateChartOfAccount | H |
| deleteChartOfAccount | H |
| seedDefaultChartOfAccounts | – |
| getChartOfAccountsTree | – |
| adjustChartOfAccountBalance | – |
| listAccountGroups | H |
| createAccountGroup | H |
| updateAccountGroup | H |
| deleteAccountGroup | H |

## 6. Fiscal periods & locks
| Function | Status |
|---|---|
| getFiscalPeriodById | – |
| lockPeriod | H |
| unlockPeriod | H |
| isPeriodLocked | H |
| assertPeriodNotLocked | H |
| getPeriodLocks | H |

## 7. Reversals, reconciliation, bank rec
| Function | Status |
|---|---|
| getVoucherReversals | – |
| getAccountingReconciliation | – |
| getLedgerEntriesForReconciliation | – |
| createBankReconciliation | – |
| getBankReconciliationById | – |
| getBankReconciliations | – |
| addBankReconciliationItem | – |
| matchBankReconciliationItem | – |
| unmatchBankReconciliationItem | – |
| completeBankReconciliation | – |
| getBankReconciliationItems | – |

## 8. Voucher settings
| Function | Status |
|---|---|
| getVoucherSettings | H |
| updateVoucherSettings | H |

## 9. Households
| Function | Status |
|---|---|
| listHouseholds | – |
| listHouseholdInvitations | – |
| createHousehold | – |
| getHouseholdOverview | – |
| inviteHouseholdMember | – |
| acceptHouseholdInvitation | – |
| updateHouseholdMember | – |
| saveSharedBudget | – |
| addSharedExpense | – |

## 10. Overview, analytics, reports
| Function | Status |
|---|---|
| getOverview | H |
| getBudgetPlan | H |
| getFinanceAnalytics | – |
| searchTransactions | H |
| listTransactionsPaginated | H |
| getMonthlyReport | H |

## 11. Dues
| Function | Status |
|---|---|
| createDue | H |
| settleDue | H |

## 12. Wallet accounts
| Function | Status |
|---|---|
| backfillWalletOpeningBalances | – |
| createAccount | H |
| updateAccount | H |
| deleteAccount | H |

## 13. Transactions
| Function | Status |
|---|---|
| createTransaction | H (+M idempotency) |
| updateTransaction | H |
| deleteTransaction | H |

## 14. Budgets & bills
| Function | Status |
|---|---|
| upsertBudget | H |
| createBill | H |
| updateBill | H |
| setBillPaid | H |
| deleteBill | H |

## 15. Automation & recurring
| Function | Status |
|---|---|
| getAutomationOverview | H |
| createRecurringTemplate | H |
| setRecurringScheduleTask | – |
| updateRecurringTemplate | – |
| setBillReminderSettings | – |
| setBillScheduleTask | – |
| generateRecurringNow | H |
| processScheduledRecurring | M |
| processScheduledBillReminder | M |
| processRecurringSweep | – |
| processBillReminderSweep | – |

## 16. Backup export/restore
| Function | Status |
|---|---|
| exportUserData | – |
| exportProjectBackup | – |
| previewProjectBackup | – |
| restoreProjectBackup | – |

## 17. Admin
| Function | Status |
|---|---|
| listUsersForAdmin | – |
| listProjectsForAdmin | – |

## 18. Invoices
| Function | Status |
|---|---|
| createInvoice | H |
| listInvoices | H |
| getInvoiceById | H |
| updateInvoiceStatus | H |
| deleteInvoice | H |

## 19. Statements & vouchers read-model
| Function | Status |
|---|---|
| getFinancialStatements | M |
| getStatementData | – |
| getVoucherList | – |
| getVoucherPrintData | – |

## 20. Inventory
| Function | Status |
|---|---|
| listInventoryItems | H |
| createInventoryItem | H |
| updateInventoryItem | H |
| adjustInventoryStock | H |
| deleteInventoryItem | H |

## 21. Employees & payroll
| Function | Status |
|---|---|
| getEmployees | H |
| createEmployee | H |
| updateEmployee | H |
| deleteEmployee | H (+M) |
| getSalaryPayments | H |
| disburseSalary | H |
| getEmployeeAdvances | H |
| createEmployeeAdvance | H |

## 22. Firm profile
| Function | Status |
|---|---|
| getFirmProfile | H |
| saveFirmProfile | H |

## 23. Private storage objects
| Function | Status |
|---|---|
| registerPrivateStorageObject | – |
| getPrivateStorageObjectForDownload | – |

## 24. Categories (user-managed)
| Function | Status |
|---|---|
| createCategory | H |
| updateCategory | H |
| deleteCategory | H |

## Batch history
- Batch 1 (PR #177): 16 files, 83 unit tests (pure utils, no DB)
- Batch 2 (PR #180): 6 files, 29 unit tests (mocked DB/network)
- PR #181: hermetic suite created (5 tests) + balance-restoration bug fix
- PR #182: hermetic batch 3 — sessions, vouchers, reports, dues, recurring (10 total)
- Batch 4 (this file + suite): budgets, bills, accounts CRUD, period locks,
  voucher settings, invoices — hermetic suite now **16 tests**, 47/139
  db.ts functions covered hermetically, 8 more via mock-DB unit tests
- Batch 5: chart of accounts + groups, employees/salary/advances, inventory,
  firm profile, search/pagination, voucher post/reverse guards — suite now
  **23 tests**, 76/139 db.ts functions covered hermetically
- Category feature: create/update/deleteCategory (server + finance router
  mutations + Categories page add/delete UI) with guards (unique per
  type, defaults protected, in-use protected) — suite now **24 tests**,
  79 functions covered hermetically
