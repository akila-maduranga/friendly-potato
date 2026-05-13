import SubtitleGenerator from "@/pages/SubtitleGenerator";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function App() {
  return (
    <TooltipProvider>
      <main className="dark min-h-screen bg-background text-foreground font-sans">
        <SubtitleGenerator />
      </main>
      <Toaster />
    </TooltipProvider>
  );
}
