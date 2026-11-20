import { Menu } from "@base-ui/react/menu";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useId, useState } from "react";
import { featureHref, useFeatures } from "@/features/flow/feature";
import { CloneDialog } from "@/features/projects/clone-dialog";
import { useActions } from "@/features/shell/actions";
import {
	type Branch,
	COMMIT_TYPES,
	type MergeOutcome,
	mergeKey,
	type RebaseOutcome,
	rebaseKey,
	useBranches,
	useChanges,
	useCodeActions,
	useConflicts,
	useLog,
} from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { copyText, useMenus } from "@/lib/menus";
import { RightButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { linkClass } from "@/ui/atoms/link-button";
import { Progress } from "@/ui/atoms/progress";
import { Select } from "@/ui/atoms/select";
import { Card } from "@/ui/molecules/card";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { MenuList } from "@/ui/molecules/menu-button";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { featureOf } from "./branches-feature";
import { ConflictPane } from "./changes";
import { OriginPanel } from "./origin-panel";
import { withProject } from "./project-gate";
import { GateNotice } from "./push-target";
import { useRun } from "./use-run";

const DANGER = "text-danger-text";

/** Create a branch as `<type>/<area>/<kebab>` from the current head (REQ-012). */
function CreateBranch({
	run,
	onDone,
}: {
	run: (job: () => Promise<unknown>) => void;
	onDone: () => void;
}) {
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
			onDone();
		});
	};
	return (
		<Card pad className="mx-4 mb-6">
			<form onSubmit={submit} className="flex flex-wrap items-center gap-2.5">
				<Select
					label={t.code.type}
					items={COMMIT_TYPES.map((c) => ({ value: c, label: c }))}
					value={type}
					onValueChange={setType}
					className="min-w-28"
				/>
				<Input
					label={t.code.area}
					className="flex-[1_1_120px]"
					value={area}
					onChange={(e) => setArea(e.target.value)}
				/>
				<Input
					label={t.code.subject}
					className="flex-[2_1_200px]"
					value={subject}
					onChange={(e) => setSubject(e.target.value)}
				/>
				<RightButton right="code.write" type="submit" variant="primary">
					{t.forge.branches.createBranch}
				</RightButton>
			</form>
		</Card>
	);
}

/** Ahead or Behind: the word, a bar and the number. The bar is full at `max`. */
function Count({
	label,
	name,
	value,
	max,
}: {
	label: string;
	name: string;
	value: number;
	max: number;
}) {
	return (
		<div className="grid grid-cols-[72px_1fr_auto] items-center gap-3.5">
			<span className="text-n-11">{label}</span>
			<Progress value={value} max={max} label={name} />
			<span>{value}</span>
		</div>
	);
}

/** One branch as a card: the name, its pill, its feature, the two bars and its actions. */
function BranchCard({
	branch,
	pill,
	feature,
	max,
	children,
}: {
	branch: Branch;
	pill: ReactNode;
	feature: ReactNode;
	max: number;
	children: ReactNode;
}) {
	const { t } = useI18n();
	const id = useId();
	return (
		<Card
			pad
			role="group"
			aria-labelledby={id}
			className={cn("flex flex-col gap-3.5", branch.is_head && "outline-2 outline-accent")}
		>
			<div className="flex items-center gap-2.5">
				<span
					id={id}
					title={branch.name}
					className="min-w-0 truncate font-mono text-17 font-semibold"
				>
					{branch.name}
				</span>
				<span className="ml-auto flex shrink-0">{pill}</span>
			</div>
			{feature}
			<Count
				label={t.forge.branches.ahead}
				name={format(t.code.ahead, { count: branch.ahead })}
				value={branch.ahead}
				max={max}
			/>
			<Count
				label={t.forge.branches.behind}
				name={format(t.code.behind, { count: branch.behind })}
				value={branch.behind}
				max={max}
			/>
			<div className="mt-auto flex flex-wrap gap-2.5">{children}</div>
		</Card>
	);
}

function BranchesView() {
	const { t } = useI18n();
	const b18 = t.forge.branches;
	const menu = useMenus();
	const { can, gate } = useRights();
	const { ask } = useShell();
	const { sync, fetch: fetchAction, push: pushAction } = useActions();
	const branches = useBranches().data ?? [];
	const features = useFeatures().data ?? [];
	// A branch whose tip is in the history of the working branch is merged.
	const history = new Set(
		useLog()
			.data?.pages.flatMap((p) => p.commits)
			.map((c) => c.sha),
	);
	const {
		switchBranch,
		deleteBranch,
		mergeBranch,
		abortMerge,
		rebaseBranch,
		continueRebase,
		abortRebase,
		pushForce,
	} = useCodeActions();
	const changes = useChanges().data;
	const merging = changes?.merging ?? false;
	const rebasing = changes?.rebasing ?? false;
	const busy = merging || rebasing;
	const [rebased, setRebased] = useState<RebaseOutcome | null>(null);
	const [forcing, setForcing] = useState(false);
	const [creating, setCreating] = useState(false);
	const [cloning, setCloning] = useState(false);
	const [remotes, setRemotes] = useState(false);
	const conflicts = useConflicts().data ?? [];
	const [merged, setMerged] = useState<MergeOutcome | null>(null);
	const { error, run: runJob } = useRun();
	const [confirming, setConfirming] = useState<string | null>(null);
	const run = (job: () => Promise<unknown>) => void runJob(job);
	const locals = branches.filter((b) => b.kind === "local");
	const remote = branches.filter((b) => b.kind === "remote");
	const head = locals.find((b) => b.is_head);
	// One scale for every bar: ten commits, or the largest count.
	const max = Math.max(10, ...locals.flatMap((b) => [b.ahead, b.behind]));
	const writes = can("code.write");
	const write = gate("code.write");
	const merge = (b: Branch) => (
		<RightButton
			right="code.write"
			aria-label={format(t.code.mergeBranch, { name: b.name })}
			onClick={() => run(async () => setMerged(await mergeBranch(b.name)))}
		>
			{t.code.merge}
		</RightButton>
	);
	const rebase = (name: string) => run(async () => setRebased(await rebaseBranch(name)));
	// The rarer actions of the page: the page header has no menu, they sit behind "More" at the end.
	const moreItems = [
		...(busy
			? []
			: locals
					.filter((b) => !b.is_head)
					.map((b) => ({
						id: `rebase:${b.name}`,
						label: format(t.code.rebaseBranch, { name: b.name }),
						...write,
						onSelect: () => rebase(b.name),
					}))),
		{
			id: "force",
			label: t.code.forcePublish,
			...write,
			onSelect: () => setForcing(true),
		},
		{ id: "remotes", label: b18.remotes, onSelect: () => setRemotes(!remotes) },
	];
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader title={t.tabs.code.branches} />
			<GateNotice push />
			{/* biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box */}
			<div
				role="group"
				aria-label={b18.actions}
				className="flex flex-wrap items-center gap-4 px-4 pb-6"
			>
				<Button onClick={fetchAction.run} disabled={fetchAction.disabled}>
					{t.code.fetch}
				</Button>
				<RightButton right="code.write" onClick={pushAction.run} disabled={pushAction.disabled}>
					{b18.push}
					{head?.ahead ? (
						<Badge variant="accent">{format(b18.toSend, { count: head.ahead })}</Badge>
					) : null}
				</RightButton>
				<Button variant="primary" onClick={sync.run} disabled={sync.disabled}>
					{sync.label}
					{head?.behind ? <Badge>{format(b18.toGet, { count: head.behind })}</Badge> : null}
				</Button>
				<span className="flex-1" />
				<Button onClick={() => setCloning(true)}>{t.projects.clone}</Button>
				<RightButton
					right="code.write"
					aria-expanded={creating}
					onClick={() => setCreating(!creating)}
				>
					{b18.newBranch}
				</RightButton>
			</div>
			{creating ? <CreateBranch run={run} onDone={() => setCreating(false)} /> : null}
			{forcing ? (
				<div className="flex flex-wrap items-center gap-2.5 px-4 pb-4">
					<RightButton
						right="code.write"
						variant="danger"
						onClick={() =>
							run(async () => {
								setForcing(false);
								await pushForce();
							})
						}
					>
						{t.code.confirmForcePublish}
					</RightButton>
					<Button variant="ghost" onClick={() => setForcing(false)}>
						{b18.cancel}
					</Button>
				</div>
			) : null}
			{error ? (
				<p role="alert" className="px-4 py-2 text-danger-text">
					{error}
				</p>
			) : null}
			{merging ? (
				<div className="flex items-center gap-2 px-4 py-2">
					<p role="status" className="flex-1">
						{format(t.code.mergeProgress, { count: conflicts.length })}
					</p>
					<RightButton
						right="code.write"
						variant="danger"
						onClick={() =>
							run(async () => {
								setMerged(null);
								await abortMerge();
							})
						}
					>
						{t.code.mergeAbort}
					</RightButton>
				</div>
			) : merged ? (
				<p role="status" className="px-4 py-2">
					{t.code.mergeResult[mergeKey(merged)]}
				</p>
			) : null}
			{rebasing ? (
				<div className="flex items-center gap-2 px-4 py-2">
					<p role="status" className="flex-1">
						{format(t.code.rebaseProgress, { count: conflicts.length })}
					</p>
					<RightButton
						right="code.write"
						variant="primary"
						disabled={conflicts.length > 0}
						onClick={() => run(async () => setRebased(await continueRebase()))}
					>
						{t.code.rebaseContinue}
					</RightButton>
					<RightButton
						right="code.write"
						variant="danger"
						onClick={() =>
							run(async () => {
								setRebased(null);
								await abortRebase();
							})
						}
					>
						{t.code.rebaseAbort}
					</RightButton>
				</div>
			) : rebased ? (
				<p role="status" className="px-4 py-2">
					{t.code.rebaseResult[rebaseKey(rebased)]}
				</p>
			) : null}
			{busy ? conflicts.map((c) => <ConflictPane key={c.path} file={c} run={run} />) : null}
			<div className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-3.5 px-4 pb-6">
				{locals.map((b) => {
					const feature = featureOf(b.name, features);
					const done = !b.is_head && history.has(b.tip);
					return (
						<ContextMenu
							key={b.name}
							items={menu("branch", {
								switch: b.is_head || !writes ? undefined : () => run(() => switchBranch(b.name)),
								"copy-ref": () => copyText(b.name),
							})}
						>
							<BranchCard
								branch={b}
								max={max}
								pill={
									b.is_head ? (
										<Badge variant="accent">{b18.here}</Badge>
									) : done ? (
										<Badge>{b18.merged}</Badge>
									) : feature?.who?.agent ? (
										<Avatar name={feature.who.name} size="s" agent />
									) : null
								}
								feature={
									feature ? (
										<Link {...featureHref(feature)} className={linkClass}>
											{feature.title}
										</Link>
									) : null
								}
							>
								{b.is_head ? null : (
									<RightButton
										right="code.write"
										variant={done ? "secondary" : "primary"}
										onClick={() => run(() => switchBranch(b.name))}
									>
										{t.code.switch}
									</RightButton>
								)}
								{!(b.is_head || busy || done) ? merge(b) : null}
								<RightButton
									right="code.write"
									aria-label={format(b18.renameBranch, { name: b.name })}
									onClick={() => ask(format(b18.renameAsk, { name: b.name }))}
								>
									{b18.rename}
								</RightButton>
								{b.is_head ? null : confirming === b.name ? (
									<RightButton
										right="code.write"
										variant="danger"
										title={b.name}
										className="max-w-full truncate"
										onClick={() =>
											run(async () => {
												setConfirming(null);
												await deleteBranch(b.name, false);
											})
										}
									>
										{format(t.code.confirmDelete, { name: b.name })}
									</RightButton>
								) : (
									<RightButton
										right="code.write"
										className={DANGER}
										onClick={() => setConfirming(b.name)}
									>
										{t.code.delete}
									</RightButton>
								)}
							</BranchCard>
						</ContextMenu>
					);
				})}
			</div>
			{remotes ? (
				<Card className="mx-4 mb-6 py-2">
					<section aria-label={b18.remotes}>
						<h2 className="px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11">{b18.remotes}</h2>
						{remote.map((b) => (
							<Row
								key={b.name}
								render={(props) => (
									// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
									<div role="group" aria-label={b.name} {...props} />
								)}
							>
								<span title={b.name} className="mr-auto min-w-0 truncate font-mono">
									{b.name}
								</span>
								<RightButton right="code.write" onClick={() => run(() => switchBranch(b.name))}>
									{t.code.switch}
								</RightButton>
								{busy ? null : (
									<>
										{merge(b)}
										<RightButton
											right="code.write"
											aria-label={format(t.code.rebaseBranch, { name: b.name })}
											onClick={() => rebase(b.name)}
										>
											{t.code.rebase}
										</RightButton>
									</>
								)}
							</Row>
						))}
					</section>
				</Card>
			) : null}
			<OriginPanel />
			<div className="px-4 pb-10">
				<Menu.Root>
					<Menu.Trigger className={linkClass}>{t.ui.more}</Menu.Trigger>
					<MenuList items={moreItems} />
				</Menu.Root>
			</div>
			<CloneDialog open={cloning} onClose={() => setCloning(false)} />
		</div>
	);
}

export const Branches = withProject(BranchesView, "branches");
