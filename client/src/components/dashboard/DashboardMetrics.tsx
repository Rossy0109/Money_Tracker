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
    green: "bg-muted text-positive",
    mint: "bg-background text-positive",
    rose: "bg-[#fff0ee] text-destructive",
    sand: "bg-background text-destructive",
  };
  return (
    <article className="finance-card p-5">
      <div
        className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone] ?? "bg-muted text-positive"}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-foreground">
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
    green: "border-border bg-background text-positive",
    mint: "border-border bg-background text-positive",
    rose: "border-[#f0d4cf] bg-[#fff6f4] text-destructive",
    sand: "border-[#edddbd] bg-background text-destructive",
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
    ? (children.props.id ?? generatedId)
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
  return <p className="py-5 text-center text-sm text-muted-foreground">{text}</p>;
}

export function LoadingState() {
  return (
    <div className="grid min-h-[45vh] place-items-center">
      <Loader2 className="h-8 w-8 animate-spin text-positive" />
    </div>
  );
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="finance-card p-8 text-center">
      <p className="font-semibold text-destructive">তথ্য লোড করা যায়নি</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {message ?? "আবার চেষ্টা করুন"}
      </p>
    </div>
  );
}

export function EmptySignIn() {
  return (
    <div className="finance-card p-8 text-center">
      <LockKeyhole className="mx-auto h-8 w-8 text-positive" />
      <p className="mt-3 font-semibold text-foreground">
        আপনার হিসাব দেখতে সাইন ইন করুন
      </p>
    </div>
  );
}
