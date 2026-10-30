import { useState } from "react";
import {
	COMMIT_TYPES,
	type MergeOutcome,
	mergeKey,
	type RebaseOutcome,
	rebaseKey,
	useBranches,
	useChanges,
	useCodeActions,
	useConflicts,
} from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { copyText, useMenus } from "@/lib/menus";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { ArrowPathIcon, CheckIcon, PlusIcon, ShareIcon } from "@/ui/icons";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { ConflictPane } from "./changes";
import { withProject } from "./project-gate";
import { GateNotice } from "./push-target";
import { useRun } from "./use-run";

/** Create a branch as `<type>/<area>/<kebab>` from the current head (REQ-012). */
function CreateBranch({ run }: { run: (job: () => Promise<unknown>) => void }) {
	const { t } = useI18n();
	const { createBranch } = useCodeActions();
	const [type, setType] = useState<string>(COMMIT_TYPES[0]);
	const [area, setArea] = useState("");
	const [subject, setSubject] = useState("");
	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		run(async () => {
			await createBranch(`${type}/${area.trim()}/${subject.trim()}`);
			setArea("");
			setSubject("");
		});
	};
	return (
		<form onSubmit={submit} className="flex items-center gap-2">
			<Select
				label={t.code.type}
				items={COMMIT_TYPES.map((c) => ({ value: c, label: c }))}
				value={type}
				onValueChange={setType}
				className="min-w-28"
			/>
			<Input
				label={t.code.area}
				className="w-32"
				value={area}
				onChange={(e) => setArea(e.target.value)}
			/>
			<Input
				label={t.code.subject}
				className="w-48"
				value={subject}
				onChange={(e) => setSubject(e.target.value)}
			/>
			<Button type="submit" variant="primary">
				<PlusIcon size={14} />
				{t.code.create}
			</Button>
		</form>
	);
}

function BranchesView() {
	const { t } = useI18n();
	const menu = useMenus();
	const branches = useBranches().data ?? [];
	const {
		switchBranch,
		deleteBranch,
		mergeBranch,
		abortMerge,
		rebaseBranch,
		continueRebase,
		abortRebase,
		fetch,
		push,
		pushForce,
	} = useCodeActions();
	const changes = useChanges().data;
	const merging = changes?.merging ?? false;
	const rebasing = changes?.rebasing ?? false;
	const busy = merging || rebasing;
	const [rebased, setRebased] = useState<RebaseOutcome | null>(null);
	const [forcing, setForcing] = useState(false);
	const conflicts = useConflicts().data ?? [];
	const [merged, setMerged] = useState<MergeOutcome | null>(null);
	const { error, run: runJob } = useRun();
	const [confirming, setConfirming] = useState<string | null>(null);
	const run = (job: () => Promise<unknown>) => void runJob(job);
	const groups = [
		{ id: "local", title: t.code.local, items: branches.filter((b) => b.kind === "local") },
		{ id: "remote", title: t.code.remote, items: branches.filter((b) => b.kind === "remote") },
	];
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader
				icon={<ShareIcon size={16} />}
				title={t.tabs.code.branches}
				count={branches.length}
				action={<CreateBranch run={run} />}
			/>
			<div className="flex items-center gap-2 px-4 pb-2">
				<Button variant="ghost" onClick={() => run(fetch)}>
					<ArrowPathIcon size={14} />
					{t.code.fetch}
				</Button>
				<Button variant="ghost" onClick={() => run(push)}>
					{t.code.publish}
				</Button>
				{forcing ? (
					<Button
						variant="danger"
						onClick={() =>
							run(async () => {
								setForcing(false);
								await pushForce();
							})
						}
					>
						{t.code.confirmForcePublish}
					</Button>
				) : (
					<Button variant="ghost" onClick={() => setForcing(true)}>
						{t.code.forcePublish}
					</Button>
				)}
			</div>
			<GateNotice push />
			{error ? (
				<p role="alert" className="px-3 py-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{merging ? (
				<div className="flex items-center gap-2 border-b px-3 py-2">
					<p role="status" className="flex-1 text-ui">
						{format(t.code.mergeProgress, { count: conflicts.length })}
					</p>
					<Button
						variant="danger"
						onClick={() =>
							run(async () => {
								setMerged(null);
								await abortMerge();
							})
						}
					>
						{t.code.mergeAbort}
					</Button>
				</div>
			) : merged ? (
				<p role="status" className="px-3 py-2 text-ui">
					{t.code.mergeResult[mergeKey(merged)]}
				</p>
			) : null}
			{rebasing ? (
				<div className="flex items-center gap-2 border-b px-3 py-2">
					<p role="status" className="flex-1 text-ui">
						{format(t.code.rebaseProgress, { count: conflicts.length })}
					</p>
					<Button
						variant="primary"
						disabled={conflicts.length > 0}
						onClick={() => run(async () => setRebased(await continueRebase()))}
					>
						{t.code.rebaseContinue}
					</Button>
					<Button
						variant="danger"
						onClick={() =>
							run(async () => {
								setRebased(null);
								await abortRebase();
							})
						}
					>
						{t.code.rebaseAbort}
					</Button>
				</div>
			) : rebased ? (
				<p role="status" className="px-3 py-2 text-ui">
					{t.code.rebaseResult[rebaseKey(rebased)]}
				</p>
			) : null}
			{busy ? conflicts.map((c) => <ConflictPane key={c.path} file={c} run={run} />) : null}
			<div className="grid gap-3 px-4 pt-1 pb-4 xl:grid-cols-2">
				{groups.map((g) => (
					<Panel
						key={g.id}
						title={g.title}
						count={g.items.length}
						tone={g.id === "local" ? "accent" : "info"}
						flush
						className="self-start"
					>
						{g.items.map((b) => (
							<ContextMenu
								key={b.name}
								items={menu("branch", {
									switch: b.is_head ? undefined : () => run(() => switchBranch(b.name)),
									"copy-ref": () => copyText(b.name),
								})}
							>
								<SettingsRow icon={b.is_head ? <CheckIcon size={14} /> : undefined} label={b.name}>
									{b.ahead ? (
										<Badge variant="success">{format(t.code.ahead, { count: b.ahead })}</Badge>
									) : null}
									{b.behind ? (
										<Badge variant="warning">{format(t.code.behind, { count: b.behind })}</Badge>
									) : null}
									<Button
										variant="ghost"
										disabled={b.is_head}
										onClick={() => run(() => switchBranch(b.name))}
									>
										{t.code.switch}
									</Button>
									{!b.is_head && !busy ? (
										<>
											<Button
												variant="ghost"
												aria-label={format(t.code.mergeBranch, { name: b.name })}
												onClick={() => run(async () => setMerged(await mergeBranch(b.name)))}
											>
												{t.code.merge}
											</Button>
											<Button
												variant="ghost"
												aria-label={format(t.code.rebaseBranch, { name: b.name })}
												onClick={() => run(async () => setRebased(await rebaseBranch(b.name)))}
											>
												{t.code.rebase}
											</Button>
										</>
									) : null}
									{b.kind === "local" && !b.is_head ? (
										confirming === b.name ? (
											<Button
												variant="danger"
												onClick={() =>
													run(async () => {
														setConfirming(null);
														await deleteBranch(b.name, false);
													})
												}
											>
												{format(t.code.confirmDelete, { name: b.name })}
											</Button>
										) : (
											<Button variant="ghost" onClick={() => setConfirming(b.name)}>
												{t.code.delete}
											</Button>
										)
									) : null}
								</SettingsRow>
							</ContextMenu>
						))}
					</Panel>
				))}
			</div>
		</div>
	);
}

export const Branches = withProject(BranchesView);
