import { format, type Messages } from "@/lib/i18n";
import type { Suggestion } from "@/lib/ipc";
import type { Reason } from "@/ui/molecules/member-row";

/** The reasons of a suggestion as marks. A missing skill shows its name in words, not in colour. */
export function reasonsOf(reasons: Suggestion["reasons"], t: Messages): Reason[] {
	const r = t.work.reason;
	return reasons.map((x): Reason => {
		if (x.kind === "skill") return { id: `s:${x.skill}`, text: x.skill, tone: "success" };
		if (x.kind === "missing-skill")
			return { id: `m:${x.skill}`, text: format(r.missing, { skill: x.skill }), tone: "neutral" };
		if (x.kind === "free-days")
			return { id: "free", text: format(r.free, { days: x.days ?? 0 }), tone: "neutral" };
		return { id: "full", text: r.full, tone: "warning" };
	});
}
