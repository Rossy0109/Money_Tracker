import { useState, useEffect, useCallback } from "react";

const LOGO_STORAGE_KEY = "ahmed_finance_custom_logo";
const DEFAULT_LOGO_URL = "/logo.png";
const LOGO_CHANGE_EVENT = "ahmed_finance_logo_updated";

export function useAppLogo() {
  const [logoUrl, setLogoUrl] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_LOGO_URL;
    try {
      return localStorage.getItem(LOGO_STORAGE_KEY) || DEFAULT_LOGO_URL;
    } catch {
      return DEFAULT_LOGO_URL;
    }
  });

  useEffect(() => {
    const handleLogoUpdate = () => {
      try {
        const stored = localStorage.getItem(LOGO_STORAGE_KEY);
        setLogoUrl(stored || DEFAULT_LOGO_URL);
      } catch {
        setLogoUrl(DEFAULT_LOGO_URL);
      }
    };

    window.addEventListener(LOGO_CHANGE_EVENT, handleLogoUpdate);
    window.addEventListener("storage", handleLogoUpdate);
    return () => {
      window.removeEventListener(LOGO_CHANGE_EVENT, handleLogoUpdate);
      window.removeEventListener("storage", handleLogoUpdate);
    };
  }, []);

  const uploadLogo = useCallback(async (file: File): Promise<string> => {
    if (!file.type.startsWith("image/")) {
      throw new Error("শুধুমাত্র ইমেজ ফাইল (PNG, JPG, SVG, WebP) আপলোড করা যাবে");
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new Error("ফাইলের সাইজ সর্বোচ্চ ২ মেগাবাইট (2MB) হতে পারে");
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result as string;
        try {
          localStorage.setItem(LOGO_STORAGE_KEY, base64Data);
          setLogoUrl(base64Data);
          window.dispatchEvent(new CustomEvent(LOGO_CHANGE_EVENT));
          resolve(base64Data);
        } catch (err) {
          reject(new Error("ব্রাউজার স্টোরেজে লোগো সংরক্ষণ করা যায়নি"));
        }
      };
      reader.onerror = () => reject(new Error("ছবিটি লোড করা সম্ভব হয়নি"));
      reader.readAsDataURL(file);
    });
  }, []);

  const resetLogo = useCallback(() => {
    try {
      localStorage.removeItem(LOGO_STORAGE_KEY);
      setLogoUrl(DEFAULT_LOGO_URL);
      window.dispatchEvent(new CustomEvent(LOGO_CHANGE_EVENT));
    } catch {}
  }, []);

  const isCustom = logoUrl !== DEFAULT_LOGO_URL;

  return {
    logoUrl,
    uploadLogo,
    resetLogo,
    isCustom,
  };
}
