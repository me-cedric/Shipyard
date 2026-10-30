import { useState } from "react";
import { NoProject } from "@/features/work/no-project";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import {
	type Dashboard,
	message,
	TILE_KINDS,
	useDashboard,
	useDashboards,
	usePins,
	useTile,
} from "@/lib/knowledge";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { useTeam } from "@/lib/work";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	Cog6ToothIcon,
	PlusIcon,
	Squares2X2Icon,
	XMarkIcon,
} from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { MenuButton } from "@/ui/molecules/menu-button";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { TileCard } from "@/ui/organisms/tile-card";
import { ListDetail } from "@/ui/templates/list-detail";
import { isTrackerTile, layout, TEMPLATES, useTrackerTile } from "./dashboards-tracker";
import { useTileLabels, useTileName } from "./tile-labels";

const COLUMNS = 12;
const EVERYONE = "@@everyone";

/** The numbers of a tile: the index of the project, or the tracker mirror for a tracker tile. */
function useTileData(kind: string, person: string | null | undefined) {
	const tracker = isTrackerTile(kind);
	const indexed = useTile(tracker ? "" : kind, !tracker).data;
	const mirrored = useTrackerTile(kind, person);
	return tracker ? mirrored : indexed;
}

/** One tile: it reads the numbers that the project holds and draws them (REQ-023). */
export function Tile({
	kind,
	title,
	person,
	pin,
	actions,
}: {
	kind: string;
	/** A name that a person gave the tile. */
	title?: string;
	/** The member that a tracker tile follows. */
	person?: string | null;
	pin?: { slug: string; id: string };
	actions?: React.ReactNode;
}) {
	const { t } = useI18n();
	const data = useTileData(kind, person);
	const { pinned, toggle } = usePins();
	const name = useTileName(kind);
	const p = pin ? { ...pin, kind, ...(person ? { person } : {}) } : null;
	return (
		<TileCard
			title={title || name}
			data={data}
			offText={format(t.knowledge.dashboards.off, { name: data?.off ?? kind })}
			labels={useTileLabels()}
			pinned={p ? pinned(p) : undefined}
			onPin={p ? () => toggle(p) : undefined}
			actions={actions}
		/>
	);
}

/** The name and the size of one tile, in the inspector. */
function TileSettings({ slug, id }: { slug: string; id: string }) {
	const k = useI18n().t.knowledge.dashboards;
	const { view, save } = useDashboard(slug);
	const tile = view?.value.tiles.find((x) => x.id === id);
	const [title, setTitle] = useState(tile?.title ?? "");
	const [w, setW] = useState(String(tile?.w ?? 4));
	const [h, setH] = useState(String(tile?.h ?? 3));
	const [failure, setFailure] = useState<string | null>(null);
	if (!view || !tile) return null;
	const sizes = (n: number[]) => n.map((v) => ({ value: String(v), label: String(v) }));
	return (
		<form
			className="flex flex-col gap-2"
			onSubmit={async (ev) => {
				ev.preventDefault();
				try {
					setFailure(null);
					const width = Number(w);
					await save({
						...view.value,
						tiles: view.value.tiles.map((x) =>
							x.id === id
								? { ...x, title, w: width, h: Number(h), x: Math.min(x.x, COLUMNS - width) }
								: x,
						),
					});
				} catch (e) {
					setFailure(message(e));
				}
			}}
		>
			<Input caption label={k.name} value={title} onChange={(ev) => setTitle(ev.target.value)} />
			<Select
				caption
				label={k.width}
				value={w}
				onValueChange={setW}
				items={sizes([3, 4, 6, 8, 12])}
			/>
			<Select caption label={k.height} value={h} onValueChange={setH} items={sizes([2, 3, 4, 6])} />
			{failure ? (
				<p role="alert" className="text-ui text-danger-text">
					{failure}
				</p>
			) : null}
			<div>
				<Button type="submit" disabled={view.readOnly}>
					{k.save}
				</Button>
			</div>
		</form>
	);
}

function DashboardView({ slug }: { slug: string }) {
	const { t } = useI18n();
	const k = t.knowledge.dashboards;
	const { view, error, save } = useDashboard(slug);
	const { openDetail } = useShell();
	const members = useTeam().data?.team.members ?? [];
	const kindName = k.kind as Record<string, string>;
	const [person, setPerson] = useState(EVERYONE);
	const [failure, setFailure] = useState<string | null>(null);
	if (!view)
		return error ? (
			<p role="alert" className="px-3 py-1 text-ui text-danger-text">
				{error}
			</p>
		) : null;
	const dash: Dashboard = view.value;
	// Each change saves to the file and makes no commit (REQ-022).
	const write = async (tiles: Dashboard["tiles"]) => {
		try {
			setFailure(null);
			await save({ ...dash, tiles });
		} catch (e) {
			setFailure(message(e));
		}
	};
	const move = (id: string, dx: number) =>
		write(
			dash.tiles.map((x) =>
				x.id === id ? { ...x, x: Math.min(COLUMNS - x.w, Math.max(0, x.x + dx)) } : x,
			),
		);
	const add = (kind: string) => {
		let id = kind;
		for (let n = 2; dash.tiles.some((x) => x.id === id); n++) id = `${kind}-${n}`;
		const y = Math.max(0, ...dash.tiles.map((x) => x.y + x.h));
		return write([...dash.tiles, { id, kind, x: 0, y, w: 4, h: 3 }]);
	};
	const who = person === EVERYONE ? null : person;
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-4 pt-1 pb-4">
			<div className="flex flex-wrap items-center gap-2">
				{view.readOnly ? <Badge variant="warning">{k.readOnly}</Badge> : null}
				<Select
					label={k.person}
					value={person}
					onValueChange={setPerson}
					items={[
						{ value: EVERYONE, label: k.everyone },
						...members.map((m) => ({ value: m.handle, label: m.name })),
					]}
				/>
				{view.readOnly ? null : (
					<MenuButton
						label={k.add}
						icon={<PlusIcon size={14} />}
						items={TILE_KINDS.map((kind) => ({
							id: kind,
							label: kindName[kind] ?? kind,
							onSelect: () => void add(kind),
						}))}
					/>
				)}
			</div>
			{failure ? (
				<p role="alert" className="text-ui text-danger-text">
					{failure}
				</p>
			) : null}
			<ul
				aria-label={`${k.tiles} (${dash.tiles.length})`}
				className="grid gap-3"
				style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}
			>
				{dash.tiles.map((x) => {
					const name = x.title || kindName[x.kind] || x.kind;
					return (
						<li
							key={x.id}
							className="min-w-0"
							style={{
								gridColumn: `${x.x + 1} / span ${x.w}`,
								gridRow: `${x.y + 1} / span ${x.h}`,
							}}
						>
							<Tile
								kind={x.kind}
								title={x.title}
								person={isTrackerTile(x.kind) ? who : null}
								pin={{ slug, id: x.id }}
								actions={
									view.readOnly ? null : (
										<>
											<IconButton
												label={k.left}
												className="size-6"
												onClick={() => void move(x.id, -1)}
											>
												<ChevronLeftIcon size={12} />
											</IconButton>
											<IconButton
												label={k.right}
												className="size-6"
												onClick={() => void move(x.id, 1)}
											>
												<ChevronRightIcon size={12} />
											</IconButton>
											<IconButton
												label={`${k.settings} ${name}`}
												className="size-6"
												onClick={() =>
													openDetail(
														k.settings,
														<TileSettings key={`${slug}/${x.id}`} slug={slug} id={x.id} />,
													)
												}
											>
												<Cog6ToothIcon size={12} />
											</IconButton>
											<IconButton
												label={`${k.remove} ${name}`}
												className="size-6"
												onClick={() => void write(dash.tiles.filter((o) => o.id !== x.id))}
											>
												<XMarkIcon size={12} />
											</IconButton>
										</>
									)
								}
							/>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

/** Knowledge / Dashboards: a dashboard is a repository file of tiles that the team shares (REQ-022 to REQ-024). */
export function Dashboards() {
	const { t } = useI18n();
	const k = t.knowledge.dashboards;
	const active = useActiveProject().data;
	const list = useDashboards();
	const [chosen, setChosen] = useState<string | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	if (active === undefined) return null;
	if (active === null) return <NoProject title={k.title} />;
	const entries = list.data ?? [];
	const slug = chosen && entries.some((e) => e.slug === chosen) ? chosen : entries[0]?.slug;
	const create = async (name: string, title: string, kinds: readonly string[]) => {
		try {
			setFailure(null);
			let file = name;
			for (let n = 2; entries.some((e) => e.slug === file); n++) file = `${name}-${n}`;
			await unwrap(commands.dashboardSaveOne(file, { title, tiles: layout(kinds) }, null));
			await list.refetch();
			setChosen(file);
		} catch (e) {
			setFailure(message(e));
		}
	};
	return (
		<ListDetail
			title={k.title}
			icon={<Squares2X2Icon size={16} />}
			count={entries.length}
			action={
				<MenuButton
					label={k.create}
					icon={<PlusIcon size={14} />}
					items={(Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map((id) => ({
						id,
						label: k.template[id],
						onSelect: () => void create(id, k.template[id], TEMPLATES[id]),
					}))}
				/>
			}
			chips={
				entries.length > 1 ? (
					<ViewTabs
						label={k.title}
						value={slug ?? ""}
						onValueChange={setChosen}
						tabs={entries.map((e) => ({ value: e.slug, label: e.title }))}
					/>
				) : undefined
			}
		>
			{failure ? (
				<p role="alert" className="px-4 pb-2 text-ui text-danger-text">
					{failure}
				</p>
			) : null}
			{slug ? (
				<DashboardView key={slug} slug={slug} />
			) : list.isSuccess ? (
				<div className="p-4">
					<EmptyState
						action={{
							label: k.title,
							icon: <PlusIcon size={14} />,
							// The first dashboard holds every tile of the catalogue.
							onClick: () => void create("team", k.title, TILE_KINDS),
						}}
					/>
				</div>
			) : null}
		</ListDetail>
	);
}
