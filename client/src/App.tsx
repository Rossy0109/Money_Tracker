import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Categories from "./pages/Categories";
import FinanceAutomation from "./pages/FinanceAutomation";
import FinanceBackup from "./pages/FinanceBackup";
import FamilyHousehold from "./pages/FamilyHousehold";
import FinanceInsights from "./pages/FinanceInsights";
import Home from "./pages/Home";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
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
