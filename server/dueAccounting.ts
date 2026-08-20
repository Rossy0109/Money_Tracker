export type DueType = "debt" | "receivable";

export function calculateDueSettlement(type: DueType, outstandingAmount: number, settlementAmount: number) {
  if (!Number.isFinite(outstandingAmount) || !Number.isFinite(settlementAmount) || settlementAmount <= 0 || settlementAmount > outstandingAmount) {
    throw new Error("Settlement amount must be greater than zero and cannot exceed the outstanding balance");
  }

  return {
    outstandingAmount: outstandingAmount - settlementAmount,
    accountBalanceDelta: type === "debt" ? -settlementAmount : settlementAmount,
    incomeDelta: 0,
    expenseDelta: 0,
  };
}
