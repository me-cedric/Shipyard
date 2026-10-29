import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nProvider } from "@/lib/i18n";
import { PrefsProvider } from "@/lib/prefs";
import { TooltipProvider } from "@/ui/atoms/tooltip";

export function renderApp(ui: ReactElement) {
	return render(
		<I18nProvider>
			<PrefsProvider>
				<TooltipProvider>{ui}</TooltipProvider>
			</PrefsProvider>
		</I18nProvider>,
	);
}
