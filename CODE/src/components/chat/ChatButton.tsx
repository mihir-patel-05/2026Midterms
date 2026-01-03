import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle, X } from "lucide-react";
import { ChatInterface } from "./ChatInterface";
import { cn } from "@/lib/utils";

export function ChatButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Chat Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        size="lg"
        className={cn(
          "fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg transition-all duration-200 hover:scale-110",
          "md:h-16 md:w-16"
        )}
        aria-label="Open AI chat assistant"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </Button>

      {/* Chat Interface */}
      <ChatInterface open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}
