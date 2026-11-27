import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { RightButton } from "@/lib/rights";
import { type Preview, slugify, useWorkActions } from "@/lib/work";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Row } from "@/ui/molecules/row";
import { ATTENTION_FRAME } from "./capacity";

const NAME = "flex-[1_1_200px] font-medium";
const HEAD = "px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11";

/**
 * The body of the page "Import an estimate from Excel" (Plan / Estimates). It shows what the file
 * gives and each row that Shipyard refuses, with the reason. No sheet changes until the person
 * confirms (REQ-012). A name that a sheet has asks: a new sheet, or replace it.
 */
export function ExcelImport({
	file,
	names,
	onChoose,
	onFile,
	onCancel,
	onDone,
}: {
	/** The chosen workbook and what it gives. Null before a file is chosen. */
	file: { path: string; preview: Preview } | null;
	/** The name of each sheet that exists, by slug. */
	names: Map<string, string>;
	/** Opens the file picker. */
	onChoose: () => void;
	onFile: (file: { path: string; preview: Preview }) => void;
	onCancel: () => void;
	onDone: (slug: string) => void;
}) {
	const { t } = useI18n();
	const e = t.work.estimates;
	const x = t.costing.excel;
	const act = useWorkActions();
	const { failure, run } = useGuard();
	const [typed, setTyped] = useState<string | null>(null);
	const preview = file?.preview;
	const name = typed ?? preview?.sheet.name ?? "";
	const features = preview?.sheet.features ?? [];
	const tasks = features.reduce((n, f) => n + f.tasks.length, 0);
	const base = slugify(name);
	const existing =
		[...names].find(([slug, known]) => slug === base || known === name.trim())?.[0] ?? null;

	const write = (slug: string) =>
		run(async () => {
			const view = await act.confirmExcel(slug);
			// The workbook gives its own name: the name that the person typed wins.
			if (name.trim() !== (view.sheet.name ?? ""))
				await act.saveSheet(slug, { ...view.sheet, name: name.trim() });
			onDone(slug);
		});
	const fresh = () => {
		let slug = base || "sheet";
		for (let n = 2; names.has(slug); n++) slug = `${base || "sheet"}-${n}`;
		return slug;
	};
	const off = !preview || name.trim() === "";

	return (
		<div className="flex min-h-0 flex-1 flex-wrap content-start items-start gap-6 overflow-y-auto px-4 pt-1 pb-10">
			<div className="flex min-w-0 flex-[3_1_520px] flex-col gap-6">
				<Card className="py-2">
					<Row>
						<span className={NAME}>{x.file}</span>
						{file ? (
							<span className="font-mono text-13">{file.path.split(/[\\/]/).pop()}</span>
						) : null}
						<Button onClick={onChoose}>{file ? x.chooseAnother : x.choose}</Button>
					</Row>
					{file && preview ? (
						<>
							<Row>
								<span className={NAME}>{x.lot}</span>
								<Select
									label={x.lotLabel}
									className="font-semibold [&_svg]:hidden"
									value={preview.scope ?? ""}
									onValueChange={(scope) =>
										void run(async () =>
											onFile({
												path: file.path,
												preview: await act.previewExcel(file.path, scope),
											}),
										)
									}
									items={preview.scopes.map((s) => ({ value: s, label: s }))}
								/>
							</Row>
							<Row>
								<span className={NAME}>{x.name}</span>
								<Input
									label={x.nameLabel}
									value={name}
									onChange={(ev) => setTyped(ev.target.value)}
									className="flex-[1_1_200px]"
								/>
							</Row>
						</>
					) : null}
				</Card>
				{preview ? (
					<Card className="py-2">
						<h2 className={HEAD}>{x.gives}</h2>
						<Row>
							<span className="font-semibold">
								{format(e.counts, { features: features.length, tasks })}
							</span>
							<Badge variant="success">{x.read}</Badge>
						</Row>
						{features.map((f) => (
							<Row key={f.id}>
								<span>{f.name}</span>
								<span className="ml-auto text-n-11">
									{format(x.tasks, { count: f.tasks.length })}
								</span>
							</Row>
						))}
					</Card>
				) : null}
				{preview && preview.refused.length > 0 ? (
					<Card className={`py-2 ${ATTENTION_FRAME}`}>
						<h2 className={HEAD}>{format(x.refuses, { count: preview.refused.length })}</h2>
						{preview.refused.map((r) => (
							<Row key={`${r.row}:${r.reason}`}>
								<span className="font-semibold">{format(e.row, { row: r.row })}</span>
								<span className="flex-[1_1_240px]">{r.reason}</span>
								<Badge variant="you">{x.notImported}</Badge>
							</Row>
						))}
					</Card>
				) : null}
			</div>
			<div className="flex min-w-0 flex-[2_1_300px] flex-col gap-6">
				<Card pad className="flex flex-col gap-3.5">
					{existing ? (
						<h2 className="text-20 font-semibold">
							{format(x.exists, { name: names.get(existing) ?? existing })}
						</h2>
					) : null}
					{preview ? (
						<div className="flex flex-wrap gap-2.5 [&>*]:flex-[1_1_120px]">
							<RightButton
								right="work.edit"
								variant={existing ? "secondary" : "primary"}
								disabled={off}
								onClick={() => void write(fresh())}
							>
								{x.makeNew}
							</RightButton>
							{existing ? (
								<RightButton
									right="work.edit"
									variant="primary"
									disabled={off}
									onClick={() => void write(existing)}
								>
									{x.replaceIt}
								</RightButton>
							) : null}
						</div>
					) : null}
					{/* Alone in its card (no file yet) it keeps its own width: it does not stretch across the card. */}
					<Button className={preview ? undefined : "self-start"} onClick={onCancel}>
						{t.sync.backlog.cancel}
					</Button>
					<ErrorNotice error={failure} />
				</Card>
			</div>
		</div>
	);
}
