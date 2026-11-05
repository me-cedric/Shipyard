import { usePrefs } from "@/lib/prefs";

/** True when the theme is dark or OLED. The system themes follow the operating system. */
export function useDark(): boolean {
	const { theme } = usePrefs();
	return (
		theme === "dark" ||
		theme === "oled" ||
		((theme === "system" || theme === "system-oled") &&
			!!window.matchMedia?.("(prefers-color-scheme: dark)").matches)
	);
}
