import { describe, it, expect } from "vitest";
import { parseTransactionSMS } from "./smsParser";

describe("smsParser", () => {
  it("parses bKash received money SMS accurately", () => {
    const sms = "You have received Tk 2,500.00 from 01712345678. Fee Tk 0.00. Balance Tk 15,250.00. TrxID 9K8L7M6N at 29/08/2026 14:30";
    const result = parseTransactionSMS(sms);

    expect(result.amount).toBe(2500);
    expect(result.type).toBe("income");
    expect(result.provider).toBe("bkash");
    expect(result.trxId).toBe("9K8L7M6N");
    expect(result.party).toContain("01712345678");
  });

  it("parses bKash payment to merchant SMS", () => {
    const sms = "Payment Tk 850.00 to Shwapno Superstore successful. Ref: 1. Fee Tk 0.00. Balance Tk 14,400.00. TrxID 8A7B6C5D";
    const result = parseTransactionSMS(sms);

    expect(result.amount).toBe(850);
    expect(result.type).toBe("expense");
    expect(result.provider).toBe("bkash");
    expect(result.trxId).toBe("8A7B6C5D");
    expect(result.party).toContain("Shwapno Superstore");
  });

  it("parses Nagad Cash-In SMS", () => {
    const sms = "Cash-In Tk 3,000.00 from 01887654321. TxnID: 71AB23CD. Balance: Tk 17,400.00";
    const result = parseTransactionSMS(sms);

    expect(result.amount).toBe(3000);
    expect(result.type).toBe("income");
    expect(result.provider).toBe("nagad");
    expect(result.trxId).toBe("71AB23CD");
  });

  it("parses Bank credited SMS", () => {
    const sms = "Dear Customer, your A/C 1029384756 has been credited with BDT 50,000.00 on 29-Aug-2026. Ref: SALARY-AUG26";
    const result = parseTransactionSMS(sms);

    expect(result.amount).toBe(50000);
    expect(result.type).toBe("income");
    expect(result.provider).toBe("bank");
    expect(result.trxId).toBe("SALARY");
  });

  it("handles empty or irrelevant strings gracefully", () => {
    const result = parseTransactionSMS("");
    expect(result.amount).toBeNull();
    expect(result.type).toBeNull();
    expect(result.provider).toBe("other");
  });
});
