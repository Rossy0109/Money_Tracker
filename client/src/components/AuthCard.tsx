import React, { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { useAppLogo } from "@/hooks/useAppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
  ShieldCheck,
  ArrowRight,
  Loader2,
  Sparkles,
  Clock,
  CheckCircle2,
  RefreshCw,
  LogOut,
} from "lucide-react";

type AuthMeData = inferRouterOutputs<AppRouter>["auth"]["me"];

export function AuthCard({
  pendingUser,
}: {
  pendingUser?: { name?: string | null; email?: string | null } | null;
}) {
  const { logoUrl } = useAppLogo();
  const [roleMode, setRoleMode] = useState<"user" | "admin">("user");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingApprovalMsg, setPendingApprovalMsg] = useState<string | null>(
    null
  );

  const utils = trpc.useUtils();

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    },
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async data => {
      setErrorMessage(null);
      setPendingApprovalMsg(null);
      utils.auth.me.setData(undefined, data.user as unknown as AuthMeData);
      await utils.auth.me.invalidate();
    },
    onError: err => {
      setErrorMessage(
        err.message || "লগইন করা যায়নি। তথ্য সঠিক কিনা যাচাই করুন।"
      );
    },
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async data => {
      setErrorMessage(null);
      if (data.pendingApproval) {
        setPendingApprovalMsg(data.message);
        setMode("login");
        setPassword("");
        setConfirmPassword("");
      } else if (data.user) {
        utils.auth.me.setData(undefined, data.user as unknown as AuthMeData);
        await utils.auth.me.invalidate();
      }
    },
    onError: err => {
      setErrorMessage(err.message || "রেজিস্ট্রেশন সম্পন্ন করা যায়নি।");
    },
  });

  const isSubmitting = loginMutation.isPending || registerMutation.isPending;
  // In Google-managed deployments self-service registration is disabled at the
  // API level (auth.register returns FORBIDDEN); hide the sign-up UI too.
  const isGoogleAuth = import.meta.env.VITE_AUTH_MODE === "google";

  const handleRoleSelect = (role: "user" | "admin") => {
    setRoleMode(role);
    setErrorMessage(null);
    if (role === "admin") {
      setMode("login");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErrorMessage("সঠিক ইমেইল ঠিকানা দিন");
      return;
    }

    if (!password || password.length < 6) {
      setErrorMessage("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
      return;
    }

    if (mode === "register") {
      if (!name.trim()) {
        setErrorMessage("আপনার পূর্ণ নাম প্রদান করুন");
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage("দুইটি পাসওয়ার্ড মিলছে না");
        return;
      }
      registerMutation.mutate({
        name: name.trim(),
        email: cleanEmail,
        password,
      });
    } else {
      loginMutation.mutate({
        email: cleanEmail,
        password,
      });
    }
  };

  return (
    <main className="min-h-screen min-h-[100dvh] w-full bg-gradient-to-br from-background via-muted to-muted flex items-center justify-center p-3 sm:p-6 md:p-8">
      <div className="w-full max-w-md my-auto">
        {/* Top App Identity */}
        <div className="text-center mb-5 sm:mb-6">
          <div className="inline-flex items-center justify-center h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-card p-1.5 shadow-xl shadow-green-950/10 mb-3 ring-4 ring-white/90 overflow-hidden">
            <img
              src={logoUrl || "/logo.png"}
              alt="Ahmed's Financial Accounting"
              className="h-full w-full object-contain"
              onError={e => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Ahmed's Financial Accounting
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 font-medium">
            ব্যক্তিগত ও বাণিজ্যিক হিসাবের ১০০% নিরাপদ ক্লাউড
          </p>
        </div>

        {/* Auth Card Box */}
        <div className="bg-white/95 backdrop-blur-md rounded-3xl border border-border shadow-[0_20px_50px_rgba(20,56,47,0.08)] p-5 sm:p-8">
          {pendingUser ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
                <Clock className="h-7 w-7 animate-pulse" />
              </div>
              <h2 className="text-lg font-bold text-foreground">
                অ্যাকাউন্ট অনুমোদনের অপেক্ষায়
              </h2>
              <div className="p-3.5 rounded-2xl bg-card border border-border text-xs text-foreground space-y-1.5 text-left">
                <p className="font-semibold text-foreground">
                  ব্যবহারকারী: {pendingUser.name || "নতুন সদস্য"}
                </p>
                <p className="text-muted-foreground">ইমেইল: {pendingUser.email}</p>
                <p className="text-amber-700 font-medium pt-1 border-t border-border">
                  আপনার নিবন্ধন গ্রহণ করা হয়েছে। প্রধান অ্যাডমিনের অনুমোদন
                  পাওয়ার পর আপনি ড্যাশবোর্ড ব্যবহার করতে পারবেন।
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => utils.auth.me.invalidate()}
                  className="w-full h-11 rounded-xl border-border text-foreground font-semibold text-xs flex items-center justify-center gap-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  অবস্থা যাচাই করুন (Refresh Status)
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => logoutMutation.mutate()}
                  className="w-full h-10 rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50 text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  অন্য অ্যাকাউন্টে প্রবেশ / সাইন আউট
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Role Type Selection: User vs Admin */}
              <div className="mb-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 text-center">
                  লগইন ধরন নির্বাচন করুন
                </div>
                <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-2xl">
                  <button
                    type="button"
                    onClick={() => handleRoleSelect("user")}
                    className={`py-2 px-3 text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                      roleMode === "user"
                        ? "bg-card text-foreground shadow-sm font-bold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <User className="h-4 w-4" />
                    <span>ইউজার / সদস্য</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRoleSelect("admin")}
                    className={`py-2 px-3 text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                      roleMode === "admin"
                        ? "bg-primary text-primary-foreground shadow-sm font-bold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>অ্যাডমিন (Admin)</span>
                  </button>
                </div>
              </div>

              {/* Mode Switcher: Login vs Sign Up (Only for regular users) */}
              {roleMode === "user" && !isGoogleAuth && (
                <div className="grid grid-cols-2 p-1 bg-background rounded-xl mb-5 border border-border">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setErrorMessage(null);
                    }}
                    className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                      mode === "login"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    লগইন (Sign In)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("register");
                      setErrorMessage(null);
                      setPendingApprovalMsg(null);
                    }}
                    className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                      mode === "register"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    নতুন সাইন-আপ (Sign Up)
                  </button>
                </div>
              )}

              {/* Admin Notice */}
              {roleMode === "admin" && (
                <div className="mb-4 p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 text-positive text-xs flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>
                    অ্যাডমিনিস্ট্রেটর পোর্টাল: সম্পূর্ণ নিয়ন্ত্রণ ও সকল
                    সিকিউরিটি অ্যাক্সেস।
                  </span>
                </div>
              )}

              {/* Pending Approval Success Banner */}
              {pendingApprovalMsg && (
                <div className="mb-5 p-4 rounded-2xl bg-background border border-border text-positive text-xs leading-5">
                  <div className="flex items-center gap-2 font-bold mb-1 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-positive" />
                    <span>রেজিস্ট্রেশন সফল হয়েছে</span>
                  </div>
                  <p>{pendingApprovalMsg}</p>
                  <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-positive">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      অ্যাডমিন অনুমোদন সম্পন্ন হলে এখান থেকে লগইন করুন।
                    </span>
                  </div>
                </div>
              )}

              {/* Google 1-Click Login Button (google mode only — in password
                  mode startLogin() is a documented no-op, so the button would
                  be dead) */}
              {isGoogleAuth && (
                <div className="space-y-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => startLogin()}
                    className="w-full h-11 sm:h-12 rounded-xl border-border hover:bg-background text-foreground font-semibold text-xs sm:text-sm flex items-center justify-center gap-3 transition-colors shadow-xs"
                  >
                    <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    Google দিয়ে সাইন ইন করুন
                  </Button>
                </div>
              )}

              {/* Divider — only meaningful when the Google button is shown */}
              {isGoogleAuth && (
                <div className="relative my-5 text-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <span className="relative bg-card px-3 text-[11px] font-medium text-muted-foreground">
                    অথবা ইমেইল ও পাসওয়ার্ড
                  </span>
                </div>
              )}

              {/* Divider */}
              <div className="relative my-5 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <span className="relative bg-card px-3 text-[11px] font-medium text-muted-foreground">
                  অথবা ইমেইল ও পাসওয়ার্ড
                </span>
              </div>

              {/* Error Alert */}
              {errorMessage && (
                <Alert
                  variant="destructive"
                  className="mb-4 py-2.5 px-3.5 rounded-xl border-red-200 bg-red-50 text-red-800 text-xs"
                >
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}

              {/* Form */}
              <form
                onSubmit={handleSubmit}
                className="space-y-3.5 sm:space-y-4"
              >
                {mode === "register" && roleMode === "user" && (
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                      আপনার পূর্ণ নাম
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="text"
                        required
                        placeholder="যেমন: কামরুল হাসান"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="pl-10 h-11 rounded-xl border-border focus-visible:ring-ring bg-background text-sm"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                    ইমেইল এড্রেস
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="pl-10 h-11 rounded-xl border-border focus-visible:ring-ring bg-background text-sm"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                    পাসওয়ার্ড
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="কমপক্ষে ৬ অক্ষর"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-11 rounded-xl border-border focus-visible:ring-ring bg-background text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-positive p-1"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {mode === "register" && roleMode === "user" && (
                  <div>
                    <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                      পাসওয়ার্ড নিশ্চিত করুন
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        required
                        placeholder="একই পাসওয়ার্ড পুনরায় দিন"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className="pl-10 h-11 rounded-xl border-border focus-visible:ring-ring bg-background text-sm"
                      />
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-primary to-primary hover:from-primary/90 hover:to-primary/90 text-primary-foreground font-semibold text-sm shadow-md transition-all mt-2"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      অপেক্ষা করুন...
                    </span>
                  ) : mode === "login" ? (
                    <span className="flex items-center justify-center gap-2">
                      {roleMode === "admin"
                        ? "অ্যাডমিন হিসেবে প্রবেশ করুন"
                        : "লগইন করুন"}{" "}
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      নিবন্ধনের অনুরোধ পাঠান <Sparkles className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </form>

              {/* Mobile browser advice */}
              <div className="mt-4 p-2.5 rounded-xl bg-background text-[11px] leading-4 text-muted-foreground">
                মোবাইলে সাইন-ইনের জন্য Chrome বা Safari-এর সাধারণ ব্রাউজার ট্যাব
                ব্যবহার করুন। cookies ও সেশন ডেটা অনুমতি দিন।
              </div>

              {/* Footer Features Info */}
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-positive" />
                <span>
                  ১০০% এনক্রিপ্টেড এবং সম্পূর্ণ সুরক্ষিত ব্যক্তিগত ক্লাউড
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
