import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { format, useI18n } from "@/lib/i18n";
import { confirmDialog } from "@/lib/ipc";
import {
	figure,
	money,
	type ProfileSum,
	type SheetView,
	slugify,
	useProfiles,
	useWorkActions,
} from "@/lib/work";
import {
	Cog6ToothIcon,
	LockClosedIcon,
	LockOpenIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
} from "@/ui/icons";
import { MenuButton } from "@/ui/molecules/menu-button";
import { DataTable } from "@/ui/organisms/data-table";

/** A sheet name that no sheet uses: `mvp-1-copy`, then `mvp-1-copy-2`. */
export function freeSlug(slugs: string[], base: string) {
	let slug = `${base}-copy`;
	for (let n = 2; slugs.includes(slug); n++) slug = `${base}-copy-${n}`;
	return slug;
}

/** Rename, duplicate, freeze or unfreeze, and delete a sheet. Each one is a click. */
export function SheetMenu({
	view,
	slugs,
	onRename,
	onChosen,
	run,
}: {
	view: SheetView;
	slugs: string[];
	onRename: () => void;
	onChosen: (slug: string | null) => void;
	run: (job: () => Promise<unknown>) => Promise<boolean>;
}) {
	const { t } = useI18n();
	const s = t.costing.sheet;
	const act = useWorkActions();
	const sheet = view.sheet;
	const name = sheet.name || view.slug;
	const frozen = sheet.frozen === true;
	return (
		<MenuButton
			label={s.actions}
			iconOnly
			icon={<Cog6ToothIcon size={14} />}
			items={[
				{
					id: "rename",
					label: s.rename,
					icon: <PencilIcon size={14} />,
					disabled: frozen,
					onSelect: onRename,
				},
				{
					id: "duplicate",
					label: s.duplicate,
					icon: <PlusIcon size={14} />,
					onSelect: () =>
						void run(async () => {
							const slug = freeSlug(slugs, slugify(view.slug) || "sheet");
							const { frozen: _drop, ...rest } = sheet;
							await act.saveSheet(slug, { ...rest, name: format(s.copyName, { name }) });
							onChosen(slug);
						}),
				},
				{
					id: "freeze",
					label: frozen ? s.unfreeze : s.freeze,
					icon: frozen ? <LockOpenIcon size={14} /> : <LockClosedIcon size={14} />,
					onSelect: () => void run(() => act.saveSheet(view.slug, { ...sheet, frozen: !frozen })),
				},
				{
					id: "delete",
					label: s.delete,
					icon: <TrashIcon size={14} />,
					disabled: frozen,
					onSelect: () =>
						void run(async () => {
							if (!(await confirmDialog(format(s.confirmDelete, { name })))) return;
							await act.deleteSheet(view.slug);
							onChosen(null);
						}),
				},
			]}
		/>
	);
}

/** Days and cost by profile: of one sheet, or of every lot with `slug` null. No day rate shows. */
export function ProfileTable({ slug, currency }: { slug: string | null; currency: string }) {
	const { t, lang } = useI18n();
	const e = t.work.estimates;
	const rows = useProfiles(slug).data ?? [];
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
					row.original.cost == null ? (
						// The rates are set in Work / Team.
						<Link to="/work/team" className="text-accent-text underline">
							{e.unrated}
						</Link>
					) : (
						money(row.original.cost, currency, lang)
					),
			},
		],
		[t, e, lang, currency],
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
