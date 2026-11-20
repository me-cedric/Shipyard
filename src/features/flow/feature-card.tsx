import type { ReactNode } from "react";
import { nameOf } from "@/features/factory/runs/run-live";
import { useI18n } from "@/lib/i18n";
import type { FlowFeature_Serialize as Feature, Stage } from "@/lib/ipc/bindings";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { ATTENTION_FRAME } from "@/ui/molecules/attention-card";
import { ContextMenu, type MenuItem } from "@/ui/molecules/context-menu";
import { Row } from "@/ui/molecules/row";
import { needsPerson, stateText, useOpenFeature } from "./feature";

/** The name of who works on a feature: an agent by the name of its step. */
const whoName = (who: NonNullable<Feature["who"]>) => (who.agent ? nameOf(who.name) : who.name);

/** Who works on a feature: the black letter tile of an agent, or the round initials of a person. */
function Who({ who, named }: { who: Feature["who"]; named?: boolean }) {
	if (!who) return null;
	const name = whoName(who);
	return (
		<span className="flex min-w-0 items-center gap-2">
			<Avatar name={name} size="s" agent={who.agent} />
			{named ? <span className="truncate">{name}</span> : null}
		</span>
	);
}

/** The state of a feature: a pill when a person must act or the checks pass, else plain words. */
function State({ feature: f }: { feature: Feature }) {
	const { t } = useI18n();
	const state = stateText(t, f);
	if (needsPerson(f)) return <Badge variant="you">{state}</Badge>;
	if (state === t.flow.state.ready) return <Badge variant="success">{state}</Badge>;
	return <span className="text-n-11">{state}</span>;
}

const CARD =
	"relative flex w-full flex-col gap-3 rounded-field bg-surface-2 p-4 text-left shadow-1 transition-shadow duration-(--duration-base) hover:shadow-2";
const TITLE = "text-16 leading-snug font-semibold text-n-12";

/**
 * A card of the board: the title, then one line with who works on it and its state. The whole card
 * opens the feature. A person must act on it: the card takes the attention outline.
 */
export function FeatureCard({ feature: f, menu }: { feature: Feature; menu: MenuItem[] }) {
	const { t } = useI18n();
	const open = useOpenFeature();
	const key = f.ticket?.replace(/^wi:/, "");
	const said = key ? <span className="sr-only"> {key}</span> : null;
	// A feature that did not start shows the name of its person: the column says the rest.
	const idle = stateText(t, f) === t.flow.state.idle && !!f.who && !needsPerson(f);
	const line = (
		<span className="flex flex-wrap items-center gap-2">
			<Who who={f.who} named={idle} />
			{idle ? null : <State feature={f} />}
		</span>
	);
	return (
		<ContextMenu items={menu}>
			{needsPerson(f) ? (
				<article className={cn(CARD, ATTENTION_FRAME)}>
					<h3 className={TITLE}>
						{/* The button covers the card: the whole card is the target, and the title stays a heading. */}
						<button
							type="button"
							onClick={() => open(f)}
							className="flex items-start text-left after:absolute after:inset-0 after:rounded-field"
						>
							{f.title}
							{said}
						</button>
					</h3>
					{line}
				</article>
			) : (
				<button type="button" onClick={() => open(f)} className={CARD}>
					<span className={cn(TITLE, "line-clamp-2")}>
						{f.title}
						{said}
					</span>
					{line}
				</button>
			)}
		</ContextMenu>
	);
}

const STAGE_TONE: Partial<Record<Stage, "accent" | "success">> = {
	build: "accent",
	ready: "success",
};

/** One row of the list: the title, the stage, who and the state. A row opens like a card. */
export function FeatureRow({
	feature: f,
	menu,
	facts,
}: {
	feature: Feature;
	menu: MenuItem[];
	/** The facts of the ticket, next to the title. */
	facts?: ReactNode;
}) {
	const { t } = useI18n();
	const open = useOpenFeature();
	const key = f.ticket?.replace(/^wi:/, "");
	const idle = stateText(t, f) === t.flow.state.idle && !needsPerson(f);
	return (
		<ContextMenu items={menu}>
			<Row
				className="grid w-full grid-cols-[minmax(0,1fr)_6.5rem_11.5rem_9rem] gap-4 text-left hover:bg-n-2"
				render={(row) => <button type="button" onClick={() => open(f)} {...row} />}
			>
				<span className="flex min-w-0 items-center gap-2">
					<span className="truncate font-semibold">
						{f.title}
						{key ? <span className="sr-only">{` ${key}, `}</span> : null}
					</span>
					{facts}
				</span>
				<span>
					<Badge variant={STAGE_TONE[f.stage]}>{t.flow.stages[f.stage]}</Badge>
				</span>
				{f.who ? <Who who={f.who} named /> : <span />}
				<span className="flex justify-end text-right">{idle ? null : <State feature={f} />}</span>
			</Row>
		</ContextMenu>
	);
}
