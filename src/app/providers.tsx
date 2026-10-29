import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { type ReactNode, useState } from "react";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { PrefsProvider, usePrefs } from "@/lib/prefs";
import { TooltipProvider } from "@/ui/atoms/tooltip";

/** Wait for the stored preferences. The app then starts in the right theme and language. */
function Ready({ children }: { children: ReactNode }) {
	const prefs = usePrefs().loaded;
	const lang = useI18n().loaded;
	return prefs && lang ? children : null;
}

export function Providers({ children }: { children: ReactNode }) {
	const [client] = useState(
		() => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
	);
	return (
		<QueryClientProvider client={client}>
			<I18nProvider>
				<PrefsProvider>
					<TooltipProvider>
						{/* Reduced motion drops every move and layout animation of the motion library. */}
						<MotionConfig reducedMotion="user">
							<Ready>{children}</Ready>
						</MotionConfig>
					</TooltipProvider>
				</PrefsProvider>
			</I18nProvider>
		</QueryClientProvider>
	);
}
