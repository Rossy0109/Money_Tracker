export const accountingReportOptions = [
  { value: "full", label: "সম্পূর্ণ মাসিক হিসাব", title: "মাসিক আর্থিক রিপোর্ট", filename: "monthly-report" },
  { value: "profit-loss", label: "লাভ ও ক্ষতির রিপোর্ট", title: "লাভ ও ক্ষতির রিপোর্ট", filename: "profit-loss-report" },
  { value: "income", label: "আয়ের রিপোর্ট", title: "আয়ের রিপোর্ট", filename: "income-report" },
  { value: "expense", label: "ব্যয়ের রিপোর্ট", title: "ব্যয়ের রিপোর্ট", filename: "expense-report" },
  { value: "debt", label: "দেনার রিপোর্ট", title: "দেনার রিপোর্ট", filename: "debt-report" },
  { value: "receivable", label: "পাওনার রিপোর্ট", title: "পাওনার রিপোর্ট", filename: "receivable-report" },
  { value: "financial-position", label: "আর্থিক অবস্থানের রিপোর্ট", title: "আর্থিক অবস্থানের রিপোর্ট", filename: "financial-position-report" },
] as const;

export type AccountingReportType = (typeof accountingReportOptions)[number]["value"];
