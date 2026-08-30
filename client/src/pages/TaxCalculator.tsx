import React, { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  calculateBangladeshIncomeTax,
  GenderCategory,
  IncomeBreakdown,
  InvestmentBreakdown,
} from "@/lib/taxCalculator";
import {
  Calculator,
  Percent,
  ShieldCheck,
  TrendingUp,
  Landmark,
  Building,
  Coins,
  ArrowRight,
  HelpCircle,
} from "lucide-react";

export default function TaxCalculator() {
  const [category, setCategory] = useState<GenderCategory>("general");
  const [cityType, setCityType] = useState<"dhaka_ctg" | "other_city" | "non_city">("dhaka_ctg");

  // Incomes
  const [salaryIncome, setSalaryIncome] = useState("720000");
  const [businessIncome, setBusinessIncome] = useState("0");
  const [houseRentIncome, setHouseRentIncome] = useState("0");
  const [agricultureIncome, setAgricultureIncome] = useState("0");
  const [otherIncome, setOtherIncome] = useState("0");
  const [tds, setTds] = useState("0");

  // Investments
  const [sanchayapatra, setSanchayapatra] = useState("100000");
  const [dps, setDps] = useState("120000");
  const [stockMarket, setStockMarket] = useState("0");
  const [lifeInsurance, setLifeInsurance] = useState("30000");
  const [providentFund, setProvidentFund] = useState("60000");

  const income: IncomeBreakdown = {
    salaryIncome: Number(salaryIncome) || 0,
    businessIncome: Number(businessIncome) || 0,
    houseRentIncome: Number(houseRentIncome) || 0,
    agricultureIncome: Number(agricultureIncome) || 0,
    otherIncome: Number(otherIncome) || 0,
    taxDeductedAtSource: Number(tds) || 0,
  };

  const investments: InvestmentBreakdown = {
    sanchayapatra: Number(sanchayapatra) || 0,
    dps: Number(dps) || 0,
    stockMarket: Number(stockMarket) || 0,
    lifeInsurance: Number(lifeInsurance) || 0,
    providentFund: Number(providentFund) || 0,
  };

  const result = calculateBangladeshIncomeTax(income, investments, category, cityType);

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* Header Banner */}
        <div className="bg-white p-5 sm:p-7 rounded-3xl border border-[#dce7df] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#166534]">
              <Calculator className="h-4 w-4" />
              <span>National Board of Revenue (NBR) Bangladesh</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#14382f] mt-1">
              আয়কর ও ভ্যাট ক্যালকুলেটর (FY 2024-2026)
            </h1>
            <p className="text-xs sm:text-sm text-[#5a7a6c] mt-1">
              বাংলাদেশের সর্বশেষ অর্থ আইন অনুযায়ী ব্যক্তিগত আয়কর, স্ল্যাব ভিত্তিক ট্যাক্স ও বিনিয়োগ রেয়াত হিসাব করুন।
            </p>
          </div>

          <div className="flex items-center gap-2 bg-[#f0f7f2] p-3 rounded-2xl border border-[#cde4d5]">
            <ShieldCheck className="h-5 w-5 text-[#166534]" />
            <div className="text-xs">
              <span className="block font-bold text-[#14382f]">করমুক্ত আয় সীমা</span>
              <span className="text-[#517565]">৳ {result.initialThreshold.toLocaleString()} পর্যন্ত ০% ট্যাক্স</span>
            </div>
          </div>
        </div>

        {/* 2-Column Grid: Form Inputs & Calculation Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Inputs */}
          <div className="lg:col-span-7 space-y-5">
            {/* Category & City Selection */}
            <div className="bg-white p-5 rounded-3xl border border-[#dce7df] shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-[#14382f] flex items-center gap-2">
                <Building className="h-4 w-4 text-[#166534]" /> করদাতার ক্যাটাগরি ও অবস্থান
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-[#244b3c]">করদাতা শ্রেণি</Label>
                  <Select value={category} onValueChange={(val: GenderCategory) => setCategory(val)}>
                    <SelectTrigger className="mt-1 h-10 rounded-xl border-[#cfe0d5] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="general">সাধারণ পুরুষ করদাতা (৳ ৩.৫ লাখ)</SelectItem>
                      <SelectItem value="female_senior">মহিলা / ৬৫+ বয়স্ক নাগরিক (৳ ৪ লাখ)</SelectItem>
                      <SelectItem value="specially_abled">প্রতিবন্ধী ব্যক্তি (৳ ৪.৭৫ লাখ)</SelectItem>
                      <SelectItem value="freedom_fighter">গেজেটভুক্ত বীর মুক্তিযোদ্ধা (৳ ৫ লাখ)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-[#244b3c]">এলাকা (ন্যূনতম করের জন্য)</Label>
                  <Select value={cityType} onValueChange={(val: any) => setCityType(val)}>
                    <SelectTrigger className="mt-1 h-10 rounded-xl border-[#cfe0d5] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="dhaka_ctg">ঢাকা ও চট্টগ্রাম সিটি কর্পোরেশন (৳ ৫,০০০)</SelectItem>
                      <SelectItem value="other_city">অন্যান্য সিটি কর্পোরেশন (৳ ৪,০০০)</SelectItem>
                      <SelectItem value="non_city">সিটি কর্পোরেশনের বাইরের এলাকা (৳ ৩,০০০)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Income Inputs */}
            <div className="bg-white p-5 rounded-3xl border border-[#dce7df] shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-[#14382f] flex items-center gap-2">
                <Coins className="h-4 w-4 text-[#166534]" /> বাৎসরিক আয়ের বিবরণ (টাকা)
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-[#244b3c]">চাকরির মোট বেতন (Salary)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={salaryIncome}
                    onChange={(e) => setSalaryIncome(e.target.value)}
                    className="mt-1 h-10 rounded-xl border-[#cfe0d5]"
                  />
                  <span className="text-[10px] text-[#719385]">১/৩ অংশ বা ৪.৫ লাখ টাকা পর্যন্ত স্বয়ংক্রিয়ভাবে করমুক্ত</span>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-[#244b3c]">ব্যবসা বা পেশাগত নিট মুনাফা</Label>
                  <Input
                    type="number"
                    min="0"
                    value={businessIncome}
                    onChange={(e) => setBusinessIncome(e.target.value)}
                    className="mt-1 h-10 rounded-xl border-[#cfe0d5]"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-[#244b3c]">বাড়ি ভাড়া ও সম্পত্তি থেকে আয়</Label>
                  <Input
                    type="number"
                    min="0"
                    value={houseRentIncome}
                    onChange={(e) => setHouseRentIncome(e.target.value)}
                    className="mt-1 h-10 rounded-xl border-[#cfe0d5]"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-[#244b3c]">অন্যান্য উৎস ও ব্যাংকের মুনাফা</Label>
                  <Input
                    type="number"
                    min="0"
                    value={otherIncome}
                    onChange={(e) => setOtherIncome(e.target.value)}
                    className="mt-1 h-10 rounded-xl border-[#cfe0d5]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label className="text-xs font-semibold text-[#244b3c]">
                    উৎসে কর্তিত কর / অগ্রিম ট্যাক্স (TDS / Advance Tax)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    value={tds}
                    onChange={(e) => setTds(e.target.value)}
                    placeholder="ইতোমধ্যে কর্তন করা ট্যাক্স"
                    className="mt-1 h-10 rounded-xl border-[#cfe0d5]"
                  />
                </div>
              </div>
            </div>

            {/* Investments for Tax Rebate */}
            <div className="bg-white p-5 rounded-3xl border border-[#dce7df] shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-[#14382f] flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#166534]" /> কর রেয়াতযোগ্য বিনিয়োগ (Rebate)
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-[#244b3c]">জাতীয় সঞ্চয়পত্র (Sanchayapatra)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={sanchayapatra}
                    onChange={(e) => setSanchayapatra(e.target.value)}
                    className="mt-1 h-10 rounded-xl border-[#cfe0d5]"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-[#244b3c]">ডিপিএস (DPS - সর্বোচ্চ ১.২ লাখ)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={dps}
                    onChange={(e) => setDps(e.target.value)}
                    className="mt-1 h-10 rounded-xl border-[#cfe0d5]"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-[#244b3c]">শেয়ার বাজার বিনিয়োগ (Stocks)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={stockMarket}
                    onChange={(e) => setStockMarket(e.target.value)}
                    className="mt-1 h-10 rounded-xl border-[#cfe0d5]"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-[#244b3c]">জীবন বীমা প্রিমিয়াম (Life Insurance)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={lifeInsurance}
                    onChange={(e) => setLifeInsurance(e.target.value)}
                    className="mt-1 h-10 rounded-xl border-[#cfe0d5]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Calculation Summary */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-gradient-to-br from-[#113a30] via-[#14473b] to-[#0f342b] text-white p-6 rounded-3xl shadow-xl space-y-5 sticky top-6">
              <div>
                <span className="text-xs font-semibold text-[#a8dcbc] uppercase tracking-wider">
                  বাৎসরিক কর বিবরণী
                </span>
                <div className="text-3xl font-bold text-white mt-1">
                  ৳ {result.remainingTaxToPay.toLocaleString()}
                </div>
                <p className="text-xs text-[#b8dfc9] mt-0.5">
                  চূড়ান্ত প্রদেয় নিট আয়কর (TDS কর্তনের পর)
                </p>
              </div>

              {/* Summary Metrics */}
              <div className="space-y-2 py-3 border-y border-white/15 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#b9d6c5]">মোট বার্ষিক আয় (Gross):</span>
                  <span className="font-semibold text-white">৳ {result.totalGrossIncome.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#b9d6c5]">করমুক্ত ভাতা / অব্যাহতি:</span>
                  <span className="font-semibold text-[#8ce0a3]">- ৳ {result.exemptIncome.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#b9d6c5]">মোট করযোগ্য আয় (Taxable):</span>
                  <span className="font-semibold text-white">৳ {result.totalTaxableIncome.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#b9d6c5]">গ্রস ট্যাক্স লায়াবিলিটি:</span>
                  <span className="font-semibold text-white">৳ {result.grossTaxLiability.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#b9d6c5]">বিনিয়োগ কর রেয়াত (১৫%):</span>
                  <span className="font-semibold text-[#8ce0a3]">- ৳ {result.taxRebate.toLocaleString()}</span>
                </div>
                {Number(tds) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[#b9d6c5]">ইতোমধ্যে প্রদত্ত ট্যাক্স (TDS):</span>
                    <span className="font-semibold text-[#8ce0a3]">- ৳ {Number(tds).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Slabs Breakdown */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[#b9d6c5] block">স্ল্যাব ভিত্তিক ট্যাক্স হিসাব:</span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {result.slabs.map((slab, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center bg-white/10 p-2 rounded-xl text-xs"
                    >
                      <span className="text-[#d8ebd9]">{slab.slabName}</span>
                      <span className="font-mono font-bold text-white">৳ {slab.taxAmount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-white/10 rounded-2xl text-[11px] leading-4 text-[#bad8c6]">
                <HelpCircle className="h-3.5 w-3.5 inline mr-1 text-[#8ce0a3]" />
                উৎস: জাতীয় রাজস্ব বোর্ড (NBR) ও বাংলাদেশ অর্থ আইন। হিসাবটি ব্যক্তিগত আয়কর রিটার্ন জমাদানের সুবিধার্থে নির্মিত।
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
