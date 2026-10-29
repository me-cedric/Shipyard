import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "@/lib/i18n";
import { PrefsProvider } from "@/lib/prefs";
import { TooltipProvider } from "@/ui/atoms/tooltip";
import { Gallery } from "@/ui/gallery/gallery";
import "@/ui/tokens/tokens.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
	<StrictMode>
		<I18nProvider>
			<PrefsProvider>
				<TooltipProvider>
					<Gallery />
				</TooltipProvider>
			</PrefsProvider>
		</I18nProvider>
	</StrictMode>,
);
