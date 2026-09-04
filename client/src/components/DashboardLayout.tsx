import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useAppLogo } from "@/hooks/useAppLogo";
import { PwaInstallButton } from "@/components/PwaInstallButton";
import { AuthCard } from "@/components/AuthCard";
import { Banknote, Boxes, Calculator, CalendarClock, ChartNoAxesCombined, ChartSpline, CloudOff, FileSpreadsheet, HardDriveDownload, LayoutDashboard, LogOut, Plus, Receipt, ReceiptText, RefreshCw, Tags, Users, UsersRound, WalletCards } from "lucide-react";

const menuItems = [
  { icon: LayoutDashboard, label: "ড্যাশবোর্ড", href: "/" },
  { icon: ReceiptText, label: "লেনদেন", href: "/#transactions" },
  { icon: Users, label: "পার্টি খতিয়ান", href: "/party-ledger" },
  { icon: Receipt, label: "ইনভয়েস ও বিলিং", href: "/invoices" },
  { icon: Boxes, label: "পণ্য ও ইনভেন্টরি", href: "/inventory" },
  { icon: FileSpreadsheet, label: "আর্থিক বিবরণী", href: "/statements" },
  { icon: Calculator, label: "আয়কর ক্যালকুলেটর", href: "/tax-calculator" },
  { icon: WalletCards, label: "অ্যাকাউন্ট", href: "/#accounts" },
  { icon: ChartNoAxesCombined, label: "বাজেট", href: "/#budgets" },
  { icon: ChartSpline, label: "পরিকল্পনা ও বিশ্লেষণ", href: "/insights" },
  { icon: CalendarClock, label: "নিয়মিত হিসাব ও বিল", href: "/automation" },
  { icon: UsersRound, label: "পরিবার ও শেয়ার করা বাজেট", href: "/family" },
  { icon: HardDriveDownload, label: "ব্যাকআপ ও পুনরুদ্ধার", href: "/backup" },
  { icon: Tags, label: "ক্যাটাগরি", href: "/categories" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, logout } = useAuth();
  const { logoUrl } = useAppLogo();
  const { isOnline, pendingCount, syncQueue } = useOfflineSync();

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f7f8f4] text-[#173f36]"><Banknote className="h-8 w-8 animate-pulse" /></div>;
  if (!user || user.status === "pending") {
    // মোবাইলে সাইন-ইনের জন্য Chrome বা Safari-এর সাধারণ ব্রাউজার ট্যাব ব্যবহার করুন। Private/Incognito বা অন্য অ্যাপের ভেতরের ব্রাউজার ব্যবহার করবেন না এবং cookies অনুমতি দিন।
    return <AuthCard pendingUser={user?.status === "pending" ? user : null} />;
  }

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" className="border-r-0 bg-[#113a30] text-white">
        <SidebarHeader className="h-20 justify-center px-3">
          <a href="/" className="flex items-center gap-3 rounded-xl px-2 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bcecc6]">
            <img src={logoUrl || "/logo.png"} alt="Ahmed's Financial Accounting" className="h-9 w-9 rounded-xl object-contain bg-white/10 p-0.5 shadow-sm" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
            <span className="group-data-[collapsible=icon]:hidden"><span className="block text-sm font-bold tracking-wide">Ahmed's Financial</span><span className="block text-[11px] text-[#b9d2c2]">ব্যক্তিগত হিসাব</span></span>
          </a>
        </SidebarHeader>
        <SidebarContent className="px-2 py-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="নতুন লেনদেন যোগ করুন" className="mb-2 h-11 rounded-xl bg-[#d8f2dd] font-semibold text-[#113a30] hover:bg-[#effcf1] hover:text-[#113a30]">
                <a href="/#transactions"><Plus className="h-4.5 w-4.5" /><span>লেনদেন যোগ করুন</span></a>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {menuItems.map(item => <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild tooltip={item.label} className="h-11 rounded-xl text-[#dcebe0] hover:bg-white/10 hover:text-white data-[active=true]:bg-[#d8f2dd] data-[active=true]:text-[#113a30]">
                <a href={item.href}><item.icon className="h-4.5 w-4.5" /><span>{item.label}</span></a>
              </SidebarMenuButton>
            </SidebarMenuItem>)}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <div className="rounded-xl bg-white/8 p-2.5 group-data-[collapsible=icon]:p-1.5 space-y-2">
            <div className="flex items-center gap-2.5">
              <Avatar className="h-8 w-8 border border-white/20"><AvatarFallback className="bg-[#285d4e] text-xs text-white">{(user.name || user.email || "U").charAt(0).toUpperCase()}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-xs font-semibold text-white">{user.name || "আমার অ্যাকাউন্ট"}</p><p className="truncate text-[10px] text-[#b9d2c2]">{user.email}</p></div>
              <button onClick={logout} aria-label="সাইন আউট" className="rounded-lg p-1.5 text-[#c9ddd0] transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bcecc6] group-data-[collapsible=icon]:hidden"><LogOut className="h-4 w-4" /></button>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="flex min-h-svh min-w-0 flex-col bg-[#f7f8f4]">
        <div className="sticky top-0 z-30 flex min-h-16 items-center border-b border-[#dde7df] bg-[#f7f8f4]/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-4 lg:hidden">
          <SidebarTrigger aria-label="নেভিগেশন মেনু খুলুন" className="h-11 w-11 rounded-xl text-[#173f36]" />
          <img src={logoUrl || "/logo.png"} alt="Logo" className="ml-1 h-7 w-7 rounded-lg object-contain" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
          <div className="ml-2 min-w-0"><span className="block truncate text-sm font-bold text-[#173f36]">Ahmed's Financial</span><span className="block text-[11px] text-[#668076]">দ্রুত ও নিরাপদ হিসাব</span></div>
          <div className="ml-auto flex items-center gap-2">
            <PwaInstallButton />
          </div>
        </div>
        {(!isOnline || pendingCount > 0) && (
          <div className="bg-amber-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              {!isOnline ? <CloudOff className="h-4 w-4" /> : <RefreshCw className="h-4 w-4 animate-spin" />}
              <span>
                {!isOnline
                  ? "অফলাইন মোড — ইন্টারনেট সংযোগ নেই, লেনদেন ডিভাইসে সংরক্ষিত থাকবে।"
                  : `${pendingCount}টি অফলাইন লেনদেন ক্লাউডে সিঙ্ক করা বাকি`}
              </span>
            </div>
            {isOnline && pendingCount > 0 && (
              <button type="button" onClick={() => syncQueue()} className="underline hover:opacity-90 ml-3">
                এখনই সিঙ্ক করুন
              </button>
            )}
          </div>
        )}
        <div className="mx-auto w-full max-w-[1600px] flex-1 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6 lg:p-9">{children}</div>
        <footer className="border-t border-[#dde7df] px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-[#667f75] sm:px-6">© {new Date().getFullYear()} Kamrul Ahmed. সর্বস্বত্ব সংরক্ষিত।</footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
