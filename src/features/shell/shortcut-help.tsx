import { useEffect, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { useShell } from "@/lib/shell";
import { bindable, chordOf, chordText, useShortcutBindings } from "@/lib/shell/shortcuts";
import { Button } from "@/ui/atoms/button";
import { Kbd } from "@/ui/atoms/kbd";
import { Dialog } from "@/ui/organisms/dialog";
import type { Action } from "./actions";

/**
 * The overlay of all shortcuts, with a rebind for each. The chords
 * are stored in the preferences. A chord needs Mod, and one chord belongs to one action.
 */
export function ShortcutHelp({ actions }: { actions: Action[] }) {
	const { t } = useI18n();
	const { shortcutsOpen, setShortcutsOpen } = useShell();
	const { set, reset } = useShortcutBindings();
	const [editing, setEditing] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const rows = actions.filter((a) => a.chord);

	// While one row captures, the next chord is the new one. Escape cancels.
	useEffect(() => {
		if (!editing) return;
		const onKey = (e: KeyboardEvent) => {
			const chord = chordOf(e);
			if (!chord) return;
			e.preventDefault();
			e.stopPropagation();
			if (e.key === "Escape") return setEditing(null);
			const row = rows.find((a) => a.id === editing);
			if (!row) return;
			const other = rows.find((a) => a.chord === chord && a.id !== editing);
			if (!bindable(chord)) setMessage(t.ui.shortcuts.needMod);
			else if (other)
				setMessage(format(t.ui.shortcuts.taken, { chord: chordText(chord), name: other.label }));
			else {
				setMessage(format(t.ui.shortcuts.saved, { name: row.label, chord: chordText(chord) }));
				setEditing(null);
				void set(editing, chord);
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [editing, rows, set, t]);

	return (
		<Dialog
			open={shortcutsOpen}
			onOpenChange={(open) => {
				setShortcutsOpen(open);
				if (!open) {
					setEditing(null);
					setMessage(null);
				}
			}}
			title={t.ui.shortcuts.title}
		>
			<ul className="flex max-h-96 flex-col overflow-y-auto">
				{rows.map((a) => (
					<li key={a.id} className="flex min-h-9 items-center gap-2 border-b px-1 last:border-b-0">
						<span className="min-w-0 flex-1 truncate text-ui">{a.label}</span>
						{editing === a.id ? (
							<span className="text-12 text-n-11">{t.ui.shortcuts.press}</span>
						) : (
							<Kbd>{a.shortcut}</Kbd>
						)}
						<Button
							variant="ghost"
							aria-label={format(t.ui.shortcuts.changeName, { name: a.label })}
							onClick={() => {
								setMessage(null);
								setEditing(editing === a.id ? null : a.id);
							}}
						>
							{editing === a.id ? t.ui.shortcuts.cancel : t.ui.shortcuts.change}
						</Button>
						{a.chord !== a.defaultChord ? (
							<Button
								variant="ghost"
								aria-label={format(t.ui.shortcuts.resetName, { name: a.label })}
								onClick={() => void reset(a.id)}
							>
								{t.ui.shortcuts.reset}
							</Button>
						) : null}
					</li>
				))}
			</ul>
			{message ? (
				<p role="status" className="text-12 text-n-11">
					{message}
				</p>
			) : null}
		</Dialog>
	);
}
