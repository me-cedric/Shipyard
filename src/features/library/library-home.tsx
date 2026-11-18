import { Link } from "@tanstack/react-router";
import { WithProject } from "@/features/shell/no-project";
import { sectionPath, visibleSections } from "@/features/shell/places";
import { tabLabel } from "@/features/shell/spaces";
import { StaleBadge, useStalePages } from "@/features/specs/chain-badge";
import { useDesignList } from "@/lib/design";
import { format, useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { useQuestions } from "@/lib/specs";
import { cn } from "@/lib/utils";
import { ArrowsRightLeftIcon, BookOpenIcon, DocumentTextIcon, ShareIcon } from "@/ui/icons";
import { ATTENTION_CHIP } from "@/ui/molecules/attention-card";
import { Door } from "@/ui/molecules/door";
import { PageHeader } from "@/ui/molecules/page-header";

/** The four doors of Library, each with the pages behind it, in chip order. */
const DOORS = [
	{ id: "what", Icon: DocumentTextIcon, slugs: ["capabilities", "test-plans", "questions"] },
	{
		id: "how",
		Icon: ShareIcon,
		slugs: ["graph", "architecture", "diagrams", "screens", "api", "data", "flows"],
	},
	{ id: "why", Icon: ArrowsRightLeftIcon, slugs: ["decisions", "constitution"] },
	{
		id: "learn",
		Icon: BookOpenIcon,
		slugs: ["learn", "handbook", "documents", "slides", "dashboards", "reports", "manual"],
	},
] as const;

const CHIP = "inline-flex min-h-control items-center rounded-lg px-3 text-14 text-n-12";

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
	const open = (useQuestions().data ?? []).filter((e) => e.question.status === "open").length;
	const proposed = (useDesignList().data?.adrs ?? []).filter((a) => a.status === "proposed").length;
	const count = (n: number, one: string, many: string) =>
		n === 1 ? one : n ? format(many, { count: n }) : undefined;
	// The items that wait behind a page, named on a chip of their own.
	const waiting: Record<string, string | undefined> = {
		questions: count(open, l.questionsOne, l.questionsMany),
		decisions: count(proposed, l.decisionsOne, l.decisionsMany),
	};
	return (
		<>
			<PageHeader icon={<BookOpenIcon size={16} />} title={l.title} />
			<div className="grid gap-4 p-4 md:grid-cols-2">
				{DOORS.map(({ id, Icon, slugs }) => {
					// A page that the role does not see has no chip, and a door with no chip is hidden.
					const views = slugs.flatMap((slug) => shown.filter(([, tab]) => tab === slug));
					if (views.length === 0) return null;
					return (
						<Door
							key={id}
							label={l.doors[id]}
							icon={<Icon size={24} />}
							chips={
								<>
									{views.map(([, tab]) =>
										waiting[tab] ? (
											<Link
												key={`waiting-${tab}`}
												to={sectionPath("library", tab)}
												className={cn(CHIP, ATTENTION_CHIP)}
											>
												{waiting[tab]}
											</Link>
										) : null,
									)}
									{views.map(([space, tab]) => (
										<Link
											key={tab}
											to={sectionPath("library", tab)}
											preload="intent"
											className={cn(CHIP, "bg-n-3 font-medium hover:bg-n-4")}
										>
											{tabLabel(t, space, tab)}
											{stale.has(`${space}/${tab}`) ? <StaleBadge /> : null}
										</Link>
									))}
								</>
							}
						/>
					);
				})}
			</div>
		</>
	);
}
