import { useEffect, useMemo, useState } from "react";
import { Download, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as typeof window & { MSStream?: unknown }).MSStream;
}

export function PwaInstallButton() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia?.("(display-mode: standalone)").matches ?? false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const ios = useMemo(isIosDevice, []);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
      setShowIosHelp(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!installEvent && !ios)) return null;

  const promptInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome !== "accepted") setInstallEvent(null);
  };

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-11 w-11 rounded-xl border-[#cfe0d3] bg-white text-[#173f36] hover:bg-[#edf8ef]"
        aria-label="মোবাইলের হোমস্ক্রিনে অ্যাপ যোগ করুন"
        title="হোমস্ক্রিনে যোগ করুন"
        onClick={installEvent ? promptInstall : () => setShowIosHelp(value => !value)}
      >
        {ios ? <Info className="h-4.5 w-4.5" /> : <Download className="h-4.5 w-4.5" />}
      </Button>
      {showIosHelp && (
        <div role="status" className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-[#cfe0d3] bg-white p-3 text-xs leading-5 text-[#365b4b] shadow-lg">
          Safari-এর শেয়ার বাটন চাপুন, তারপর <strong>হোম স্ক্রিনে যোগ করুন</strong> নির্বাচন করুন।
        </div>
      )}
    </div>
  );
}
