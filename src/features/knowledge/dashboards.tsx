import { Link, useParams } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { DEFAULT_BUDGET } from "@/features/flow/stop-action";
import { LibraryPage, LinkedCard, LinkedRow } from "@/features/library/page-parts";
import { NoProject } from "@/features/shell/no-project";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import {
	type Dashboard,
	message,
	TILE_KINDS,
	type TileProposal,
	useDashboard,
	useDashboards,
	usePins,
	useTile,
	useTileBuild,
} from "@/lib/knowledge";
import { useActiveProject } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { useTeam } from "@/lib/work";
import { Badge } from "@/ui/atoms/badge";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { Chip } from "@/ui/atoms/chip";
import { Input } from "@/ui/atoms/input";
import { Segmented } from "@/ui/atoms/segmented";
import { Select } from "@/ui/atoms/select";
import { PlusIcon, Squares2X2Icon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { TileCard } from "@/ui/organisms/tile-card";
import { isTrackerTile, layout, TEMPLATES, useTrackerTile } from "./dashboards-tracker";
import { PinnedTiles } from "./pinned";
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
	lead,
	edit,
}: {
	kind: string;
	/** A name that a person gave the tile. */
	title?: string;
	/** The member that a tracker tile follows. */
	person?: string | null;
	pin?: { slug: string; id: string };
	actions?: React.ReactNode;
	lead?: React.ReactNode;
	edit?: boolean;
}) {
	const { t } = useI18n();
	const raw = useTileData(kind, person);
	// The runs tile counts states: the engine names them with codes, the person reads the plain words.
	const states = t.factory.state as Record<string, string>;
	const data =
		raw && kind === "runs"
			? { ...raw, rows: raw.rows.map(([state = "", ...rest]) => [states[state] ?? state, ...rest]) }
			: raw;
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
			lead={lead}
			edit={edit}
		/>
	);
}

/** The 12 columns of a dashboard, and the place of a tile in them. */
const GRID = { gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` };
const cell = (x: Dashboard["tiles"][number]) => ({
	gridColumn: `${x.x + 1} / span ${x.w}`,
	gridRow: `${x.y + 1} / span ${x.h}`,
});
const shift = (tiles: Dashboard["tiles"], id: string, dx: number) =>
	tiles.map((x) => (x.id === id ? { ...x, x: Math.min(COLUMNS - x.w, Math.max(0, x.x + dx)) } : x));

/** The name, the size and the place of one tile, in the inspector. */
function TileSettings({ slug, id }: { slug: string; id: string }) {
	const k = useI18n().t.knowledge.dashboards;
	const { view, save } = useDashboard(slug);
	const tile = view?.value.tiles.find((x) => x.id === id);
	const [title, setTitle] = useState(tile?.title ?? "");
	const [w, setW] = useState(String(tile?.w ?? 4));
	const [h, setH] = useState(String(tile?.h ?? 3));
	const [failure, setFailure] = useState<string | null>(null);
	if (!view || !tile) return null;
	const move = async (dx: number) => {
		try {
			setFailure(null);
			await save({ ...view.value, tiles: shift(view.value.tiles, id, dx) });
		} catch (e) {
			setFailure(message(e));
		}
	};
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
			<div className="flex flex-wrap gap-2">
				<RightButton right="knowledge.edit" type="submit" disabled={view.readOnly}>
					{k.save}
				</RightButton>
				<RightButton right="knowledge.edit" disabled={view.readOnly} onClick={() => void move(-1)}>
					{k.left}
				</RightButton>
				<RightButton right="knowledge.edit" disabled={view.readOnly} onClick={() => void move(1)}>
					{k.right}
				</RightButton>
			</div>
		</form>
	);
}

/**
 * "Build a tile for me": the person says what the tile must show and sets a budget, an agent
 * proposes one tile, and the tile enters the dashboard only on Accept (spec:app-redesign#REQ-032).
 */
function TileBuilder({
	build,
	onAccept,
}: {
	build: ReturnType<typeof useTileBuild>;
	/** Saves the tile to the dashboard. `false`: the save failed, and the proposal stays. */
	onAccept: (tile: TileProposal) => Promise<boolean>;
}) {
	const k = useI18n().t.knowledge.dashboards;
	const [text, setText] = useState("");
	const [usd, setUsd] = useState(DEFAULT_BUDGET);
	const proposal = build.proposal;
	if (build.working)
		return (
			<div className="flex flex-wrap items-center gap-2">
				<p role="status" className="text-ui text-n-11">
					{k.building}
				</p>
				<Button className="min-h-control" onClick={() => void build.stop()}>
					{k.buildStop}
				</Button>
			</div>
		);
	if (proposal)
		return (
			<section aria-label={k.proposed} className="flex max-w-xl flex-col gap-2">
				<h2 className="text-ui font-medium text-n-12">{k.proposed}</h2>
				<Tile kind={proposal.kind} title={proposal.title} />
				<div className="flex flex-wrap items-center gap-2">
					<RightButton
						right="knowledge.edit"
						variant="primary"
						className="min-h-control"
						onClick={async () => {
							if (await onAccept(proposal)) build.discard();
						}}
					>
						{k.accept}
					</RightButton>
					<Button className="min-h-control" onClick={build.discard}>
						{k.discard}
					</Button>
				</div>
			</section>
		);
	return (
		<form
			className="flex flex-wrap items-center gap-2"
			onSubmit={(ev) => {
				ev.preventDefault();
				void build.start(text, usd);
			}}
		>
			<Input
				label={k.buildWhat}
				className="min-h-control w-80 max-w-full"
				maxLength={500}
				value={text}
				onChange={(ev) => setText(ev.target.value)}
			/>
			<fieldset
				aria-label={k.buildBudget}
				className="m-0 flex items-center gap-1 rounded-md border p-0"
			>
				<Button
					variant="ghost"
					className="min-h-control"
					aria-label={k.buildLess}
					disabled={usd <= 1}
					onClick={() => setUsd(usd - 1)}
				>
					-
				</Button>
				<output className="min-w-10 text-center font-mono text-ui">${usd}</output>
				<Button
					variant="ghost"
					className="min-h-control"
					aria-label={k.buildMore}
					onClick={() => setUsd(usd + 1)}
				>
					+
				</Button>
			</fieldset>
			<RightButton
				right="knowledge.edit"
				type="submit"
				variant="primary"
				className="min-h-control"
				disabled={!text.trim()}
			>
				{k.buildStart}
			</RightButton>
			{build.failure ? (
				<p role="alert" className="w-full text-ui text-danger-text">
					{/* A larger tile budget helps only when the tile budget is the one that is spent. */}
					{build.failure.details.includes("the tile waits") ? k.buildSpent : build.failure.message}
				</p>
			) : null}
		</form>
	);
}

/** The dashboard that the person looked at last: Done of the edit page comes back to it. */
let last: string | null = null;

/** One dashboard in read mode: the person filter, Edit and the tiles. */
function DashboardView({ slug }: { slug: string }) {
	const k = useI18n().t.knowledge.dashboards;
	const { ask } = useShell();
	const { view, error } = useDashboard(slug);
	const members = useTeam().data?.team.members ?? [];
	const [person, setPerson] = useState(EVERYONE);
	if (!view)
		return error ? (
			<p role="alert" className="text-ui text-danger-text">
				{error}
			</p>
		) : null;
	const dash: Dashboard = view.value;
	const who = person === EVERYONE ? null : person;
	return (
		<>
			<div className="flex flex-wrap items-center gap-4">
				<Select
					label={k.person}
					value={person}
					onValueChange={setPerson}
					items={[
						{ value: EVERYONE, label: k.everyone },
						...members.map((m) => ({ value: m.handle, label: m.name })),
					]}
				/>
				{view.readOnly ? <Badge variant="warning">{k.readOnly}</Badge> : null}
				<span className="flex-1" />
				{view.readOnly ? null : (
					<Link
						to="/library/dashboards/$slug/edit"
						params={{ slug }}
						className={cn(buttonVariants(), "min-h-control")}
					>
						{k.edit}
					</Link>
				)}
				<Link to="/library/reports" className={cn(buttonVariants(), "min-h-control")}>
					{k.exportReport}
				</Link>
				<Button
					variant="primary"
					className="min-h-control"
					onClick={() => ask(k.buildDashboardAsk)}
				>
					{k.buildDashboard}
				</Button>
			</div>
			<ul
				aria-label={`${k.tiles} (${dash.tiles.length})`}
				className="grid auto-rows-[minmax(112px,auto)] gap-4"
				style={GRID}
			>
				{dash.tiles.map((x) => (
					<li key={x.id} className="min-w-0" style={cell(x)}>
						<Tile
							kind={x.kind}
							title={x.title}
							person={isTrackerTile(x.kind) ? who : null}
							pin={{ slug, id: x.id }}
						/>
					</li>
				))}
			</ul>
		</>
	);
}

/** Library / Dashboards: a dashboard is a repository file of tiles that the team shares (REQ-022 to REQ-024). */
export function Dashboards() {
	const { t } = useI18n();
	const k = t.knowledge.dashboards;
	const active = useActiveProject().data;
	const list = useDashboards();
	const [chosen, setChosen] = useState(last);
	const [failure, setFailure] = useState<string | null>(null);
	if (active === undefined) return <Loading title={k.title} icon={<Squares2X2Icon size={16} />} />;
	if (active === null) return <NoProject title={k.title} icon={<Squares2X2Icon size={16} />} />;
	const entries = list.data ?? [];
	const slug = chosen && entries.some((e) => e.slug === chosen) ? chosen : entries[0]?.slug;
	const choose = (to: string) => {
		last = to;
		setChosen(to);
	};
	const create = async (name: string, title: string, kinds: readonly string[]) => {
		try {
			setFailure(null);
			let file = name;
			for (let n = 2; entries.some((e) => e.slug === file); n++) file = `${name}-${n}`;
			await unwrap(commands.dashboardSaveOne(file, { title, tiles: layout(kinds) }, null));
			await list.refetch();
			choose(file);
		} catch (e) {
			setFailure(message(e));
		}
	};
	return (
		<LibraryPage
			title={k.title}
			menu={(Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map((id) => ({
				label: `${k.create}: ${k.template[id]}`,
				onClick: () => void create(id, k.template[id], TEMPLATES[id]),
			}))}
			action={
				entries.length > 1 && slug ? (
					<div>
						<Segmented
							label={k.switch}
							value={slug}
							onValueChange={choose}
							items={entries.map((e) => ({ value: e.slug, label: e.title }))}
						/>
					</div>
				) : null
			}
		>
			{failure ? (
				<p role="alert" className="text-ui text-danger-text">
					{failure}
				</p>
			) : null}
			<PinnedTiles />
			{slug ? (
				<DashboardView key={slug} slug={slug} />
			) : list.isSuccess ? (
				<EmptyState
					title={t.empty.dashboards}
					action={{
						label: k.title,
						icon: <PlusIcon size={14} />,
						// The first dashboard holds every tile of the catalogue.
						onClick: () => void create("team", k.title, TILE_KINDS),
					}}
				/>
			) : null}
			<LinkedCard title={k.more}>
				<LinkedRow label={k.spend} render={(p) => <Link to="/crew/spend" {...p} />} />
				<LinkedRow label={k.gates} render={(p) => <Link to="/flow/health" {...p} />} />
				<LinkedRow label={k.plan} render={(p) => <Link to="/plan/timeline" {...p} />} />
			</LinkedCard>
		</LibraryPage>
	);
}

/** The six dots of a part that the pointer drags. */
const GRIP = (
	<span
		aria-hidden="true"
		className="flex size-11 shrink-0 cursor-grab items-center justify-center rounded-md border border-n-7 text-n-10"
	>
		<svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor">
			{[7, 12, 17].flatMap((y) =>
				[9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />),
			)}
		</svg>
	</span>
);

/**
 * Library / Dashboards, edit mode of one dashboard (`/library/dashboards/$slug/edit`): the name,
 * the tile kinds, "Build a tile for me", and each tile with its handle, Settings and Remove.
 */
export function DashboardEdit() {
	const { t } = useI18n();
	const k = t.knowledge.dashboards;
	const { slug } = useParams({ strict: false }) as { slug: string };
	last = slug;
	const active = useActiveProject().data;
	const { view, error, save } = useDashboard(slug);
	const { openDetail } = useShell();
	const kindName = k.kind as Record<string, string>;
	const [failure, setFailure] = useState<string | null>(null);
	const [building, setBuilding] = useState(false);
	const [name, setName] = useState<string | null>(null);
	const build = useTileBuild(slug);
	// The tile in the air and the column of the tile that the pointer holds.
	const drag = useRef<{ id: string; grab: number } | null>(null);
	if (active === undefined) return <Loading title={k.title} icon={<Squares2X2Icon size={16} />} />;
	if (active === null) return <NoProject title={k.title} icon={<Squares2X2Icon size={16} />} />;
	const back = (
		<BackLink label={k.title} render={(p) => <Link to="/library/dashboards" {...p} />} />
	);
	if (!view)
		return (
			<LibraryPage title={k.title} back={back}>
				{error ? (
					<p role="alert" className="text-ui text-danger-text">
						{error}
					</p>
				) : null}
			</LibraryPage>
		);
	const dash: Dashboard = view.value;
	const locked = view.readOnly;
	// Each change saves to the file and makes no commit (REQ-022).
	const put = async (next: Dashboard) => {
		try {
			setFailure(null);
			if (await save(next)) return true;
			// The save read the file again: the next click saves on the new file.
			setFailure(t.knowledge.editor.conflict);
			return false;
		} catch (e) {
			setFailure(message(e));
			return false;
		}
	};
	const write = (tiles: Dashboard["tiles"]) => put({ ...dash, tiles });
	const add = (kind: string, size: { w: number; h: number; title?: string } = { w: 4, h: 3 }) => {
		let id = kind;
		for (let n = 2; dash.tiles.some((x) => x.id === id); n++) id = `${kind}-${n}`;
		const y = Math.max(0, ...dash.tiles.map((x) => x.y + x.h));
		return write([...dash.tiles, { id, kind, x: 0, y, ...size }]);
	};
	/** The grid column under the pointer, from 0. */
	const column = (e: React.DragEvent, grid: HTMLElement) => {
		const box = grid.getBoundingClientRect();
		return Math.floor(((e.clientX - box.left) / Math.max(box.width, 1)) * COLUMNS);
	};
	return (
		<LibraryPage
			title={dash.title}
			back={back}
			action={
				<>
					{locked ? <Badge variant="warning">{k.readOnly}</Badge> : null}
					{locked ? null : (
						<RightButton
							right="knowledge.edit"
							className="min-h-control"
							aria-expanded={name !== null}
							onClick={() => setName(name === null ? dash.title : null)}
						>
							{k.rename}
						</RightButton>
					)}
					<Link
						to="/library/dashboards"
						className={cn(buttonVariants({ variant: "primary" }), "min-h-control")}
					>
						{k.done}
					</Link>
				</>
			}
		>
			{name !== null && !locked ? (
				<form
					className="flex flex-wrap items-center gap-2"
					onSubmit={async (ev) => {
						ev.preventDefault();
						if (await put({ ...dash, title: name.trim() })) setName(null);
					}}
				>
					<Input
						label={k.dashName}
						className="min-h-control w-80 max-w-full"
						maxLength={80}
						value={name}
						onChange={(ev) => setName(ev.target.value)}
					/>
					<RightButton
						right="knowledge.edit"
						type="submit"
						variant="primary"
						className="min-h-control"
						disabled={!name.trim()}
					>
						{k.save}
					</RightButton>
				</form>
			) : null}
			{locked ? null : (
				<Card pad className="flex flex-col gap-3">
					<h2 className="text-13 font-semibold text-n-11">{k.add}</h2>
					<fieldset aria-label={k.add} className="m-0 flex items-start gap-2 border-0 p-0">
						<div className="flex min-w-0 flex-1 flex-wrap gap-2">
							{TILE_KINDS.map((kind) => (
								<Chip key={kind} onClick={() => void add(kind)}>
									{kindName[kind] ?? kind}
								</Chip>
							))}
						</div>
						<RightButton
							right="knowledge.edit"
							className="min-h-control shrink-0"
							aria-expanded={building}
							disabled={build.working}
							onClick={() => setBuilding(!building)}
						>
							{k.build}
						</RightButton>
					</fieldset>
					{building ? (
						<TileBuilder
							build={build}
							onAccept={({ kind, title, w, h }) => add(kind, { w, h, ...(title ? { title } : {}) })}
						/>
					) : null}
				</Card>
			)}
			{failure ? (
				<p role="alert" className="text-ui text-danger-text">
					{failure}
				</p>
			) : null}
			<ul
				aria-label={`${k.tiles} (${dash.tiles.length})`}
				className="grid auto-rows-[minmax(112px,auto)] gap-4"
				onDragOver={(e) => {
					if (drag.current) e.preventDefault();
				}}
				onDrop={(e) => {
					const held = drag.current;
					const tile = dash.tiles.find((o) => o.id === held?.id);
					drag.current = null;
					if (!(held && tile)) return;
					e.preventDefault();
					const dx = column(e, e.currentTarget) - held.grab - tile.x;
					if (dx !== 0) void write(shift(dash.tiles, tile.id, dx));
				}}
				style={GRID}
			>
				{dash.tiles.map((x) => {
					const title = x.title || kindName[x.kind] || x.kind;
					return (
						<li
							key={x.id}
							className="min-w-0"
							draggable={!locked}
							onDragStart={(e) => {
								e.dataTransfer.setData("text/plain", x.id);
								e.dataTransfer.effectAllowed = "move";
								const grid = e.currentTarget.parentElement;
								if (grid) drag.current = { id: x.id, grab: column(e, grid) - x.x };
							}}
							onDragEnd={() => {
								drag.current = null;
							}}
							style={cell(x)}
						>
							<Tile
								kind={x.kind}
								title={x.title}
								pin={{ slug, id: x.id }}
								edit={!locked}
								lead={locked ? null : GRIP}
								actions={
									locked ? null : (
										<>
											<Button
												className="min-h-control px-2.5"
												aria-label={`${k.settings} ${title}`}
												onClick={() =>
													openDetail(
														k.settings,
														<TileSettings key={`${slug}/${x.id}`} slug={slug} id={x.id} />,
													)
												}
											>
												{k.tileSettings}
											</Button>
											<RightButton
												right="knowledge.edit"
												className="min-h-control px-2.5"
												aria-label={`${k.remove} ${title}`}
												onClick={() => void write(dash.tiles.filter((o) => o.id !== x.id))}
											>
												{k.tileRemove}
											</RightButton>
										</>
									)
								}
							/>
						</li>
					);
				})}
			</ul>
		</LibraryPage>
	);
}
