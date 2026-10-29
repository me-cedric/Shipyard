import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { I18nProvider } from "@/lib/i18n";
import { PrefsProvider } from "@/lib/prefs";
import { TooltipProvider } from "@/ui/atoms/tooltip";

export function Providers({ children }: { children: ReactNode }) {
	const [client] = useState(
		() => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
	);
	return (
		<QueryClientProvider client={client}>
			<I18nProvider>
				<PrefsProvider>
					<TooltipProvider>{children}</TooltipProvider>
				</PrefsProvider>
			</I18nProvider>
		</QueryClientProvider>
	);
}
