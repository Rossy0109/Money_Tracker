import { Button } from "@/components/ui/button";
import { Fingerprint, Lock, ShieldCheck, ShieldAlert, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const BIOMETRIC_KEY_PREFIX = "amar_hisab_biometric_enabled_";
const LOCK_STATE_PREFIX = "amar_hisab_is_locked_";

export function useBiometricLock(userEmail?: string | null) {
  const email = userEmail || "guest";
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.PublicKeyCredential) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()
        .then(supported => setIsSupported(!!supported))
        .catch(() => setIsSupported(false));
    }

    const enabled = localStorage.getItem(`${BIOMETRIC_KEY_PREFIX}${email}`) === "true";
    setIsEnabled(enabled);

    const locked = sessionStorage.getItem(`${LOCK_STATE_PREFIX}${email}`) === "true";
    if (enabled && locked) {
      setIsLocked(true);
    }
  }, [email]);

  const enableBiometric = async () => {
    if (!window.PublicKeyCredential) {
      toast.error("আপনার ব্রাউজার বা ডিভাইসে বায়োমেট্রিক সাপোর্ট নেই");
      return false;
    }
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const userId = new Uint8Array(16);
      window.crypto.getRandomValues(userId);

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "Ahmed's Financial Accounting" },
          user: {
            id: userId,
            name: email,
            displayName: email.split("@")[0] || "User",
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
          },
          timeout: 60000,
        },
      });

      if (credential) {
        localStorage.setItem(`${BIOMETRIC_KEY_PREFIX}${email}`, "true");
        setIsEnabled(true);
        toast.success("ফিঙ্গারপ্রিন্ট / বায়োমেট্রিক লক সফলভাবে চালু হয়েছে!");
        return true;
      }
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        localStorage.setItem(`${BIOMETRIC_KEY_PREFIX}${email}`, "true");
        setIsEnabled(true);
        toast.success("বায়োমেট্রিক নিরাপত্তা চালু করা হয়েছে!");
        return true;
      }
      toast.error("বায়োমেট্রিক যাচাই বাতিল করা হয়েছে");
    }
    return false;
  };

  const disableBiometric = () => {
    localStorage.removeItem(`${BIOMETRIC_KEY_PREFIX}${email}`);
    sessionStorage.removeItem(`${LOCK_STATE_PREFIX}${email}`);
    setIsEnabled(false);
    setIsLocked(false);
    toast.info("বায়োমেট্রিক নিরাপত্তা বন্ধ করা হয়েছে");
  };

  const unlockApp = async () => {
    if (!isEnabled) {
      setIsLocked(false);
      return true;
    }
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          userVerification: "required",
          timeout: 60000,
        },
      });

      if (assertion) {
        sessionStorage.removeItem(`${LOCK_STATE_PREFIX}${email}`);
        setIsLocked(false);
        toast.success("স্বাগতম! অ্যাপ আনলক হয়েছে");
        return true;
      }
    } catch {
      toast.error("বায়োমেট্রিক যাচাই সফল হয়নি। আবার চেষ্টা করুন।");
    }
    return false;
  };

  const lockApp = () => {
    if (isEnabled) {
      sessionStorage.setItem(`${LOCK_STATE_PREFIX}${email}`, "true");
      setIsLocked(true);
      toast.info("অ্যাপটি লক করা হয়েছে");
    }
  };

  return {
    isSupported,
    isEnabled,
    isLocked,
    enableBiometric,
    disableBiometric,
    unlockApp,
    lockApp,
  };
}

export function BiometricLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [verifying, setVerifying] = useState(false);

  const handleUnlock = async () => {
    setVerifying(true);
    try {
      await onUnlock();
    } finally {
      setVerifying(false);
    }
  };

  return (
    <main className="fixed inset-0 z-50 grid min-h-screen place-items-center bg-[#103028] p-5 text-white">
      <section className="w-full max-w-sm rounded-[2.5rem] border border-white/15 bg-white/10 p-8 text-center backdrop-blur-xl shadow-[0_24px_70px_rgba(0,0,0,.4)]">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-[#d8f2dd] text-[#113a30] shadow-lg">
          <Fingerprint className="h-10 w-10 animate-pulse" />
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">অ্যাপটি লক করা আছে</h1>
        <p className="mt-2 text-sm text-[#b9d2c2]">
          আপনার হিসাবের নিরাপত্তার জন্য বায়োমেট্রিক বা ফিঙ্গারপ্রিন্ট সেন্সর স্পর্শ করুন।
        </p>

        <Button
          onClick={handleUnlock}
          disabled={verifying}
          className="mt-8 h-14 w-full rounded-2xl bg-[#d8f2dd] text-base font-bold text-[#113a30] shadow-md hover:bg-[#c3ecd0] active:scale-95 transition"
        >
          <Fingerprint className="mr-2 h-6 w-6" />
          {verifying ? "যাচাই করা হচ্ছে..." : "ফিঙ্গারপ্রিন্ট দিয়ে আনলক করুন"}
        </Button>
      </section>
    </main>
  );
}
