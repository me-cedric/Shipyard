import { Menu } from "@base-ui/react/menu";
import { type ReactNode, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, saveAs, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { ArrowUpTrayIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";

export type ExportItem = {
	id: string;
	label: string;
	/** A save dialog, then the job. */
	save?: {
		name: string;
		ext: "xlsx" | "docx" | "svg" | "png";
		job: (path: string) => Promise<unknown>;
	};
	/** A form in a dialog. `done` shows a note. */
	form?: (done: (note: string) => void, close: () => void) => ReactNode;
};

/** "Show in folder" and "Open" for a file that an export wrote. A refusal goes to `onError`. */
export function SavedActions({
	path,
	onError,
}: {
	path: string;
	onError: (error: unknown) => void;
}) {
	const { t } = useI18n();
	const place = (open: (path: string) => Promise<unknown>) => {
		onError(null);
		open(path).catch(onError);
	};
	return (
		<>
			<Button variant="ghost" onClick={() => place((p) => unwrap(commands.revealPath(p)))}>
				{t.ui.item.reveal}
			</Button>
			<Button variant="ghost" onClick={() => place((p) => unwrap(commands.openDefault(p)))}>
				{t.context.open}
			</Button>
		</>
	);
}

/**
 * One Export menu. A choice opens the save dialog, or a form when the export needs input. Each write
 * needs this click. A failure shows with its sentence and its action (`ErrorNotice`).
 */
export function ExportMenu({ items, disabled }: { items: ExportItem[]; disabled?: boolean }) {
	const { t } = useI18n();
	const [note, setNote] = useState<string | null>(null);
	// The path of the last export, for "Show in folder" and "Open". A form note has none.
	const [saved, setSaved] = useState<string | null>(null);
	const [failure, setFailure] = useState<unknown>(null);
	const [form, setForm] = useState<ExportItem | null>(null);
	const pick = async (x: ExportItem) => {
		setNote(null);
		setSaved(null);
		setFailure(null);
		if (x.form) return setForm(x);
		if (!x.save) return;
		try {
			const path = await saveAs(x.save.name, x.save.ext);
			if (!path) return;
			await x.save.job(path);
			setNote(format(t.reports.exported, { path }));
			setSaved(path);
		} catch (e) {
			setFailure(e);
		}
	};
	// A failure of these two buttons shows like a failed export.
	return (
		<span className="inline-flex flex-wrap items-center gap-2">
			<Menu.Root>
				<Menu.Trigger render={<Button disabled={disabled} />}>
					<ArrowUpTrayIcon size={14} />
					{t.reports.export}
				</Menu.Trigger>
				<Menu.Portal>
					<Menu.Positioner align="end" sideOffset={4} className="z-50">
						<Menu.Popup className="min-w-40 origin-(--transform-origin) rounded-lg border border-n-6 bg-surface-3 p-1 text-ui shadow-3 transition-[opacity,scale] duration-(--duration-base) ease-spring data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
							{items.map((x) => (
								<Menu.Item
									key={x.id}
									onClick={() => void pick(x)}
									className="flex h-row cursor-pointer items-center gap-2 rounded-sm px-2 text-n-12 data-[highlighted]:bg-n-5"
								>
									{x.label}
								</Menu.Item>
							))}
						</Menu.Popup>
					</Menu.Positioner>
				</Menu.Portal>
			</Menu.Root>
			{note ? (
				<span role="status" className="max-w-80 truncate font-mono text-12 text-n-11">
					{note}
				</span>
			) : null}
			{saved ? <SavedActions path={saved} onError={setFailure} /> : null}
			<ErrorNotice error={failure} />
			{form?.form?.(setNote, () => setForm(null))}
		</span>
	);
}
