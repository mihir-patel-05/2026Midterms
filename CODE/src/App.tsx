import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import Elections from "./pages/Elections";
import Candidates from "./pages/Candidates";
import CandidatesPage from "./pages/CandidatesPage";
import VoterResources from "./pages/VoterResources";
import RaceDetail from "./pages/RaceDetail";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
import ResearcherLogin from "./pages/research/ResearcherLogin";
import ResearchDashboard from "./pages/research/ResearchDashboard";
import RaceTracker from "./pages/research/RaceTracker";
import Simulator from "./pages/research/Simulator";
import { RequireResearcher } from "./components/research/RequireResearcher";
import { newFrontendEnabled } from "./lib/featureFlags";

const ElectionDashboard = lazy(() => import("./pages/ElectionDashboard"));

const queryClient = new QueryClient();

const dashboard = (
  <Suspense fallback={<main className="min-h-screen bg-background p-8 text-foreground">Loading dashboard…</main>}>
    <ElectionDashboard />
  </Suspense>
);

/** Old dashboard links keep working once the dashboard becomes the home page. */
function DashboardRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/", search, hash }} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {newFrontendEnabled ? (
            <>
              <Route path="/" element={dashboard} />
              {/* Legacy landing page, kept reachable for one release. */}
              <Route path="/classic" element={<Index />} />
              <Route path="/election-dashboard" element={<DashboardRedirect />} />
            </>
          ) : (
            <>
              <Route path="/" element={<Index />} />
              <Route path="/election-dashboard" element={dashboard} />
            </>
          )}
          <Route path="/elections" element={<Elections />} />
          <Route path="/elections/:state" element={<Elections />} />
          <Route path="/elections/:state/:electionId" element={<RaceDetail />} />
          <Route path="/candidates" element={<CandidatesPage />} />
          <Route path="/candidates/:id" element={<Candidates />} />
          <Route path="/voter-resources" element={<VoterResources />} />
          <Route path="/about" element={<About />} />
          <Route path="/research/login" element={<ResearcherLogin />} />
          <Route
            path="/research"
            element={
              <RequireResearcher>
                <ResearchDashboard />
              </RequireResearcher>
            }
          />
          <Route
            path="/research/races"
            element={
              <RequireResearcher>
                <RaceTracker />
              </RequireResearcher>
            }
          />
          <Route
            path="/research/simulate"
            element={
              <RequireResearcher>
                <Simulator />
              </RequireResearcher>
            }
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
