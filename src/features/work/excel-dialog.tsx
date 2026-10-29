import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { type Preview, slugify, useWorkActions } from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Dialog } from "@/ui/organisms/dialog";
import { useGuard } from "./guard";

/**
 * The preview of an Excel import. It lists each row that the file refuses, with its reason. The
 * sheet stays as it is until the person confirms (REQ-012).
 */
export function ExcelDialog({
	path,
	preview,
	slugs,
	initial,
	onClose,
	onDone,
}: {
	path: string;
	preview: Preview;
	/** The sheets that exist: a name from this list replaces one. */
	slugs: string[];
	initial: string;
	onClose: () => void;
	onDone: (slug: string) => void;
}) {
	const { t } = useI18n();
	const e = t.work.estimates;
	const act = useWorkActions();
	const { error, run } = useGuard();
	const [current, setCurrent] = useState(preview);
	const [slug, setSlug] = useState(initial || slugify(preview.sheet.name ?? ""));
	const features = current.sheet.features ?? [];
	const tasks = features.reduce((n, f) => n + (f.tasks?.length ?? 0), 0);
	const replaces = slugs.includes(slug);

	return (
		<Dialog
			open
			onOpenChange={(open) => !open && onClose()}
			title={e.import}
			actions={
				<Button
					variant="primary"
					disabled={slug === ""}
					onClick={() =>
						void run(async () => {
							await act.confirmExcel(slug);
							onDone(slug);
						})
					}
				>
					{format(replaces ? e.replace : e.create, { slug })}
				</Button>
			}
		>
			<p className="font-mono text-12 text-n-11">{path}</p>
			{current.scopes.length > 1 ? (
				<Select
					caption
					label={e.lot}
					value={current.scope ?? ""}
					onValueChange={(scope) =>
						void run(async () => setCurrent(await act.previewExcel(path, scope)))
					}
					items={current.scopes.map((s) => ({ value: s, label: s }))}
				/>
			) : null}
			<p className="text-ui">{format(e.counts, { features: features.length, tasks })}</p>
			<Input
				caption
				label={e.slug}
				value={slug}
				onChange={(ev) => setSlug(ev.target.value)}
				className="font-mono"
			/>
			{current.refused.length > 0 ? (
				<section aria-labelledby="refused">
					<h3 id="refused" className="pb-1 text-12 font-medium text-n-11">
						{format(t.count, { name: e.refused, count: current.refused.length })}
					</h3>
					<ul className="max-h-40 overflow-auto">
						{current.refused.map((r) => (
							<li
								key={`${r.row}:${r.reason}`}
								className="flex h-row items-center gap-3 border-b text-ui"
							>
								<span className="w-16 font-mono text-11 text-n-11">
									{format(e.row, { row: r.row })}
								</span>
								<span className="text-danger-text">{r.reason}</span>
							</li>
						))}
					</ul>
				</section>
			) : null}
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</Dialog>
	);
}
