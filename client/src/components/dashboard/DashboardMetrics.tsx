import { cloneElement, isValidElement, useId } from "react";
import { Label } from "@/components/ui/label";
import { Loader2, LockKeyhole, LucideIcon } from "lucide-react";

export function Metric({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  value: string;
}) {
  const tones: Record<string, string> = {
    green: "bg-[#eaf5ed] text-[#1f7a4c]",
    mint: "bg-[#eaf7f0] text-[#298658]",
    rose: "bg-[#fff0ee] text-[#c66a5f]",
    sand: "bg-[#fff7e9] text-[#a56d20]",
  };
  return (
    <article className="finance-card p-5">
      <div
        className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone] ?? "bg-[#eaf5ed] text-[#1f7a4c]"}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm text-[#6d8278]">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-[#193e34]">
        {value}
      </p>
    </article>
  );
}

export function AccountingMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "mint" | "rose" | "sand";
}) {
  const tones = {
    green: "border-[#cfe7d4] bg-[#f4fbf5] text-[#1f7a4c]",
    mint: "border-[#cdebdc] bg-[#f0faf4] text-[#298658]",
    rose: "border-[#f0d4cf] bg-[#fff6f4] text-[#b85d52]",
    sand: "border-[#edddbd] bg-[#fffaf0] text-[#9b671c]",
  };

  return (
    <article className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
    </article>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const generatedId = useId();
  const isNativeControl =
    isValidElement<{ id?: string }>(children) &&
    typeof children.type === "string";
  const controlId = isNativeControl
    ? children.props.id ?? generatedId
    : undefined;
  const control = isNativeControl
    ? cloneElement(children, { id: controlId })
    : children;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={controlId}>{label}</Label>
      {control}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="py-5 text-center text-sm text-[#7b8d84]">{text}</p>;
}

export function LoadingState() {
  return (
    <div className="grid min-h-[45vh] place-items-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#1f7650]" />
    </div>
  );
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="finance-card p-8 text-center">
      <p className="font-semibold text-[#9e504d]">তথ্য লোড করা যায়নি</p>
      <p className="mt-2 text-sm text-[#75877e]">
        {message ?? "আবার চেষ্টা করুন"}
      </p>
    </div>
  );
}

export function EmptySignIn() {
  return (
    <div className="finance-card p-8 text-center">
      <LockKeyhole className="mx-auto h-8 w-8 text-[#2b7650]" />
      <p className="mt-3 font-semibold text-[#183e34]">
        আপনার হিসাব দেখতে সাইন ইন করুন
      </p>
    </div>
  );
}
