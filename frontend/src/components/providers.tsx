"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 60000 } } }));
  return <QueryClientProvider client={client}><TooltipProvider>{children}</TooltipProvider><Toaster position="bottom-right" richColors /></QueryClientProvider>;
}
