import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { openManualFor } from "@/features/knowledge/manual-target";
import { useChecklist } from "@/features/onboarding/checklist";
import { Column, Columns, SetupCard, SetupRow } from "@/features/settings/parts";
import { ButtonLink, Fold } from "@/features/settings/project/fold";
import { format, useI18n } from "@/lib/i18n";
import { commands, type Finding_Serialize, type Group, unwrap } from "@/lib/ipc";
import { projectKeys, useHealth } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useUpdateCheck } from "@/lib/updates";
import { openWhatsNew, useWhatsNew } from "@/lib/updates/whats-new";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { ATTENTION_FRAME, ATTENTION_GLYPH, ATTENTION_ICON } from "@/ui/molecules/attention-card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader } from "@/ui/molecules/page-header";
import { RefChip } from "@/ui/molecules/ref-chip";
import { DoctorCompliance, HealthActions } from "./doctor-compliance";
import { DoctorTools, useToolchain } from "./doctor-tools";

/** The groups of findings of the project. The tools are of this computer. */
const GROUPS: Group[] = ["compliance", "refs", "generated"];

type Preview = { path: string; content: string };

function Finding({
	finding,
	extra,
	showSource,
}: {
	finding: Finding_Serialize;
	/** The reference of the finding shows with the full list, not in the short card. */
	showSource?: boolean;
	/** A button of the card that sits before Fix, such as Show all. */
	extra?: ReactNode;
}) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const { openRef } = useShell();
	const [preview, setPreview] = useState<Preview | null>(null);
	const [error, setError] = useState<unknown>(null);
	const { fix } = finding;

	const attempt = async (work: () => Promise<void>) => {
		try {
			setError(null);
			await work();
		} catch (e) {
			setError(e);
		}
	};
	const message = (t.health.finding as Record<string, string>)[finding.code] ?? finding.code;
	const run = () =>
		attempt(async () => {
			if (fix.kind === "open") openRef(fix.target);
			else if (fix.kind === "recheck") await qc.invalidateQueries({ queryKey: projectKeys.health });
			else if (fix.kind === "apply") {
				await unwrap(commands.compassApply([fix.entry]));
				await qc.invalidateQueries();
			}
			// A file fix shows the new content first. It writes after the confirm click.
			else setPreview(await unwrap(commands.healthFix(finding.id, null)));
		});
	const confirm = () =>
		attempt(async () => {
			if (preview) await unwrap(commands.healthFix(finding.id, preview.content));
			setPreview(null);
			await qc.invalidateQueries();
		});

	return (
		<div className="flex flex-1 flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2 rounded-md bg-n-3 p-4 text-ui text-n-12">
				<span className="min-w-0 flex-[1_1_8rem]">
					{format(message, { detail: finding.detail ?? "" })}
				</span>
				{finding.source && showSource ? (
					<RefChip refId={finding.source} state="resolved" onOpen={openRef} />
				) : null}
			</div>
			{preview ? (
				<div className="flex flex-col gap-2">
					<figure aria-label={preview.path}>
						<pre className="max-h-48 overflow-auto rounded-md border bg-n-2 p-2 font-mono text-11">
							{preview.content}
						</pre>
					</figure>
					<div>
						<RightButton right="project.settings" variant="primary" onClick={confirm}>
							{t.health.confirm}
						</RightButton>
					</div>
				</div>
			) : null}
			{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
			<div className="mt-auto flex flex-wrap gap-2.5">
				{extra}
				<Button variant="primary" onClick={run}>
					{t.health.fix[fix.kind]}
				</Button>
			</div>
		</div>
	);
}

const SHOWN = 1;

/** A card of one group of findings: the first finding, with "Show all" for the rest and Fix. */
function GroupCard({ group, rows }: { group: Group; rows: Finding_Serialize[] }) {
	const { t } = useI18n();
	const h = t.doctor.health;
	const [all, setAll] = useState(false);
	const shown = all ? rows : rows.slice(0, SHOWN);
	return (
		<section
			id={`health-${group}`}
			aria-label={h.group[group]}
			className={`flex min-w-0 flex-col items-start gap-3 rounded-lg bg-surface-2 p-6 shadow-2 ${ATTENTION_FRAME}`}
		>
			<Badge variant="you">{format(h.toFix, { count: rows.length })}</Badge>
			<h2 className="text-20 font-semibold text-n-12">{h.group[group]}</h2>
			<div className="flex w-full flex-1 flex-col gap-4">
				{shown.map((f, i) => (
					<Finding
						key={f.id}
						finding={f}
						showSource={all}
						extra={
							i === 0 ? (
								<Button variant="secondary" aria-pressed={all} onClick={() => setAll(!all)}>
									{all ? h.showFewer : h.showAll}
								</Button>
							) : undefined
						}
					/>
				))}
			</div>
		</section>
	);
}

/**
 * Setup / Health of this project: a sentence that counts what to fix, with "Check again" and "Fix all
 * with an agent" at its right, a card for each group of findings, and the card "Also".
 */
function ProjectHealth() {
	const { t } = useI18n();
	const h = t.doctor.health;
	const health = useHealth();
	const all = health.data;
	if (all === undefined) return <Loading title={t.settings.pages.projectHealth} />;
	const findings = all.filter((f) => GROUPS.includes(f.group));
	const heading =
		findings.length === 0
			? h.fixNone
			: findings.length === 1
				? h.fixOne
				: format(h.fixCount, { count: findings.length });
	return (
		<div className="flex flex-col gap-4 px-4 pb-10">
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="min-w-0 flex-[1_1_16rem] text-30 font-semibold text-n-12">{heading}</h2>
				<HealthActions />
			</div>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4">
				{GROUPS.map((g) => {
					const rows = findings.filter((f) => f.group === g);
					return rows.length ? <GroupCard key={g} group={g} rows={rows} /> : null;
				})}
			</div>
			<SetupCard title={h.also}>
				<SetupRow label={h.product} href="/flow/health" />
				<SetupRow label={h.computer} href="/setup/computer?page=health" />
			</SetupCard>
			<SetupCard title={t.ui.more}>
				<Fold id="doctor-skills" label={t.doctor.skills.title} value={h.showAll}>
					<DoctorCompliance />
				</Fold>
			</SetupCard>
		</div>
	);
}

const GLYPH = {
	warn: "M12 3l9 16H3zM12 10v4M12 17v.5",
	ok: "M6 12.5l4 4 8-9",
	console: "M5 7l4 5-5 5M12 17h7",
} as const;

/** A stroke icon of the design: the shape in a 24 by 24 box. */
function Glyph({ shape, size = 24 }: { shape: keyof typeof GLYPH; size?: number }) {
	return (
		<svg
			viewBox="0 0 24 24"
			width={size}
			height={size}
			fill="none"
			stroke="currentColor"
			strokeWidth={1.8}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d={GLYPH[shape]} />
		</svg>
	);
}

/** An area of this computer: its name and its state, as a link to where it opens. */
function Area({
	href,
	label,
	state,
	icon,
	children,
}: {
	href: string;
	label: string;
	icon: keyof typeof GLYPH;
	state: "ready" | "fix" | "off";
	children: string;
}) {
	const router = useRouter();
	return (
		<a
			href={href}
			onClick={(e) => {
				e.preventDefault();
				router.history.push(href);
			}}
			className={`flex min-h-40 min-w-0 flex-[1_1_180px] flex-col items-start gap-3 rounded-lg bg-surface-2 p-5 shadow-2 hover:bg-n-3 ${state === "fix" ? ATTENTION_FRAME : ""}`}
		>
			<span
				className={`flex size-12 items-center justify-center rounded-md ${state === "fix" ? ATTENTION_ICON : "bg-success-subtle text-success-text"}`}
			>
				<Glyph shape={icon} />
			</span>
			<span className="text-20 font-semibold text-n-12">{label}</span>
			<Badge variant={state === "ready" ? "success" : state === "fix" ? "you" : "neutral"}>
				{children}
			</Badge>
		</a>
	);
}

/**
 * Setup / Health of this computer: the count of problems as the title, a banner for each required tool
 * that is missing, the five areas, the toolchain behind the Tools area, and the version and help cards.
 */
function ComputerHealth({ below }: { below?: ReactNode }) {
	const { t } = useI18n();
	const h = t.doctor.health;
	const router = useRouter();
	const { problems, busy, error, install } = useToolchain();
	const health = useHealth();
	const { current } = useWhatsNew();
	const checkUpdate = useUpdateCheck();
	const { setShortcutsOpen } = useShell();
	const skills = useQuery({
		queryKey: ["doctor", "skills"],
		queryFn: () => unwrap(commands.compassGet()),
	}).data;
	// An item that is known and not done is open; one still loading does not count.
	const setupOpen = Object.values(useChecklist().done).filter((d) => d === false).length;
	const staleSkills = (skills?.entries ?? []).filter(
		(e) => e.kind === "skill" && e.state !== "current",
	).length;
	if (health.data === undefined) return <Loading title={t.settings.pages.computerHealth} />;
	// A finding of a missing tool names its tool: the banner of the tool already says it.
	const named = new Set(problems.map((p) => p.id));
	const others = health.data.filter((f) => f.group === "tools" && !named.has(f.detail ?? ""));
	const count = problems.length + others.length;
	const title =
		count === 0 ? h.problemNone : count === 1 ? h.problemOne : format(h.problems, { count });
	const toolsMissing = problems.length;
	return (
		<div className="flex flex-col">
			<PageHeader title={title} />
			{below}
			<div className="flex flex-col gap-4 px-4 pb-10">
				{problems.map((p) => (
					<section
						key={p.id}
						aria-label={format(h.toolMissing, { name: p.id })}
						className={`flex flex-wrap items-center gap-4 rounded-lg bg-surface-2 p-6 shadow-2 ${ATTENTION_FRAME}`}
					>
						<span className={`flex ${ATTENTION_GLYPH}`}>
							<Glyph shape="warn" size={28} />
						</span>
						<span className="min-w-0 flex-[1_1_16rem] text-20 font-semibold text-n-12">
							{format(h.toolMissing, { name: p.id })}
						</span>
						<ButtonLink href="/setup/computer?page=health#tools">{h.details}</ButtonLink>
						<Button
							variant="primary"
							busy={busy === p.id}
							disabled={busy !== null || !p.canInstall}
							reason={p.canInstall ? undefined : t.settings.tools.missing}
							onClick={() => void install(p)}
						>
							{h.fixIt}
						</Button>
					</section>
				))}
				{others.length ? (
					<SetupCard attention title={h.group.tools}>
						{others.map((f) => (
							<Finding key={f.id} finding={f} />
						))}
					</SetupCard>
				) : null}
				{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
				<div className="flex flex-wrap gap-4">
					<Area
						href="/setup/computer?page=health#tools"
						label={h.tools}
						state={toolsMissing ? "fix" : "ready"}
						icon="warn"
					>
						{toolsMissing ? format(h.missingN, { count: toolsMissing }) : h.ready}
					</Area>
					<Area
						href="/setup/computer?page=models"
						label={h.skills}
						state={staleSkills ? "fix" : "ready"}
						icon="ok"
					>
						{staleSkills ? format(h.toFix, { count: staleSkills }) : h.ready}
					</Area>
					<Area
						href="/setup/start"
						label={h.firstSetup}
						state={setupOpen ? "fix" : "ready"}
						icon="ok"
					>
						{setupOpen ? format(h.toFix, { count: setupOpen }) : h.done}
					</Area>
					<Area
						href="/setup/computer?page=logs#doctor-ledger"
						label={h.ledger}
						state="ready"
						icon="ok"
					>
						{h.ready}
					</Area>
					<Area href="/setup/computer?page=logs" label={h.console} state="off" icon="console">
						{h.open}
					</Area>
				</div>
				<Columns className="px-0 pb-0">
					<Column>
						<SetupCard>
							<SetupRow label={h.version}>
								<span className="font-mono text-ui">{current}</span>
								<Button variant="secondary" onClick={() => void checkUpdate(true)}>
									{h.checkUpdate}
								</Button>
							</SetupRow>
							<SetupRow label={h.whatsNew}>
								<Button variant="secondary" onClick={openWhatsNew}>
									{h.open}
								</Button>
							</SetupRow>
							<SetupRow label={t.settings.pages.logs} href="/setup/computer?page=logs" />
						</SetupCard>
					</Column>
					<Column>
						<SetupCard>
							<div className="flex flex-wrap gap-3 px-6 py-3">
								<Button
									variant="secondary"
									onClick={() => router.history.push("/setup/computer?page=logs#doctor-feedback")}
								>
									{h.feedback}
								</Button>
								<Button variant="secondary" onClick={() => setShortcutsOpen(true)}>
									{h.shortcuts}
								</Button>
								<Button
									variant="secondary"
									onClick={() => {
										openManualFor(router.state.location.pathname);
										router.history.push("/library/manual");
									}}
								>
									{h.manual}
								</Button>
							</div>
						</SetupCard>
						<SetupCard title={t.ui.more}>
							<Fold id="tools" label={t.settings.tools.title} value={h.details}>
								<DoctorTools />
							</Fold>
						</SetupCard>
					</Column>
				</Columns>
			</div>
		</div>
	);
}

/** Setup / Health: the part of the project under This project, the part of this machine under This computer. */
/** `below` is the row of pills of Setup: it sits under the title row of the computer page. */
export function Health({ scope, below }: { scope: "project" | "computer"; below?: ReactNode }) {
	return scope === "project" ? <ProjectHealth /> : <ComputerHealth below={below} />;
}
