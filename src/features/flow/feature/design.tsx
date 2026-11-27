import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useRunScope } from "@/features/factory/runs/run-detail";
import { agentOf } from "@/features/factory/runs/run-summary";
import { nextStep } from "@/features/specs/next-step";
import { SplitFlow } from "@/features/specs/split";
import { useGuard } from "@/features/work/guard";
import { designKeys, useDesignList } from "@/lib/design";
import { type QuestionItem, useInboxActions } from "@/lib/home";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useBacklinks } from "@/lib/refs";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useChanges, useFile, useSpecsActions } from "@/lib/specs";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { LinkButton } from "@/ui/atoms/link-button";
import { ChevronRightIcon, ShareIcon } from "@/ui/icons";
import { ATTENTION_FRAME } from "@/ui/molecules/attention-card";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Row } from "@/ui/molecules/row";
import { DESIGN_REF, DIAGRAMS, LinkDesign, proposalPath } from "./link-design";
import type { Parts } from "./use-feature";

export type Cited = { kind: string; ref: string; title: string };

/** The small grey heading of a card that holds rows. */
export const CARD_LABEL = "text-13 font-semibold text-n-11";
/** The dashed box that stands for a screen. */
export const SCREEN_BOX =
	"flex items-center justify-center rounded-field border border-dashed border-n-8 bg-n-2 p-4 text-center font-medium text-n-11";

const COLOR = /^(#|rgb|hsl|hwb|lab|lch|oklab|oklch|color\()/i;

/** A token name in plain words: "--accent-text" is "Accent text". */
const plain = (name: string) => {
	const w = name.replace(/^-+/, "").replace(/[-_]+/g, " ");
	return w.charAt(0).toUpperCase() + w.slice(1);
};

/** Each thing that cites a part of the feature, once, and each design item that its proposal names. */
export function useCited(parts: Parts): Cited[] {
	const change = useChanges().data?.find((c) => `change:${c.id}` === parts.change);
	const written = useFile(change ? proposalPath(change) : null).data?.text ?? "";
	const known = useDesignList().data?.artifacts ?? [];
	// Only a ref that the Library knows counts: other text can look like a ref ("data:image").
	const named = [...new Set(written.match(DESIGN_REF) ?? [])].flatMap((ref) => {
		const a = known.find((k) => k.reference === ref);
		return a ? [{ kind: ref.slice(0, ref.indexOf(":")), ref, title: a.title || ref }] : [];
	});
	const found = [
		useBacklinks(parts.ticket ?? null).data,
		useBacklinks(parts.change ?? null).data,
		useBacklinks(parts.run ?? null).data,
		useBacklinks(parts.pr ?? null).data,
	];
	const all = found.flatMap((groups) =>
		(groups ?? []).flatMap((g) =>
			g.items.map((i) => ({ kind: g.kind, ref: i.source, title: i.title || i.source })),
		),
	);
	return [...new Map([...named, ...all].map((c) => [c.ref, c])).values()];
}

/**
 * "Design to code": the next step of a screen (`spec:design#REQ-020`). A screen with no plan gets
 * one, and its Brief opens. A screen with a plan opens the split into tickets.
 */
export function DesignToCode({
	screen,
	primary,
	className,
}: {
	screen: Cited;
	primary?: boolean;
	className?: string;
}) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const act = useSpecsActions();
	const { failure, run } = useGuard();
	const [splitting, setSplitting] = useState<string | null>(null);
	const plan = useChanges().data?.find((c) => c.title.toLowerCase() === screen.title.toLowerCase());
	return (
		<>
			<RightButton
				right="specs.edit"
				variant={primary ? "primary" : "secondary"}
				className={className}
				onClick={() =>
					void run(async () => {
						if (nextStep(screen.ref, { plan }) === "split" && plan) return setSplitting(plan.id);
						const c = await act.createChange(screen.title);
						void navigate({
							to: "/flow/feature/$featureId",
							params: { featureId: `change:${c.id}` },
							search: { section: "brief" },
						});
					})
				}
			>
				{t.flow.look.brief.designToCode}
			</RightButton>
			<ErrorNotice error={failure} className="w-full" />
			{splitting ? <SplitFlow change={splitting} onClose={() => setSplitting(null)} /> : null}
		</>
	);
}

/** An agent question about a screen belongs to Design: it names a `screen:` ref. */
export const forDesign = (q: QuestionItem) => !!q.question.spec?.startsWith("screen:");

/** The decision of the agent about a screen: each option answers it with one click. */
function DesignAsk({ item }: { item: QuestionItem }) {
	const { t } = useI18n();
	const act = useInboxActions();
	const { failure, run } = useGuard();
	const scope = useRunScope();
	const q = item.question;
	const agent = scope ? agentOf(scope.run, t.factory.agentNames) : item.title;
	return (
		<Card pad className={`flex flex-col gap-3.5 ${ATTENTION_FRAME}`}>
			<div className="flex items-center gap-3">
				<Avatar agent name={agent} />
				<span className="font-semibold">{agent}</span>
			</div>
			<h2 className="text-20 font-semibold text-n-12">{q.question}</h2>
			<div className="flex flex-wrap gap-2.5">
				{q.options.map((label, i) => (
					<Button
						key={label}
						className="flex-[1_1_110px]"
						variant={i + 1 === q.recommended ? "primary" : "secondary"}
						onClick={() => void run(() => act.answer(item.run, q.id, { kind: "option", n: i + 1 }))}
					>
						{label}
					</Button>
				))}
			</div>
			<ErrorNotice error={failure} />
		</Card>
	);
}

function Head({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="flex flex-wrap items-center gap-4">
			<h2 className="mr-auto text-17 font-semibold text-n-12">{title}</h2>
			{children}
		</div>
	);
}

/** Design: the screens, the diagrams, the design tokens and the decisions that the feature cites. */
export function Design({ parts }: { parts: Parts }) {
	const { t } = useI18n();
	const b = t.flow.look.brief;
	const navigate = useNavigate();
	const { openRef } = useShell();
	const cited = useCited(parts);
	const change = useChanges().data?.find((c) => `change:${c.id}` === parts.change);
	const screens = cited.filter((c) => c.kind === "screen");
	const diagrams = cited.filter((c) => DIAGRAMS.includes(c.kind));
	const decisions = cited.filter((c) => c.kind === "adr");
	const adrs = useDesignList().data?.adrs ?? [];
	// The same read as the token view of Library / Screens.
	const tokens = (
		useQuery({
			queryKey: [...designKeys.list, "tokens"],
			queryFn: () => unwrap(commands.designTokens()),
		}).data ?? []
	)
		.flatMap((f) => f.tokens)
		.filter((x) => COLOR.test(x.value))
		.slice(0, 4);
	const first = screens[0];
	const asks = useRunScope()?.waits.questions.filter(forDesign) ?? [];
	return (
		<div className="flex flex-wrap items-start gap-6">
			<div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
				<Card pad className="flex flex-col gap-4">
					<section aria-label={b.screens} className="flex flex-col gap-4">
						<Head title={b.screens}>
							<Button onClick={() => void navigate({ to: "/library/screens" })}>
								{b.openScreens}
							</Button>
							{change ? <LinkDesign kind="screen" change={change} /> : null}
							{first ? <DesignToCode screen={first} primary /> : null}
						</Head>
						{screens.length ? (
							<ul className="grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-3.5">
								{screens.map((s) => (
									<li key={s.ref} className="flex flex-col">
										<div aria-hidden="true" className={`${SCREEN_BOX} h-55`}>
											{b.noPicture}
										</div>
										<LinkButton className="-mt-1 text-n-12" onClick={() => openRef(s.ref)}>
											{s.title}
										</LinkButton>
									</li>
								))}
							</ul>
						) : (
							<p className={`${SCREEN_BOX} h-55`}>{b.noScreen}</p>
						)}
					</section>
				</Card>
				<Card pad className="flex flex-col gap-4">
					<section aria-label={b.diagrams} className="flex flex-col gap-4">
						<Head title={b.diagrams}>
							<Button onClick={() => void navigate({ to: "/library/diagrams" })}>
								{b.openDiagrams}
							</Button>
							{change ? <LinkDesign kind="diagram" change={change} /> : null}
						</Head>
						{diagrams.length ? (
							diagrams.map((d) => (
								<button
									key={d.ref}
									type="button"
									onClick={() => openRef(d.ref)}
									className="flex min-h-15 items-center gap-3.5 rounded-field bg-n-2 px-4 text-left text-n-12 hover:bg-n-3"
								>
									<ShareIcon size={20} />
									<span className="min-w-0 flex-1 font-semibold">{d.title}</span>
									<ChevronRightIcon size={20} />
								</button>
							))
						) : (
							<p className="text-n-11">{b.noDiagram}</p>
						)}
					</section>
				</Card>
			</div>
			<div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
				{asks.map((x) => (
					<DesignAsk key={`${x.run}:${x.question.id}`} item={x} />
				))}
				<Card className="py-2">
					<section aria-label={b.tokens}>
						<h2 className={`${CARD_LABEL} px-6 pt-3.5 pb-1.5`}>{b.tokens}</h2>
						{tokens.map((x) => (
							<Row key={x.name}>
								<span
									aria-hidden="true"
									className="size-7 shrink-0 rounded-sm border border-n-6"
									style={{ background: x.value }}
								/>
								<span className="min-w-0 truncate font-semibold">{plain(x.name)}</span>
								<span className="ml-auto text-n-11">{x.value}</span>
							</Row>
						))}
						<Row>
							<LinkButton
								className="self-center"
								onClick={() => void navigate({ to: "/library/screens" })}
							>
								{b.allTokens}
							</LinkButton>
						</Row>
					</section>
				</Card>
				{decisions.length ? (
					<Card className="py-2">
						<section aria-label={b.decisions}>
							<h2 className={`${CARD_LABEL} px-6 pt-3.5 pb-1.5`}>{b.decisions}</h2>
							{decisions.map((d) => {
								const status = adrs.find((a) => `adr:${a.number}` === d.ref)?.status;
								return (
									<Row
										key={d.ref}
										render={(p) => (
											<button
												type="button"
												onClick={() => openRef(d.ref)}
												{...p}
												className={`${p.className} text-left`}
											/>
										)}
									>
										<span className="min-w-0 font-semibold">{d.title}</span>
										{status ? (
											<Badge
												variant={/accepted/i.test(status) ? "success" : "neutral"}
												className="ml-auto capitalize"
											>
												{status}
											</Badge>
										) : null}
									</Row>
								);
							})}
						</section>
					</Card>
				) : null}
			</div>
		</div>
	);
}
