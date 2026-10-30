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
import { Badge } from "@/ui/atoms/badge";
import { IconButton } from "@/ui/atoms/icon-button";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, Squares2X2Icon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { TileCard } from "@/ui/organisms/tile-card";
import { ListDetail } from "@/ui/templates/list-detail";
import { useTileLabels, useTileName } from "./tile-labels";

const COLUMNS = 12;

/** One tile: it reads the numbers that the project holds and draws them (REQ-023). */
export function Tile({
	kind,
	pin,
	actions,
}: {
	kind: string;
	pin?: { slug: string; id: string };
	actions?: React.ReactNode;
}) {
	const { t } = useI18n();
	const data = useTile(kind).data;
	const { pinned, toggle } = usePins();
	const name = useTileName(kind);
	const p = pin ? { ...pin, kind } : null;
	return (
		<TileCard
			title={name}
			data={data}
			offText={format(t.knowledge.dashboards.off, { name: data?.off ?? kind })}
			labels={useTileLabels()}
			pinned={p ? pinned(p) : undefined}
			onPin={p ? () => toggle(p) : undefined}
			actions={actions}
		/>
	);
}

function DashboardView({ slug }: { slug: string }) {
	const { t } = useI18n();
	const k = t.knowledge.dashboards;
	const { view, error, save } = useDashboard(slug);
	const [failure, setFailure] = useState<string | null>(null);
	if (!view)
		return error ? (
			<p role="alert" className="px-3 py-1 text-ui text-danger-text">
				{error}
			</p>
		) : null;
	const dash: Dashboard = view.value;
	// A move saves to the file and makes no commit (REQ-022).
	const move = async (id: string, dx: number) => {
		try {
			setFailure(null);
			await save({
				...dash,
				tiles: dash.tiles.map((x) =>
					x.id === id ? { ...x, x: Math.min(COLUMNS - x.w, Math.max(0, x.x + dx)) } : x,
				),
			});
		} catch (e) {
			setFailure(message(e));
		}
	};
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-4 pt-1 pb-4">
			{view.readOnly ? <Badge variant="warning">{k.readOnly}</Badge> : null}
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
				{dash.tiles.map((x) => (
					<li
						key={x.id}
						className="min-w-0"
						style={{ gridColumn: `${x.x + 1} / span ${x.w}`, gridRow: `${x.y + 1} / span ${x.h}` }}
					>
						<Tile
							kind={x.kind}
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
									</>
								)
							}
						/>
					</li>
				))}
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
	// The first dashboard holds every tile of the catalogue, two to a row.
	const create = async () => {
		try {
			setFailure(null);
			const tiles = TILE_KINDS.map((kind, i) => ({
				id: kind,
				kind,
				x: (i % 3) * 4,
				y: Math.floor(i / 3) * 3,
				w: 4,
				h: 3,
			}));
			await unwrap(commands.dashboardSaveOne("team", { title: k.title, tiles }, null));
			await list.refetch();
			setChosen("team");
		} catch (e) {
			setFailure(message(e));
		}
	};
	return (
		<ListDetail
			title={k.title}
			icon={<Squares2X2Icon size={16} />}
			count={entries.length}
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
						action={{ label: k.title, icon: <PlusIcon size={14} />, onClick: () => void create() }}
					/>
				</div>
			) : null}
		</ListDetail>
	);
}
