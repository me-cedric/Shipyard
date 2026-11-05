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

/** Reduced motion drops every move and layout animation of the motion library. */
function Motion({ children }: { children: ReactNode }) {
	const { motion } = usePrefs();
	return (
		<MotionConfig reducedMotion={motion === "reduce" ? "always" : "user"}>{children}</MotionConfig>
	);
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
						<Motion>
							<Ready>{children}</Ready>
						</Motion>
					</TooltipProvider>
				</PrefsProvider>
			</I18nProvider>
		</QueryClientProvider>
	);
}
