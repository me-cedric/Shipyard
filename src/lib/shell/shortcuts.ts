import { useQuery, useQueryClient } from "@tanstack/react-query";
import { commands, unwrap } from "@/lib/ipc";

// The chord notation is `mod+shift+s`: lowercase, `mod` is Cmd or Ctrl, the key comes last.
// The chords are stored in the preferences of the app data folder, with the other preferences.

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MODIFIERS = new Set(["Control", "Shift", "Alt", "Meta", "Dead"]);

/** The chord of a key event, or "" when only a modifier is down. Digits go by physical key. */
export function chordOf(e: KeyboardEvent | React.KeyboardEvent): string {
	if (!e.key || MODIFIERS.has(e.key)) return "";
	const parts: string[] = [];
	if (e.metaKey || e.ctrlKey) parts.push("mod");
	if (e.altKey) parts.push("alt");
	if (e.shiftKey) parts.push("shift");
	// On AZERTY, Mod+1 sends "&" as e.key.
	parts.push(/^Digit\d$/.test(e.code) ? e.code.slice(5) : e.key.toLowerCase());
	return parts.join("+");
}

/** A chord that a person may bind: it holds `mod`, so it never steals a key of a text field. */
export const bindable = (chord: string) => chord.startsWith("mod+") && chord.length > 4;

const SYMBOL: Record<string, string> = MAC
	? { mod: "⌘", alt: "⌥", shift: "⇧", enter: "↩" }
	: { mod: "Ctrl", alt: "Alt", shift: "Shift", enter: "Enter" };

/** How a chord reads on this system. */
export const chordText = (chord: string) =>
	chord
		.split("+")
		.map((p) => SYMBOL[p] ?? p.toUpperCase())
		.join(MAC ? "" : "+");

const key = ["prefs", "shortcuts"] as const;

/** The chords that the person set, by action id, and the calls that change them. */
export function useShortcutBindings() {
	const qc = useQueryClient();
	const q = useQuery({
		queryKey: key,
		queryFn: () => unwrap(commands.prefsGet()).then((p) => p.shortcuts),
	});
	const bindings = q.data ?? {};
	const save = async (next: Record<string, string>) => {
		const p = await unwrap(commands.prefsSet({ shortcuts: next }));
		qc.setQueryData(key, p.shortcuts);
	};
	return {
		bindings,
		set: (id: string, chord: string) => save({ ...bindings, [id]: chord }),
		reset: (id: string) => {
			const { [id]: _gone, ...rest } = bindings;
			return save(rest);
		},
	};
}
