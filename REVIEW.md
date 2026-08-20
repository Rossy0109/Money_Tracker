# Functional Review Record

## Authenticated dialog verification

| Environment | Dialogs checked | Result | Evidence |
| --- | --- | --- | --- |
| Mobile | Transaction, account, budget, bill, due/receivable, and voucher-settings dialogs | The user confirmed that the authenticated dialogs display and work correctly after the successful mobile OAuth sign-in. | User confirmation received in the application review session. |
| Desktop | Transaction, voucher-settings, and account-editor dialogs | The authenticated desktop dashboard loaded successfully. The transaction dialog displayed Bengali tab controls, associated labels, amount/date/payment/account fields, an automatic-voucher explanation, a description field, a save control, and a close control without layout overflow at desktop width. The voucher dialog displayed the current prefix, read-only next number preview, start/end numeric range fields, guidance, a save control, and a close control without overflow. The account editor displayed the prefilled name, account-type selector, opening-balance field, update action, and close control without overflow. No settings or account data were changed. | Authenticated delegated browser review on 2026-08-20. |
| Desktop | Budget dialog | The authenticated empty-state view correctly displayed “এই মাসে কোনো বাজেট নেই”. The compact add button in the budget-card header opened a modal with category selector, numeric amount input, Bengali save action, and close control; no layout overflow was present. No budget was created. | Authenticated delegated browser review on 2026-08-20. |
| Desktop | Bill dialog | The new-bill modal displayed Bengali labels with name, amount, and due-date inputs, plus save and close controls. No bill was created or changed. | Authenticated delegated browser review on 2026-08-20. |
| Desktop | Debt dialog | The new-debt modal displayed clearly separated debt/receivable tabs, debtor-name, amount, date, and description fields, automatic-voucher guidance, plus Bengali save and close controls. No debt record was created or changed. | Authenticated delegated browser review on 2026-08-20. |
| Desktop | Receivable dialog | The receivable tab displayed payee-name, amount, date, description, automatic-voucher guidance, and Bengali save/close controls. No receivable record was created or changed. | Authenticated delegated browser review on 2026-08-20. |
