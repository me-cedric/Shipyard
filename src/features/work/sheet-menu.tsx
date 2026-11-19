import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { format, useI18n } from "@/lib/i18n";
import { confirmDialog } from "@/lib/ipc";
import { useRights } from "@/lib/rights";
import {
	figure,
	money,
	type ProfileSum,
	type SheetView,
	slugify,
	useProfiles,
	useWorkActions,
} from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { Card } from "@/ui/molecules/card";
import { Row } from "@/ui/molecules/row";
import { DataTable } from "@/ui/organisms/data-table";

/** A sheet name that no sheet uses: `mvp-1-copy`, then `mvp-1-copy-2`. */
export function freeSlug(slugs: string[], base: string) {
	let slug = `${base}-copy`;
	for (let n = 2; slugs.includes(slug); n++) slug = `${base}-copy-${n}`;
	return slug;
}

export type SheetAction = {
	label: string;
	/** What the action does, for the row of the card. The first one is the name of the sheet. */
	hint: string;
	disabled: boolean;
	danger?: boolean;
	onClick: () => void;
};

/** Rename, duplicate, freeze or unfreeze, and delete a sheet. Each one is a click. */
export function useSheetActions({
	view,
	slugs,
	onRename,
	onChosen,
	run,
}: {
	view: SheetView | undefined;
	slugs: string[];
	onRename: () => void;
	onChosen: (slug: string | null) => void;
	run: (job: () => Promise<unknown>) => Promise<boolean>;
}): SheetAction[] {
	const { t } = useI18n();
	const s = t.costing.sheet;
	const p = t.costing.estimate;
	const act = useWorkActions();
	const { can } = useRights();
	if (!view) return [];
	const sheet = view.sheet;
	const name = sheet.name || view.slug;
	const frozen = sheet.frozen === true;
	const off = !can("work.edit");
	return [
		{ label: s.rename, hint: name, disabled: frozen || off, onClick: onRename },
		{
			label: s.duplicate,
			hint: p.sheetCopy,
			disabled: off,
			onClick: () =>
				void run(async () => {
					const slug = freeSlug(slugs, slugify(view.slug) || "sheet");
					const { frozen: _drop, ...rest } = sheet;
					await act.saveSheet(slug, { ...rest, name: format(s.copyName, { name }) });
					onChosen(slug);
				}),
		},
		{
			label: frozen ? s.unfreeze : s.freeze,
			hint: frozen ? p.sheetUnfreeze : p.sheetFreeze,
			disabled: off,
			onClick: () => void run(() => act.saveSheet(view.slug, { ...sheet, frozen: !frozen })),
		},
		{
			label: s.delete,
			hint: p.sheetDelete,
			disabled: frozen || off,
			danger: true,
			onClick: () =>
				void run(async () => {
					if (!(await confirmDialog(format(s.confirmDelete, { name })))) return;
					await act.deleteSheet(view.slug);
					onChosen(null);
				}),
		},
	];
}

/** The card "This sheet": one row for each action, and the way to the seal before Delete. */
export function SheetCard({ actions, onSeal }: { actions: SheetAction[]; onSeal: () => void }) {
	const { t } = useI18n();
	const p = t.costing.estimate;
	const row = (a: Pick<SheetAction, "label" | "hint"> & Partial<SheetAction>) => (
		<Row key={a.label}>
			<span className="flex-[1_1_200px] font-medium">{a.hint}</span>
			<Button
				disabled={a.disabled}
				className={a.danger ? "text-danger-text" : undefined}
				onClick={a.onClick}
			>
				{a.label}
			</Button>
		</Row>
	);
	return (
		<Card className="py-2">
			<h2 className="px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11">{p.thisSheet}</h2>
			{actions.slice(0, -1).map(row)}
			{row({ label: t.work.seal.seal, hint: p.sheetSeal, onClick: onSeal })}
			{actions.slice(-1).map(row)}
		</Card>
	);
}

/** Days and cost by profile: of one sheet, or of every lot with `slug` null. No day rate shows. */
export function ProfileTable({ slug, currency }: { slug: string | null; currency: string }) {
	const { t, lang } = useI18n();
	const e = t.work.estimates;
	const rows = useProfiles(slug).data ?? [];
	const costs = useRights().can("costs.view");
	const columns = useMemo<ColumnDef<ProfileSum>[]>(
		() => [
			{
				id: "role",
				header: t.costing.summary.profile,
				meta: { width: "minmax(8rem, 1fr)" },
				cell: ({ row }) => row.original.role,
			},
			{
				id: "days",
				header: e.days,
				meta: { width: "7rem", numeric: true },
				cell: ({ row }) => figure(row.original.days, lang),
			},
			{
				id: "cost",
				header: e.cost,
				meta: { width: "9rem", numeric: true },
				cell: ({ row }) =>
					!costs ? (
						"—"
					) : row.original.cost == null ? (
						// The rates are set in Crew.
						<Link to="/crew/crew" className="text-accent-text underline">
							{e.unrated}
						</Link>
					) : (
						money(row.original.cost, currency, lang)
					),
			},
		],
		[t, e, lang, currency, costs],
	);
	return (
		<div className="flex min-h-48 flex-col overflow-hidden rounded-lg border bg-surface-1 shadow-1">
			<DataTable
				label={
					slug
						? t.costing.summary.byProfile
						: `${t.costing.summary.byProfile}, ${e.views.portfolio}`
				}
				data={rows}
				columns={columns}
				rowId={(r) => r.role}
			/>
		</div>
	);
}
