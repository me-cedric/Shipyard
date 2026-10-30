import { useQueries } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, type Requirement, unwrap } from "@/lib/ipc";
import { useShell } from "@/lib/shell";
import { type Capability, useCapabilities, useFile, useSpecView } from "@/lib/specs";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { BookOpenIcon, ChevronLeftIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { LIST, useEnter } from "@/ui/motion";
import { DataTable } from "@/ui/organisms/data-table";
import { ListDetail } from "@/ui/templates/list-detail";
import { WithProject } from "./no-project";

const FILES = ["spec", "plan", "checklist", "tasks"] as const;

/** One file of a settled capability, read only. */
function CapabilityFile({ path, name }: { path: string; name: string }) {
	const file = useFile(path);
	return (
		<CodeEditor label={name} value={file.data?.text ?? ""} readOnly className="min-h-0 flex-1" />
	);
}

/** A capability: its requirements with their ids, then its four files. A requirement opens in the inspector. */
function CapabilityDetail({ cap, onBack }: { cap: Capability; onBack: () => void }) {
	const { t } = useI18n();
	const s = t.specs;
	const { openRef } = useShell();
	const view = useSpecView(cap.path).data;
	const [file, setFile] = useState<(typeof FILES)[number]>("spec");
	const [selected, setSelected] = useState<string | null>(null);
	const reqs = view?.requirements ?? [];
	const refOf = (r: Requirement) => `spec:${cap.capability}#${r.id}`;
	const links = useQueries({
		queries: reqs.map((r) => ({
			queryKey: ["refs", "backlinks", refOf(r)],
			queryFn: () => unwrap(commands.refsBacklinks(refOf(r))),
		})),
	});
	const kinds = t.refKind as Record<string, string>;
	const columns = useMemo<ColumnDef<Requirement>[]>(
		() => [
			{
				id: "id",
				header: s.requirementId,
				meta: { width: "6rem" },
				cell: ({ row }) => <span className="font-mono text-12">{row.original.id}</span>,
			},
			{ id: "title", header: s.requirement, cell: ({ row }) => row.original.title },
			{
				id: "links",
				header: s.backlinks,
				meta: { width: "14rem" },
				cell: ({ row }) => (
					<span className="flex flex-wrap gap-1">
						{(links[row.index]?.data ?? []).map((g) => (
							<Badge key={g.kind} variant="accent" className="font-mono">
								{kinds[g.kind] ?? g.kind} {g.count}
							</Badge>
						))}
					</span>
				),
			},
		],
		[s, links, kinds],
	);
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-3 pb-4">
			<div className="flex items-center gap-2">
				<Button variant="ghost" onClick={onBack}>
					<ChevronLeftIcon size={14} />
					{s.back}
				</Button>
				<h1 className="font-mono text-20 font-semibold text-n-12">{cap.capability}</h1>
				<Badge variant="accent" className="font-mono">
					{cap.requirements}
				</Badge>
			</div>
			<div className="flex h-64 shrink-0 flex-col overflow-hidden rounded-lg border bg-surface-1 shadow-1">
				<DataTable
					label={s.requirements}
					data={view?.requirements ?? []}
					columns={columns}
					rowId={(r) => r.id}
					selected={selected}
					onOpen={(r) => {
						setSelected(r.id);
						openRef(`spec:${cap.capability}#${r.id}`);
					}}
				/>
			</div>
			<ViewTabs
				label={s.files}
				value={file}
				onValueChange={setFile}
				tabs={FILES.map((f) => ({ value: f, label: s.artifact[f] }))}
			/>
			<CapabilityFile
				key={file}
				path={cap.path.replace(/spec\.md$/, `${file}.md`)}
				name={s.artifact[file]}
			/>
		</div>
	);
}

/** Specs / Capabilities: the settled capabilities with their requirement counts. */
export function Capabilities() {
	const { t } = useI18n();
	return (
		<WithProject title={t.tabs.specs.capabilities}>
			<CapabilityList />
		</WithProject>
	);
}

function CapabilityList() {
	const { t } = useI18n();
	const s = t.specs;
	const list = useCapabilities().data ?? [];
	const [open, setOpen] = useState<string | null>(null);
	const enter = useEnter();
	const max = Math.max(1, ...list.map((c) => c.requirements));
	const current = list.find((c) => c.capability === open);
	if (current) return <CapabilityDetail cap={current} onBack={() => setOpen(null)} />;
	return (
		<ListDetail
			title={t.tabs.specs.capabilities}
			icon={<BookOpenIcon size={16} />}
			count={list.length}
		>
			<motion.ul
				aria-label={t.tabs.specs.capabilities}
				variants={LIST}
				initial={enter}
				animate="shown"
				className="grid min-h-0 auto-rows-min grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3 overflow-auto px-4 pt-1 pb-4"
			>
				{list.map((c) => (
					<li key={c.capability}>
						<Card interactive className="p-0">
							<button
								type="button"
								onClick={() => setOpen(c.capability)}
								className="flex w-full flex-col gap-3 rounded-lg p-3 text-left"
							>
								<span className="flex items-baseline gap-2">
									<span className="min-w-0 flex-1 truncate font-mono text-14 text-n-12">
										{c.capability}
									</span>
									<span className="font-mono text-20 text-n-12">{c.requirements}</span>
								</span>
								<span aria-hidden="true" className="flex items-center gap-2 text-12 text-n-11">
									{s.requirements}
									<span className="h-1.5 flex-1 overflow-hidden rounded-full bg-n-4">
										<span
											className="block h-full rounded-full bg-accent-gradient"
											style={{ width: `${(c.requirements / max) * 100}%` }}
										/>
									</span>
								</span>
							</button>
						</Card>
					</li>
				))}
			</motion.ul>
		</ListDetail>
	);
}
