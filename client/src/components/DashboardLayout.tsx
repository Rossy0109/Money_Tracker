import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar-context";
import { useTheme } from "@/contexts/theme-context";
import { useAuth } from "@/_core/hooks/useAuth";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useAppLogo } from "@/hooks/useAppLogo";
import { PwaInstallButton } from "@/components/PwaInstallButton";
import { AuthCard } from "@/components/AuthCard";
import {
  Activity,
  Banknote,
  BookOpen,
  Boxes,
  Calculator,
  CalendarClock,
  ChartNoAxesCombined,
  ChartSpline,
  CloudOff,
  FileSpreadsheet,
  HardDriveDownload,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Moon,
  Plus,
  Printer,
  Receipt,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Sun,
  Tags,
  UserCheck,
  Users,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  isAdminUser,
  isInputOnlyUser,
  hasPermission,
  getDisplayRole,
  type AuthGatingUser,
} from "@/lib/rbac";

interface MenuItem {
  icon: LucideIcon;
  label: string;
  href: string;
  permission?: string;
}

const menuItems: MenuItem[] = [
  {
    icon: LayoutDashboard,
    label: "ড্যাশবোর্ড",
    href: "/",
    permission: "accounting.read",
  },
  {
    icon: ReceiptText,
    label: "ভাউচার",
    href: "/vouchers",
    permission: "voucher.read",
  },
  {
    icon: ReceiptText,
    label: "লেনদেন",
    href: "/#transactions",
    permission: "accounting.read",
  },
  {
    icon: BookOpen,
    label: "চার্ট অফ অ্যাকাউন্টস",
    href: "/chart-of-accounts",
    permission: "accounting.read",
  },
  {
    icon: Lock,
    label: "পিরিয়ড লক",
    href: "/period-lock",
    permission: "accounting.read",
  },
  {
    icon: RotateCcw,
    label: "ভাউচার রিভার্সাল",
    href: "/voucher-reversal",
    permission: "voucher.read",
  },
  {
    icon: Users,
    label: "পার্টি খতিয়ান",
    href: "/party-ledger",
    permission: "accounting.read",
  },
  {
    icon: UserCheck,
    label: "কর্মচারী ও বেতন",
    href: "/payroll",
    permission: "payroll.read",
  },
  {
    icon: Receipt,
    label: "ইনভয়েস ও বিলিং",
    href: "/invoices",
    permission: "accounting.read",
  },
  {
    icon: Boxes,
    label: "পণ্য ও ইনভেন্টরি",
    href: "/inventory",
    permission: "accounting.read",
  },
  {
    icon: FileSpreadsheet,
    label: "আর্থিক বিবরণী",
    href: "/statements",
    permission: "accounting.read",
  },
  {
    icon: Printer,
    label: "রিপোর্ট ও প্রিন্ট",
    href: "/reports",
    permission: "accounting.read",
  },
  {
    icon: Calculator,
    label: "আয়কর ক্যালকুলেটর",
    href: "/tax-calculator",
    permission: "accounting.read",
  },
  {
    icon: WalletCards,
    label: "অ্যাকাউন্ট",
    href: "/#accounts",
    permission: "accounting.read",
  },
  {
    icon: ChartNoAxesCombined,
    label: "বাজেট",
    href: "/#budgets",
    permission: "budget.read",
  },
  {
    icon: ChartSpline,
    label: "পরিকল্পনা ও বিশ্লেষণ",
    href: "/insights",
    permission: "accounting.read",
  },
  {
    icon: CalendarClock,
    label: "নিয়মিত হিসাব ও বিল",
    href: "/automation",
    permission: "accounting.read",
  },
  {
    icon: UsersRound,
    label: "পরিবার ও শেয়ার করা বাজেট",
    href: "/family",
    permission: "accounting.read",
  },
  {
    icon: HardDriveDownload,
    label: "ব্যাকআপ ও পুনরুদ্ধার",
    href: "/backup",
    permission: "backup.view",
  },
  {
    icon: Activity,
    label: "সিস্টেম হেলথ",
    href: "/health",
    permission: "settings.view",
  },
  {
    icon: Tags,
    label: "ক্যাটাগরি",
    href: "/categories",
    permission: "accounting.read",
  },
  {
    icon: KeyRound,
    label: "আমার অ্যাকাউন্ট",
    href: "/account",
  },
];

const inputOnlyMenuItems: MenuItem[] = [
  {
    icon: ReceiptText,
    label: "লেনদেন যোগ করুন",
    href: "/#transactions",
    permission: "accounting.create",
  },
  {
    icon: WalletCards,
    label: "অ্যাকাউন্ট যোগ করুন",
    href: "/#accounts",
    permission: "accounting.create",
  },
  {
    icon: ChartNoAxesCombined,
    label: "বাজেট যোগ করুন",
    href: "/#budgets",
    permission: "budget.create",
  },
  {
    icon: KeyRound,
    label: "আমার অ্যাকাউন্ট",
    href: "/account",
  },
];

/**
 * Phone tab bar. Five taps beat a 21-item drawer: four short labels for the
 * most-used destinations plus "more" for everything else in the sidebar.
 * Filtered with the same permission rule as the sidebar, so a user who cannot
 * see a page in the drawer never sees it here either.
 */
const bottomTabs: MenuItem[] = [
  {
    icon: LayoutDashboard,
    label: "ড্যাশবোর্ড",
    href: "/",
    permission: "accounting.read",
  },
  {
    icon: ReceiptText,
    label: "ভাউচার",
    href: "/vouchers",
    permission: "voucher.read",
  },
  {
    icon: Receipt,
    label: "লেনদেন",
    href: "/#transactions",
    permission: "accounting.create",
  },
  {
    icon: Printer,
    label: "রিপোর্ট",
    href: "/reports",
    permission: "accounting.read",
  },
];

const inputOnlyBottomTabs: MenuItem[] = [
  {
    icon: ReceiptText,
    label: "লেনদেন",
    href: "/#transactions",
    permission: "accounting.create",
  },
  {
    icon: WalletCards,
    label: "অ্যাকাউন্ট",
    href: "/#accounts",
    permission: "accounting.create",
  },
  {
    icon: ChartNoAxesCombined,
    label: "বাজেট",
    href: "/#budgets",
    permission: "budget.create",
  },
  {
    icon: KeyRound,
    label: "প্রোফাইল",
    href: "/account",
  },
];

function BottomTabBar({ tabs }: { tabs: MenuItem[] }) {
  const [path] = useLocation();
  const { setOpenMobile } = useSidebar();

  const isActive = (href: string) => {
    const [route, hash] = href.split("#");
    const base = route || "/";
    if (path !== base) return false;
    if (hash) return window.location.hash === `#${hash}`;
    return true;
  };

  return (
    <nav
      aria-label="দ্রুত নেভিগেশন"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#0c2b22] bg-primary pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_18px_rgba(17,58,48,0.18)] md:hidden"
    >
      <ul className="flex items-stretch">
        {tabs.map(tab => {
          const active = isActive(tab.href);
          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 pt-1.5 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border ${
                  active
                    ? "rounded-t-xl bg-muted font-semibold text-foreground"
                    : "text-[#b9d2c2] hover:bg-white/10 hover:text-white"
                }`}
              >
                <tab.icon className="h-5 w-5" aria-hidden="true" />
                <span className="w-full truncate text-[10px] leading-tight">
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            aria-label="সব মেনু খুলুন"
            className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 pt-1.5 text-center text-[#b9d2c2] hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            <span className="w-full truncate text-[10px] leading-tight">
              আরও
            </span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

function DashboardSidebarContent({
  visibleMenuItems,
  logoUrl,
  user,
  logout,
}: {
  visibleMenuItems: MenuItem[];
  logoUrl: string | null;
  user: AuthGatingUser;
  logout: () => void;
}) {
  const { setOpenMobile, isMobile } = useSidebar();
  const { theme, toggleTheme } = useTheme();

  const handleNavClick = (href: string) => {
    if (isMobile) {
      setOpenMobile(false);
    }
    // Handle in-page hash links smoothly if already on home
    if (href.startsWith("/#") && window.location.pathname === "/") {
      const targetId = href.replace("/#", "");
      const elem = document.getElementById(targetId);
      if (elem) {
        elem.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0 bg-sidebar text-white">
      <SidebarHeader className="h-20 justify-center px-3">
        <Link
          href="/"
          onClick={() => handleNavClick("/")}
          className="flex items-center gap-3 rounded-xl px-2 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-border"
        >
          <img
            src={logoUrl || "/logo.png"}
            alt="Ahmed's Financial Accounting"
            className="h-9 w-9 rounded-xl object-contain bg-white/10 p-0.5 shadow-sm"
            onError={e => {
              (e.currentTarget as HTMLElement).style.display = "none";
            }}
          />
          <span className="group-data-[collapsible=icon]:hidden">
            <span className="block text-sm font-bold tracking-wide">
              Ahmed's Financial
            </span>
            <span className="block text-[11px] text-[#b9d2c2]">
              ব্যক্তিগত হিসাব
            </span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-2 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="নতুন লেনদেন যোগ করুন"
              className="mb-2 h-11 rounded-xl bg-muted font-semibold text-foreground hover:bg-background hover:text-foreground"
            >
              <Link
                href="/#transactions"
                onClick={() => handleNavClick("/#transactions")}
              >
                <Plus className="h-4.5 w-4.5" />
                <span>লেনদেন যোগ করুন</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {visibleMenuItems.map(item => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                tooltip={item.label}
                className="h-11 rounded-xl text-[#dcebe0] hover:bg-white/10 hover:text-white data-[active=true]:bg-muted data-[active=true]:text-foreground"
              >
                <Link href={item.href} onClick={() => handleNavClick(item.href)}>
                  <item.icon className="h-4.5 w-4.5" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-3">
        <div className="rounded-xl bg-white/8 p-2.5 group-data-[collapsible=icon]:p-1.5 space-y-2">
          <div className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8 border border-white/20">
              <AvatarFallback className="bg-[#285d4e] text-xs text-white">
                {(user.name || user.email || "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-xs font-semibold text-white">
                  {user.name || "আমার অ্যাকাউন্ট"}
                </p>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase ${
                    isAdminUser(user)
                      ? "bg-emerald-400/25 text-emerald-200 border border-emerald-400/30"
                      : isInputOnlyUser(user)
                        ? "bg-amber-400/25 text-amber-200 border border-amber-400/30"
                        : "bg-white/15 text-[#b9d2c2]"
                  }`}
                >
                  {getDisplayRole(user)}
                </span>
              </div>
              <p className="truncate text-[10px] text-[#b9d2c2]">
                {user.email}
              </p>
            </div>
            <button
              onClick={toggleTheme}
              aria-label="থিম পরিবর্তন"
              className="rounded-lg p-1.5 text-[#c9ddd0] transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-border group-data-[collapsible=icon]:hidden"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={logout}
              aria-label="সাইন আউট"
              className="rounded-lg p-1.5 text-[#c9ddd0] transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-border group-data-[collapsible=icon]:hidden"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, user, logout } = useAuth();
  const { logoUrl } = useAppLogo();
  const { isOnline, pendingCount, syncQueue } = useOfflineSync();

  if (loading)
    return (
      <div className="grid min-h-screen place-items-center bg-background text-foreground">
        <Banknote className="h-8 w-8 animate-pulse" />
      </div>
    );
  if (!user || user.status === "pending") {
    // মোবাইলে সাইন-ইনের জন্য Chrome বা Safari-এর সাধারণ ব্রাউজার ট্যাব ব্যবহার করুন। Private/Incognito বা অন্য অ্যাপের ভেতরের ব্রাউজার ব্যবহার করবেন না এবং cookies অনুমতি দিন।
    return <AuthCard pendingUser={user?.status === "pending" ? user : null} />;
  }

  if (user.status === "suspended") {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-4 text-center">
        <div className="max-w-md w-full bg-card rounded-3xl p-8 shadow-xl border border-red-100 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
            <LogOut className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-rose-700">
            অ্যাকাউন্ট স্থগিত (Suspended)
          </h2>
          <p className="text-sm text-muted-foreground">
            আপনার অ্যাকাউন্টটি বর্তমানে অ্যাডমিন কর্তৃক স্থগিত করা হয়েছে।
            বিস্তারিত জানতে বা পুনরায় সচল করতে অ্যাডমিনের সাথে যোগাযোগ করুন।
          </p>
          <Button
            onClick={logout}
            className="w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90/90 h-11 font-semibold"
          >
            সাইন আউট করুন
          </Button>
        </div>
      </div>
    );
  }

  const isInputOnly = isInputOnlyUser(user);
  const visibleMenuItems = isInputOnly
    ? inputOnlyMenuItems
    : menuItems.filter(
        item => !item.permission || hasPermission(user, item.permission)
      );
  const visibleBottomTabs = (
    isInputOnly ? inputOnlyBottomTabs : bottomTabs
  ).filter(item => !item.permission || hasPermission(user, item.permission));

  return (
    <SidebarProvider defaultOpen>
      <DashboardSidebarContent
        visibleMenuItems={visibleMenuItems}
        logoUrl={logoUrl}
        user={user}
        logout={logout}
      />
      <SidebarInset className="flex min-h-svh min-w-0 flex-col bg-background pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="sticky top-0 z-30 flex min-h-16 items-center border-b border-border bg-background/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-4 md:hidden">
          <SidebarTrigger
            aria-label="নেভিগেশন মেনু খুলুন"
            className="h-11 w-11 rounded-xl text-foreground"
          />
          <img
            src={logoUrl || "/logo.png"}
            alt="Logo"
            className="ml-1 h-7 w-7 rounded-lg object-contain"
            onError={e => {
              (e.currentTarget as HTMLElement).style.display = "none";
            }}
          />
          <div className="ml-2 min-w-0">
            <span className="block truncate text-sm font-bold text-foreground">
              Ahmed's Financial
            </span>
            <span className="block text-[11px] text-muted-foreground">
              দ্রুত ও নিরাপদ হিসাব
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <PwaInstallButton />
          </div>
        </div>
        {(!isOnline || pendingCount > 0) && (
          <div className="bg-amber-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              {!isOnline ? (
                <CloudOff className="h-4 w-4" />
              ) : (
                <RefreshCw className="h-4 w-4 animate-spin" />
              )}
              <span>
                {!isOnline
                  ? "অফলাইন মোড — ইন্টারনেট সংযোগ নেই, লেনদেন ডিভাইসে সংরক্ষিত থাকবে।"
                  : `${pendingCount}টি অফলাইন লেনদেন ক্লাউডে সিঙ্ক করা বাকি`}
              </span>
            </div>
            {isOnline && pendingCount > 0 && (
              <button
                type="button"
                onClick={() => syncQueue()}
                className="underline hover:opacity-90 ml-3"
              >
                এখনই সিঙ্ক করুন
              </button>
            )}
          </div>
        )}
        <div className="mx-auto w-full max-w-[1600px] flex-1 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6 lg:p-9">
          {children}
        </div>
        <footer className="border-t border-border px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} Kamrul Ahmed. সর্বস্বত্ব সংরক্ষিত।
        </footer>
        <BottomTabBar tabs={visibleBottomTabs} />
      </SidebarInset>
    </SidebarProvider>
  );
}
