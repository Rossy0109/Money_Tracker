import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface QuickDataEntryBannerProps {
  openNewTransaction: () => void;
}

export function QuickDataEntryBanner({
  openNewTransaction,
}: QuickDataEntryBannerProps) {
  return (
    <section className="rounded-2xl border border-[#d9e7da] bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-5">
      <div>
        <p className="section-kicker">দ্রুত ডেটা এন্ট্রি</p>
        <h2 className="section-title">হিসাব লেখা শুরু করুন</h2>
        <p className="mt-1 text-sm text-[#668076]">
          আয় বা ব্যয় লিখতে <strong>লেনদেন যোগ করুন</strong> চাপুন।
          অ্যাকাউন্ট, বাজেট ও বিল যোগ করার বাটন নিচের সংশ্লিষ্ট সেকশনে আছে।
        </p>
      </div>
      <Button
        onClick={openNewTransaction}
        className="mt-3 h-11 w-full rounded-xl bg-[#173f36] hover:bg-[#0f3028] sm:mt-0 sm:w-auto"
      >
        <Plus className="mr-1.5 h-4 w-4" />
        এখনই লেনদেন যোগ করুন
      </Button>
    </section>
  );
}
