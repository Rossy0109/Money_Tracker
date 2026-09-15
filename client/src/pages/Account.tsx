import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { useState } from "react";

export default function Account() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setPasswordMutation = trpc.auth.setPassword.useMutation({
    onSuccess: (data) => {
      setPassword("");
      setConfirmPassword("");
      setErrorMessage(null);
      toast.success(data.message);
      utils.auth.me.invalidate();
    },
    onError: (err) => {
      setErrorMessage(err.message || "পাসওয়ার্ড সেট করা যায়নি। আবার চেষ্টা করুন।");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!password || password.length < 6) {
      setErrorMessage("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("দুটি পাসওয়ার্ড মিলছে না");
      return;
    }

    setPasswordMutation.mutate({ password });
  };

  const isGoogleOnly = user?.loginMethod === "google";

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="finance-card p-5 sm:p-6">
          <p className="section-kicker">আমার অ্যাকাউন্ট</p>
          <h1 className="section-heading">অ্যাকাউন্ট ও পাসওয়ার্ড</h1>
          <p className="mt-1 text-sm text-[#5c7a6e]">
            আপনার লগইন তথ্য দেখুন এবং একটি পাসওয়ার্ড সেট করুন, যাতে পরে ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করতে পারেন।
          </p>
        </div>

        <div className="finance-card p-5 sm:p-6">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e7f7ec] text-[#197341]">
                <User className="h-5 w-5" />
              </span>
              <div>
                <div className="text-xs text-[#5c7a6e]">নাম</div>
                <div className="font-semibold text-[#14382f]">{user?.name || "—"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e7f7ec] text-[#197341]">
                <Mail className="h-5 w-5" />
              </span>
              <div>
                <div className="text-xs text-[#5c7a6e]">ইমেইল</div>
                <div className="font-semibold text-[#14382f]">{user?.email || "—"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e7f7ec] text-[#197341]">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <div className="text-xs text-[#5c7a6e]">ভূমিকা</div>
                <div className="font-semibold text-[#14382f]">
                  {user?.role === "admin" ? "অ্যাডমিন (Admin)" : "ইউজার / সদস্য"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e7f7ec] text-[#197341]">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <div className="text-xs text-[#5c7a6e]">লগইন পদ্ধতি</div>
                <div className="font-semibold text-[#14382f]">
                  {user?.loginMethod === "google"
                    ? "Google অ্যাকাউন্ট"
                    : user?.loginMethod === "password"
                      ? "ইমেইল ও পাসওয়ার্ড"
                      : user?.loginMethod || "—"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="finance-card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Lock className="h-4 w-4 text-[#197341]" />
            <h2 className="text-base font-bold text-[#14382f]">
              {isGoogleOnly ? "পাসওয়ার্ড সেট করুন" : "নতুন পাসওয়ার্ড"}
            </h2>
          </div>

          {isGoogleOnly && (
            <p className="mb-4 rounded-xl border border-[#d6e5db] bg-[#f6faf7] p-3 text-xs leading-5 text-[#3b5d50]">
              এই অ্যাকাউন্টটি এখন Google দিয়ে লগইন করে। একটি পাসওয়ার্ড সেট করলে আপনি চাইলে ইমেইল ও পাসওয়ার্ড দিয়েও লগইন করতে পারবেন।
            </p>
          )}

          {errorMessage && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="mb-1.5 block text-xs font-semibold text-[#2b4c40]">
                নতুন পাসওয়ার্ড
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8da69c]" />
                <Input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="কমপক্ষে ৬ অক্ষর"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-xl border-[#c9dcd0] pl-10 pr-10 focus-visible:ring-[#166534]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-[#8da69c] hover:text-[#166534]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs font-semibold text-[#2b4c40]">
                পাসওয়ার্ড নিশ্চিত করুন
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8da69c]" />
                <Input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="একই পাসওয়ার্ড পুনরায় দিন"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-11 rounded-xl border-[#c9dcd0] pl-10 pr-10 focus-visible:ring-[#166534]"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={setPasswordMutation.isPending}
              className="h-11 w-full rounded-xl bg-gradient-to-r from-[#173f36] to-[#14532d] text-white font-semibold text-sm shadow-md transition-all hover:from-[#11322b] hover:to-[#0f3f22]"
            >
              {setPasswordMutation.isPending ? "সংরক্ষণ হচ্ছে..." : "পাসওয়ার্ড সেট করুন"}
            </Button>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}