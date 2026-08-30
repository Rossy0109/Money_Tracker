import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

const Home = lazy(() => import("./pages/Home"));
const FinanceInsights = lazy(() => import("./pages/FinanceInsights"));
const FinanceAutomation = lazy(() => import("./pages/FinanceAutomation"));
const FinanceBackup = lazy(() => import("./pages/FinanceBackup"));
const FamilyHousehold = lazy(() => import("./pages/FamilyHousehold"));
const Categories = lazy(() => import("./pages/Categories"));
const Invoices = lazy(() => import("./pages/Invoices"));
const FinancialStatements = lazy(() => import("./pages/FinancialStatements"));
const TaxCalculator = lazy(() => import("./pages/TaxCalculator"));
const Inventory = lazy(() => import("./pages/Inventory"));

function Router() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#f7f8f4] text-[#173f36]"><div className="animate-pulse font-semibold text-sm">লোড হচ্ছে...</div></div>}>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/invoices"} component={Invoices} />
        <Route path={"/inventory"} component={Inventory} />
        <Route path={"/statements"} component={FinancialStatements} />
        <Route path={"/tax-calculator"} component={TaxCalculator} />
        <Route path={"/insights"} component={FinanceInsights} />
        <Route path={"/automation"} component={FinanceAutomation} />
        <Route path={"/backup"} component={FinanceBackup} />
        <Route path={"/family"} component={FamilyHousehold} />
        <Route path={"/categories"} component={Categories} />
        <Route path={"/categories/:type"} component={Categories} />
        <Route path={"/404"} component={NotFound} />
        {/* Final fallback route */}
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
