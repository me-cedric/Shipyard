import { useQueries } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PlanBlock, planOf } from "@/features/factory/runs/plan";
import { type RunScopeData, useRunScope } from "@/features/factory/runs/run-detail";
import { nameOf } from "@/features/factory/runs/run-live";
import { SplitFlow } from "@/features/specs/split";
import { useGuard } from "@/features/work/guard";
import { type QuestionItem, useInboxActions } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import {
	artifactPath,
	type Change,
	capabilityOf,
	specsKeys,
	useChanges,
	useFile,
	useFoldTargets,
	useQuestions,
	useRequirements,
	useSpecsActions,
} from "@/lib/specs";
import { useWorkItems } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { LinkButton, linkClass } from "@/ui/atoms/link-button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ATTENTION_FRAME } from "@/ui/molecules/attention-card";
import { Card } from "@/ui/molecules/card";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Row } from "@/ui/molecules/row";
import { CARD_LABEL, DesignToCode, forDesign, SCREEN_BOX, useCited } from "./design";
import { LinkDesign } from "./link-design";
import { keyOf, WriteSpec } from "./start";
import type { Parts } from "./use-feature";

/** One open question of the agent: an option answers with one click, and Enter sends another answer. */
function QuestionCard({ item }: { item: QuestionItem }) {
	const { t } = useI18n();
	const b = t.flow.look.brief;
	const act = useInboxActions();
	const scope = useRunScope();
	const { error, run } = useGuard();
	const [text, setText] = useState("");
	const q = item.question;
	const agent = nameOf(scope?.run.workflow ?? "");
	return (
		<Card pad className={cn("flex flex-col gap-4", ATTENTION_FRAME)}>
			<div className="flex items-center gap-3">
				<Avatar name={agent} agent />
				<span className="font-semibold">{format(b.asks, { name: agent })}</span>
				<Badge variant="you" className="ml-auto">
					{b.openQuestion}
				</Badge>
			</div>
			<h2 className="text-30 font-semibold text-n-12">{q.question}</h2>
			{q.unclear ? (
				<p role="note" aria-label={t.home.unclear} className="text-n-12">
					{q.unclear}
				</p>
			) : null}
			{q.edited ? <p className="text-warning-text">{t.home.edited}</p> : null}
			<form
				className="flex flex-wrap gap-2.5"
				onSubmit={(e) => {
					e.preventDefault();
					const answer = text.trim();
					if (answer) void run(() => act.answer(item.run, q.id, { kind: "text", text: answer }));
				}}
			>
				{q.options.map((label, i) => (
					<Button
						key={label}
						onClick={() => void run(() => act.answer(item.run, q.id, { kind: "option", n: i + 1 }))}
					>
						{label}
						{i + 1 === q.recommended ? (
							<StatusDot status="success" label={t.home.recommended} />
						) : null}
					</Button>
				))}
				{q.free_text ? (
					<Input
						label={b.anotherAnswer}
						className="flex-[1_1_200px]"
						value={text}
						onChange={(e) => setText(e.target.value)}
					/>
				) : null}
			</form>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</Card>
	);
}

/** An open question of the specs of the change: Enter folds the answer into the spec. */
function SpecQuestionCard({
	id,
	title,
	owner,
	capability,
}: {
	id: string;
	title: string;
	owner: string;
	capability: string;
}) {
	const { t } = useI18n();
	const b = t.flow.look.brief;
	const act = useSpecsActions();
	const { error, run } = useGuard();
	const [text, setText] = useState("");
	const target = useFoldTargets(id, capability)[0] ?? "";
	const stamp = useFile(target || null).data?.stamp;
	return (
		<Card pad className={cn("flex flex-col gap-4", ATTENTION_FRAME)}>
			<div className="flex items-center gap-3">
				<Avatar name={owner} />
				<span className="font-semibold">
					{format(b.asks, { name: owner.charAt(0).toUpperCase() + owner.slice(1) })}
				</span>
				<Badge variant="you" className="ml-auto">
					{b.openQuestion}
				</Badge>
			</div>
			<h2 className="text-30 font-semibold text-n-12">{title}</h2>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					const answer = text.trim();
					if (answer && target && stamp)
						void run(async () => {
							const w = await act.fold(target, id, answer, stamp);
							if (w.conflict) throw new Error(t.specs.question.conflict);
						});
				}}
			>
				<Input label={b.anotherAnswer} value={text} onChange={(e) => setText(e.target.value)} />
			</form>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</Card>
	);
}

/** "What it must do": one row for each requirement of the specs of the change, with the state of its test. */
function Requirements({ change, featureId }: { change: Change; featureId: string }) {
	const { t } = useI18n();
	const b = t.flow.look.brief;
	const navigate = useNavigate();
	const specs = change.artifacts.filter((a) => a.artifact === "spec" && a.status !== "missing");
	const views = useQueries({
		queries: specs.map((a) => ({
			queryKey: specsKeys.spec(artifactPath(change, a)),
			queryFn: () => unwrap(commands.specsSpec(artifactPath(change, a))),
			retry: false,
		})),
	});
	const tests = useRequirements().data ?? [];
	const rows = specs.flatMap((a, i) =>
		(views[i]?.data?.requirements ?? []).map((r) => {
			const ref = `spec:${a.capability}#${r.id}`;
			const verdicts = (tests.find((x) => x.reference === ref)?.scenarios ?? []).map(
				(x) => x.verdict,
			);
			const pass = verdicts.length > 0 && verdicts.every((v) => v === "pass");
			return { ref, title: r.title, pass, fail: verdicts.includes("fail") };
		}),
	);
	const files = (view: "text" | "form") =>
		void navigate({
			to: "/flow/feature/$featureId/spec",
			params: { featureId },
			search: { file: "spec", view },
		});
	return (
		<Card pad>
			<section aria-label={b.must} className="flex flex-col gap-3.5">
				<h2 className="text-17 font-semibold text-n-12">{b.must}</h2>
				{rows.length ? (
					<ul className="flex flex-col gap-3.5">
						{rows.map((r) => (
							<li
								key={r.ref}
								className="flex flex-wrap items-center gap-3 rounded-field bg-n-2 p-4"
							>
								<svg
									aria-hidden="true"
									viewBox="0 0 24 24"
									className={cn(
										"size-5 shrink-0 fill-none stroke-current stroke-[1.8]",
										r.pass ? "text-success-text" : "text-n-11",
									)}
								>
									<circle cx="12" cy="12" r="9" />
									{r.pass ? <path d="M8 12.5l2.5 2.5L16 9.5" /> : null}
								</svg>
								<span className="min-w-0 flex-[1_1_240px] text-17">{r.title}</span>
								<Badge variant={r.pass ? "success" : r.fail ? "danger" : "neutral"}>
									{r.pass ? b.testPasses : r.fail ? b.testFails : b.noTest}
								</Badge>
							</li>
						))}
					</ul>
				) : null}
				<div className="flex flex-wrap gap-2.5">
					<Button onClick={() => files("form")}>{b.addRequirement}</Button>
					<Button onClick={() => files("text")}>{b.editText}</Button>
					<Button onClick={() => void navigate({ to: "/library/test-plans" })}>{b.testPlan}</Button>
				</div>
			</section>
		</Card>
	);
}

const TONE = { "in-progress": "accent", done: "success" } as const;

/**
 * Brief: the open question, the plan in review, what the feature must do, and in the side column the
 * design, the tickets and the links of the feature.
 */
export function Brief({ parts }: { parts: Parts; onBack?: () => void }) {
	const { t } = useI18n();
	const b = t.flow.look.brief;
	const navigate = useNavigate();
	const { openRef } = useShell();
	const scope = useRunScope();
	const change = useChanges().data?.find((c) => `change:${c.id}` === parts.change);
	const plan = scope && scope.run.state === "PlanReview" ? planOf(scope.events) : null;
	const key = keyOf(parts.ticket);
	const cited = useCited(parts);
	const screens = cited.filter((c) => c.kind === "screen");
	const items = useWorkItems({}).data ?? [];
	// The ticket of the feature first, then each ticket that cites one of its parts.
	const keys = [
		...new Set([
			...(key ? [key] : []),
			...cited.filter((c) => c.kind === "wi").map((c) => keyOf(c.ref) ?? ""),
		]),
	];
	const [splitting, setSplitting] = useState(false);
	const capabilities = [
		...new Set((change?.artifacts ?? []).flatMap((a) => (a.capability ? [a.capability] : []))),
	];
	const asked = (useQuestions().data ?? []).filter(
		(e) => e.question.status === "open" && capabilities.includes(capabilityOf(e.question.specRef)),
	);
	const links = cited.filter((c) => c.kind !== "wi" && c.kind !== "screen");
	const first = screens[0];
	return (
		<div className="flex flex-wrap items-start gap-6">
			<div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
				{scope?.waits.questions
					.filter((x) => !forDesign(x))
					.map((x) => (
						<QuestionCard key={`${x.run}:${x.question.id}`} item={x} />
					))}
				{asked.map((e) => (
					<SpecQuestionCard
						key={e.question.id}
						id={e.question.id}
						title={e.question.title}
						owner={e.question.owner || e.question.raisedBy}
						capability={capabilityOf(e.question.specRef)}
					/>
				))}
				{scope && plan ? <PlanReview scope={scope} plan={plan} /> : null}
				{change ? (
					<Requirements change={change} featureId={parts.change ?? ""} />
				) : (
					<Card>
						<EmptyState title={t.flow.feature.noSpec} extra={<WriteSpec parts={parts} />} />
					</Card>
				)}
			</div>
			<div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
				<Card pad>
					<section aria-label={b.design} className="flex flex-col gap-3">
						<h2 className={CARD_LABEL}>{b.design}</h2>
						<div className={`${SCREEN_BOX} min-h-37 flex-col gap-1`}>
							{screens.length
								? screens.map((s) => (
										<LinkButton
											key={s.ref}
											className="self-center font-normal text-n-11"
											onClick={() => openRef(s.ref)}
										>
											{s.title}
										</LinkButton>
									))
								: b.noScreen}
						</div>
						<div className="flex flex-wrap gap-2.5">
							<Button
								className="flex-[1_1_120px]"
								onClick={() => void navigate({ to: "/library/screens" })}
							>
								{b.openScreens}
							</Button>
							{change ? <LinkDesign kind="screen" change={change} /> : null}
							{first ? <DesignToCode screen={first} className="flex-[1_1_120px]" /> : null}
						</div>
					</section>
				</Card>
				{keys.length || change ? (
					<Card className="py-2">
						<section aria-label={b.tickets}>
							<h2 className={`${CARD_LABEL} px-6 pt-3.5 pb-1.5`}>{b.tickets}</h2>
							{keys.map((k) => {
								const item = items.find((i) => i.key === k);
								const title = item?.title ?? cited.find((c) => c.ref === `wi:${k}`)?.title ?? k;
								return (
									<Row
										key={k}
										render={(p) => (
											<button
												type="button"
												onClick={() => openRef(`wi:${k}`)}
												{...p}
												className={cn(p.className, "text-left")}
											/>
										)}
									>
										{item?.assignee ? <Avatar name={item.assignee} /> : null}
										<span className="min-w-0 flex-1 font-semibold">{title}</span>
										{item ? (
											<Badge variant={TONE[item.category as keyof typeof TONE] ?? "neutral"}>
												{item.status}
											</Badge>
										) : null}
									</Row>
								);
							})}
							{change ? (
								<Row>
									<LinkButton className="self-center" onClick={() => setSplitting(true)}>
										{b.splitMore}
									</LinkButton>
								</Row>
							) : null}
						</section>
					</Card>
				) : null}
				{change || links.length ? (
					<Card pad>
						<section aria-label={b.linked} className="flex flex-col gap-2.5">
							<h2 className={CARD_LABEL}>{b.linked}</h2>
							{capabilities.map((c) => (
								<LinkButton key={c} onClick={() => openRef(`spec:${c}`)}>
									{format(b.named, { kind: t.refKind.spec, title: c })}
								</LinkButton>
							))}
							{change ? (
								<Link
									to="/flow/feature/$featureId/spec"
									params={{ featureId: parts.change ?? "" }}
									className={linkClass}
								>
									{b.filesOfChange}
								</Link>
							) : null}
							{links.map((c) => (
								<LinkButton key={c.ref} onClick={() => openRef(c.ref)}>
									{format(b.named, {
										kind: (t.refKind as Record<string, string>)[c.kind] ?? c.kind,
										title: c.title,
									})}
								</LinkButton>
							))}
						</section>
					</Card>
				) : null}
			</div>
			{splitting && change ? (
				<SplitFlow change={change.id} onClose={() => setSplitting(false)} />
			) : null}
		</div>
	);
}

/** The plan that waits for a review, with its approval. */
export function PlanReview({
	scope,
	plan,
}: {
	scope: RunScopeData;
	plan: NonNullable<ReturnType<typeof planOf>>;
}) {
	const { t } = useI18n();
	const { run, act, guard } = scope;
	return (
		<div className="flex flex-col gap-2">
			<PlanBlock plan={plan} />
			<div>
				<RightButton
					right="runs.approve"
					className="min-h-control"
					variant="primary"
					onClick={() => void guard(() => act.planApprove(run.id))}
				>
					{t.factory.planApprove}
				</RightButton>
			</div>
		</div>
	);
}
