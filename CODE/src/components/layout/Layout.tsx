import { ReactNode } from "react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { ChatButton } from "@/components/chat/ChatButton";
import { AppShell } from "@/components/shell/AppShell";
import { newFrontendEnabled } from "@/lib/featureFlags";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  if (newFrontendEnabled) return <AppShell>{children}</AppShell>;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <ChatButton />
    </div>
  );
}
