import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { Banknote, ChartNoAxesCombined, LayoutDashboard, LogOut, ReceiptText, Tags, WalletCards } from "lucide-react";

const menuItems = [
  { icon: LayoutDashboard, label: "ড্যাশবোর্ড", href: "#overview" },
  { icon: ReceiptText, label: "লেনদেন", href: "#transactions" },
  { icon: WalletCards, label: "অ্যাকাউন্ট", href: "#accounts" },
  { icon: ChartNoAxesCombined, label: "বাজেট", href: "#budgets" },
  { icon: Tags, label: "ক্যাটাগরি", href: "#categories" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, logout } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f7f8f4] text-[#173f36]"><Banknote className="h-8 w-8 animate-pulse" /></div>;
  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f8f4] p-5">
        <section className="w-full max-w-md rounded-[2rem] border border-[#d9e4db] bg-white p-8 text-center shadow-[0_24px_70px_rgba(16,53,47,.12)]">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#d8f2dd] text-[#166534]"><Banknote className="h-7 w-7" /></div>
          <p className="mt-7 text-sm font-bold tracking-[.18em] text-[#4f7b67]">আমার হিসাব</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#14382f]">নিরাপদে আপনার অর্থ দেখুন</h1>
          <p className="mt-4 text-sm leading-6 text-[#678077]">আপনার নিজের Gmail-সামঞ্জস্যপূর্ণ Manus অ্যাকাউন্ট দিয়ে সাইন ইন করুন। প্রতিটি হিসাব শুধুই আপনার জন্য আলাদা ও সুরক্ষিত থাকবে।</p>
          <Button onClick={() => startLogin()} className="mt-7 h-12 w-full rounded-xl bg-[#173f36] text-base hover:bg-[#0f3028]">সাইন ইন করে শুরু করুন</Button>
        </section>
      </main>
    );
  }
  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" className="border-r-0 bg-[#113a30] text-white">
        <SidebarHeader className="h-20 justify-center px-3">
          <a href="#overview" className="flex items-center gap-3 rounded-xl px-2 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bcecc6]">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#d8f2dd] text-[#113a30]"><Banknote className="h-5 w-5" /></span>
            <span className="group-data-[collapsible=icon]:hidden"><span className="block text-sm font-bold tracking-wide">আমার হিসাব</span><span className="block text-[11px] text-[#b9d2c2]">Personal finance</span></span>
          </a>
        </SidebarHeader>
        <SidebarContent className="px-2 py-3">
          <SidebarMenu>
            {menuItems.map(item => <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild tooltip={item.label} className="h-11 rounded-xl text-[#dcebe0] hover:bg-white/10 hover:text-white data-[active=true]:bg-[#d8f2dd] data-[active=true]:text-[#113a30]">
                <a href={item.href}><item.icon className="h-4.5 w-4.5" /><span>{item.label}</span></a>
              </SidebarMenuButton>
            </SidebarMenuItem>)}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <div className="rounded-xl bg-white/8 p-2.5 group-data-[collapsible=icon]:p-1.5">
            <div className="flex items-center gap-2.5">
              <Avatar className="h-8 w-8 border border-white/20"><AvatarFallback className="bg-[#285d4e] text-xs text-white">{(user.name || user.email || "U").charAt(0).toUpperCase()}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-xs font-semibold text-white">{user.name || "আমার অ্যাকাউন্ট"}</p><p className="truncate text-[10px] text-[#b9d2c2]">{user.email}</p></div>
              <button onClick={logout} aria-label="সাইন আউট" className="rounded-lg p-1.5 text-[#c9ddd0] transition hover:bg-white/10 hover:text-white group-data-[collapsible=icon]:hidden"><LogOut className="h-4 w-4" /></button>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-[#f7f8f4]">
        <div className="sticky top-0 z-30 flex h-14 items-center border-b border-[#dde7df] bg-[#f7f8f4]/90 px-4 backdrop-blur lg:hidden"><SidebarTrigger className="rounded-xl text-[#173f36]" /><span className="ml-3 text-sm font-bold text-[#173f36]">আমার হিসাব</span></div>
        <main className="mx-auto min-h-screen w-full max-w-[1600px] p-4 sm:p-6 lg:p-9">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
