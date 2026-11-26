import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { WithProject } from "@/features/shell/no-project";
import { sectionPath, visibleSections } from "@/features/shell/places";
import { docTarget, featureOfRef, refPage, refSelection } from "@/features/shell/ref-page";
import { tabLabel } from "@/features/shell/spaces";
import { StaleBadge, useStalePages } from "@/features/specs/chain-badge";
import { useDesignList } from "@/lib/design";
import { format, useI18n } from "@/lib/i18n";
import { useLearn } from "@/lib/knowledge";
import { useResolvedRef } from "@/lib/refs";
import { useRights } from "@/lib/rights";
import { rememberSelection } from "@/lib/shell/selection";
import { useQuestions } from "@/lib/specs";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { linkClass } from "@/ui/atoms/link-button";
import { BookOpenIcon } from "@/ui/icons";
import { ATTENTION_CHIP } from "@/ui/molecules/attention-card";
import { Card } from "@/ui/molecules/card";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { LinkedCard } from "@/ui/templates/library-page";
import { useLibraryPins, useLibraryRecent } from "./recent";

/** The icons of the doors, from the design source (24 px grid). */
const ICON = {
	what: <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" />,
	how: (
		<>
			<rect x="8" y="3" width="8" height="6" rx="1.5" />
			<rect x="3" y="15" width="8" height="6" rx="1.5" />
			<rect x="13" y="15" width="8" height="6" rx="1.5" />
			<path d="M12 9v3M7 15v-3h10v3" />
		</>
	),
	why: <path d="M12 4v16M5 8l7-4 7 4M5 8l-2 6h4zM19 8l-2 6h4z" />,
	learn: (
		<path d="M12 6c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-13c-3-.5-6 0-8 1.5zM12 6v13" />
	),
} as const;

type DoorId = keyof typeof ICON;
/** One chip of a door. `page` is the page that the role must see. `own` is a label that is not the page name. */
type ChipDef = { page: string; own?: "tested" | "answers" | "glossary"; to?: string };

/** The four doors of Library, each with its chips in the order of the design. */
const DOORS: { id: DoorId; chips: ChipDef[] }[] = [
	{
		id: "what",
		chips: [
			{ page: "capabilities" },
			{ page: "test-plans" },
			{ page: "test-plans", own: "tested", to: "/library/test-plans/coverage" },
			{ page: "questions" },
		],
	},
	{
		id: "how",
		chips: ["graph", "architecture", "diagrams", "screens", "api", "data", "flows"].map((page) => ({
			page,
		})),
	},
	{
		id: "why",
		chips: [
			{ page: "decisions" },
			// The answered questions are on the Questions page.
			{ page: "questions", own: "answers" },
			{ page: "constitution" },
		],
	},
	{
		id: "learn",
		chips: [
			{ page: "learn" },
			{ page: "handbook" },
			{ page: "documents" },
			{ page: "slides" },
			{ page: "dashboards" },
			// The glossary is a part of the Learn page.
			{ page: "learn", own: "glossary" },
			{ page: "reports" },
			{ page: "manual" },
		],
	},
];

const CHIP = "inline-flex min-h-control items-center gap-1.5 rounded-sm px-3.5 font-medium";
const PLAIN = "bg-n-3 text-n-12 hover:bg-n-4";

/** The steps of the Learn path that the person opened: the key of `src/features/knowledge/learn.tsx`. */
function learnDone(): string[] {
	try {
		return JSON.parse(localStorage.getItem("shipyard.learn.done") ?? "[]");
	} catch {
		return [];
	}
}

/** One row of an item with a ref (a spec, a decision, a diagram, a document): its kind, its name and Pin. */
function ItemRow({
	refId,
	pinned,
	toggle,
}: {
	refId: string;
	pinned: boolean;
	toggle: () => void;
}) {
	const { t } = useI18n();
	const l = t.library;
	const kind = refId.slice(0, refId.indexOf(":"));
	const name = useResolvedRef(refId).data?.title ?? refId.slice(kind.length + 1);
	const doc = docTarget(refId);
	const target = featureOfRef(refId) ?? { to: doc?.page ?? refPage(refId) ?? "/library/home" };
	const open = doc ? [doc.scope, doc.id] : refSelection(t, refId);
	return (
		<Row>
			<Badge className="self-center">{(t.refKind as Record<string, string>)[kind] ?? kind}</Badge>
			<Link
				{...(target as { to: "/library/home" })}
				onClick={() => open && rememberSelection(open[0] as string, open[1] as string)}
				className={cn(linkClass, "mr-auto self-center")}
			>
				{name}
			</Link>
			<Button aria-label={format(pinned ? l.unpinPage : l.pinPage, { name })} onClick={toggle}>
				{pinned ? l.unpin : l.pin}
			</Button>
		</Row>
	);
}

/** Library opens on four doors that name what a person looks for (`spec:app-redesign#REQ-020`). */
export function LibraryHome() {
	const { t } = useI18n();
	return (
		<WithProject title={t.library.title} icon={<BookOpenIcon size={16} />}>
			<Doors />
		</WithProject>
	);
}

function Doors() {
	const { t } = useI18n();
	const l = t.library;
	const { level } = useRights();
	const stale = useStalePages();
	const shown = visibleSections("library", level);
	const view = (slug: string) => shown.find(([, tab]) => tab === slug);
	const name = (slug: string) => {
		const v = view(slug);
		return v ? tabLabel(t, v[0], slug) : "";
	};
	const open = (useQuestions().data ?? []).filter((e) => e.question.status === "open").length;
	const proposed = (useDesignList().data?.adrs ?? []).filter((a) => a.status === "proposed").length;
	const path = useLearn().data?.path ?? [];
	const done = learnDone();
	const count = (n: number, one: string, many: string) =>
		n === 1 ? one : n ? format(many, { count: n }) : undefined;
	const waitingQuestions = count(open, l.questionsOne, l.questionsMany);
	const waitingDecisions = count(proposed, l.decisionsOne, l.decisionsMany);
	const { pins, toggle } = useLibraryPins();
	const recent = useLibraryRecent();

	const chip = ({ page, own, to }: ChipDef): ReactNode => {
		const v = view(page);
		// A page that the role does not see has no chip.
		if (!v) return null;
		const href = to ?? sectionPath("library", page);
		if (own)
			return (
				<Link key={own} to={href} preload="intent" className={cn(CHIP, PLAIN)}>
					{l[own]}
				</Link>
			);
		const label =
			page === "learn" && path.length
				? format(l.learnProgress, {
						label: name(page),
						done: path.filter((s) => done.includes(s.ref)).length,
						total: path.length,
					})
				: name(page);
		const page_ = (
			<Link key={page} to={href} preload="intent" className={cn(CHIP, PLAIN)}>
				{label}
				{stale.has(`${v[0]}/${page}`) ? <StaleBadge /> : null}
			</Link>
		);
		const attention = (text: string) => (
			<Link key={`waiting-${page}`} to={href} className={cn(CHIP, ATTENTION_CHIP, "font-medium")}>
				{text}
				{page === "questions" && stale.has(`${v[0]}/${page}`) ? <StaleBadge /> : null}
			</Link>
		);
		// One chip for the open questions: the count replaces the page name.
		if (page === "questions") return waitingQuestions ? attention(waitingQuestions) : page_;
		if (page === "decisions" && waitingDecisions) return [attention(waitingDecisions), page_];
		return page_;
	};

	const pageRow = (slug: string) => {
		if (slug.includes(":"))
			return (
				<ItemRow key={slug} refId={slug} pinned={pins.includes(slug)} toggle={() => toggle(slug)} />
			);
		const label = name(slug);
		const pinned = pins.includes(slug);
		return (
			<Row key={slug}>
				<Link to={sectionPath("library", slug)} className={cn(linkClass, "mr-auto self-center")}>
					{label}
				</Link>
				<Button
					aria-label={format(pinned ? l.unpinPage : l.pinPage, { name: label })}
					onClick={() => toggle(slug)}
				>
					{pinned ? l.unpin : l.pin}
				</Button>
			</Row>
		);
	};
	// An item has a ref: the role sees it through the page of its kind.
	const seen = (slugs: string[]) => slugs.filter((s) => s.includes(":") || view(s));
	const pinned = seen(pins);
	const last = seen(recent);

	return (
		<>
			<PageHeader title={l.title} />
			<div className="flex flex-col gap-6 px-4 pb-10">
				<div className="grid grid-cols-[repeat(auto-fill,minmax(min(460px,100%),1fr))] gap-4">
					{DOORS.map(({ id, chips }) => {
						const links = chips.flatMap(chip).filter(Boolean);
						// A door with no chip is hidden.
						if (links.length === 0) return null;
						return (
							<Card key={id} className="p-6.5">
								<section aria-label={l.doors[id]} className="flex flex-col gap-4.5">
									<span
										aria-hidden="true"
										className="flex size-14 items-center justify-center rounded-lg bg-accent-subtle text-accent-text"
									>
										<svg
											aria-hidden="true"
											viewBox="0 0 24 24"
											className="size-7"
											fill="none"
											stroke="currentColor"
											strokeWidth="1.8"
											strokeLinecap="round"
											strokeLinejoin="round"
										>
											{ICON[id]}
										</svg>
									</span>
									<h2 className="text-30 font-semibold text-n-12">{l.doors[id]}</h2>
									<div className="flex flex-wrap gap-2">{links}</div>
								</section>
							</Card>
						);
					})}
				</div>
				{pinned.length ? <LinkedCard title={l.pinned}>{pinned.map(pageRow)}</LinkedCard> : null}
				{last.length ? <LinkedCard title={l.openedLast}>{last.map(pageRow)}</LinkedCard> : null}
			</div>
		</>
	);
}
