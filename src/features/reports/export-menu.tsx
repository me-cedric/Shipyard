import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type Right, saveAs, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { MenuButton } from "@/ui/molecules/menu-button";

/** The file of a text report: Word, Markdown or PDF. The extension of the path picks it. */
export type TextOut = "docx" | "md" | "pdf";

export type ExportItem = {
	id: string;
	label: string;
	/** A save dialog, then the job. */
	save?: {
		name: string;
		ext: "xlsx" | "docx" | "svg" | "png";
		job: (path: string) => Promise<unknown>;
	};
	/** The report asks first: its form is the page `/library/reports/<id>`. */
	form?: boolean;
	/** One click with the default values, with no save dialog: the paths of the files it wrote. */
	quick?: (out: TextOut) => Promise<string[]>;
	/** A job that is not a report of the log "Written for you". */
	quiet?: boolean;
	/** The right that the button of the Reports page needs. The backend refuses a write anyway. */
	right?: Right;
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
			<Button onClick={() => place((p) => unwrap(commands.revealPath(p)))}>
				{t.ui.item.reveal}
			</Button>
			<Button onClick={() => place((p) => unwrap(commands.openDefault(p)))}>
				{t.context.open}
			</Button>
		</>
	);
}

/**
 * The run of one export: the save dialog, or the page of its form when the export needs input.
 * Each write needs one click. `status` shows the written file with its two buttons, and a failure
 * with its sentence and its action (`ErrorNotice`).
 */
export function useExportRun() {
	const { t } = useI18n();
	const [note, setNote] = useState<string | null>(null);
	// The path of the last export, for "Show in folder" and "Open".
	const [saved, setSaved] = useState<string | null>(null);
	const [failure, setFailure] = useState<unknown>(null);
	const navigate = useNavigate();
	const qc = useQueryClient();
	// The log of the written reports: the Reports page shows the person and the day.
	const log = (x: ExportItem) => {
		if (x.quiet) return;
		unwrap(commands.reportsWrittenAdd(x.id, true))
			.then(() => qc.invalidateQueries({ queryKey: ["reports", "written"] }))
			.catch(() => {});
	};
	/** `ext` is the file of a text report, when the person picked another one than the own one. */
	const pick = async (x: ExportItem, ext?: TextOut) => {
		setNote(null);
		setSaved(null);
		setFailure(null);
		if (!x.save)
			return x.form
				? void navigate({ to: "/library/reports/$form", params: { form: x.id } })
				: undefined;
		try {
			const path = await saveAs(x.save.name, ext ?? x.save.ext);
			if (!path) return;
			await x.save.job(path);
			setNote(format(t.reports.exported, { path }));
			setSaved(path);
			log(x);
		} catch (e) {
			setFailure(e);
		}
	};
	/** A one-click export with default values: it shows the files that it wrote. */
	const quick = async (x: ExportItem, out: TextOut) => {
		setNote(null);
		setSaved(null);
		setFailure(null);
		try {
			const paths = (await x.quick?.(out)) ?? [];
			setNote(format(t.reports.exported, { path: paths.join(", ") }));
			setSaved(paths[0] ?? null);
			log(x);
		} catch (e) {
			setFailure(e);
		}
	};
	// A failure of the two buttons of a saved file shows like a failed export.
	const status = (
		<>
			{note ? (
				<span role="status" className="max-w-80 truncate font-mono text-12 text-n-11">
					{note}
				</span>
			) : null}
			{saved ? <SavedActions path={saved} onError={setFailure} /> : null}
			<ErrorNotice error={failure} />
		</>
	);
	return { pick, quick, status };
}

/** One Export menu. A choice starts the export (`useExportRun`). */
export function ExportMenu({ items, disabled }: { items: ExportItem[]; disabled?: boolean }) {
	const { t } = useI18n();
	const { pick, status } = useExportRun();
	return (
		<span className="inline-flex flex-wrap items-center gap-2">
			<MenuButton
				label={t.reports.export}
				disabled={disabled}
				items={items.map((x) => ({ id: x.id, label: x.label, onSelect: () => void pick(x) }))}
			/>
			{status}
		</span>
	);
}
