import { useI18n } from "@/lib/i18n";
import type { Requirement } from "@/lib/specs";
import { Badge } from "@/ui/atoms/badge";
import { ChevronRightIcon } from "@/ui/icons";

export const ORDER = ["fail", "blocked", "partial", "not-covered", "pass"] as const;
export type Verdict = (typeof ORDER)[number];
const BADGE = {
	pass: "success",
	fail: "danger",
	partial: "warning",
	blocked: "warning",
	"not-covered": "neutral",
} as const;

/** The verdict that matters most: a failure shows before a pass. */
export const worst = (verdicts: string[]): Verdict =>
	ORDER.find((v) => verdicts.includes(v)) ?? "not-covered";

/** The capability that a `spec:` ref names. */
export const capOf = (ref: string) => ref.replace(/^spec:/, "").split("#")[0] ?? "";

/** The pill of a verdict. `idle` names a scenario that never ran. */
export function VerdictBadge({ v, idle }: { v: string; idle?: string }) {
	const { t } = useI18n();
	const known = (ORDER as readonly string[]).includes(v);
	return (
		<Badge variant={known ? BADGE[v as Verdict] : "neutral"}>
			{v === "not-covered" && idle ? idle : known ? t.specs.verdict[v as Verdict] : v}
		</Badge>
	);
}

/** The tint of the state of a question. */
export const STATE_TONE: Record<string, "you" | "success" | "neutral"> = {
	open: "you",
	answered: "success",
	withdrawn: "neutral",
};

/** The capabilities with a requirement that no scenario cites and that holds the text of a scenario. */
export const missingTests = (reqs: Requirement[]) => [
	...new Set(reqs.filter((r) => r.scenarios.length === 0 && r.detailed).map((r) => r.capability)),
];

/** The row of a card as a button. */
export const ROW_BUTTON = "w-[calc(100%-1rem)] cursor-pointer text-left hover:bg-n-2";

/** The small chevron at the end of a link row: lighter than the default one. */
export const SmallChevron = () => <ChevronRightIcon size={14} />;

/** The three dots of a More button. */
export const MoreDots = () => (
	<svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
		<circle cx="3" cy="8" r="1.25" />
		<circle cx="8" cy="8" r="1.25" />
		<circle cx="13" cy="8" r="1.25" />
	</svg>
);
