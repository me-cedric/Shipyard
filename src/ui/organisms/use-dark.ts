import { usePrefs } from "@/lib/prefs";

/** True when the theme is dark. The system theme follows the operating system. */
export function useDark(): boolean {
	const { theme } = usePrefs();
	return (
		theme === "dark" ||
		(theme === "system" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches)
	);
}
