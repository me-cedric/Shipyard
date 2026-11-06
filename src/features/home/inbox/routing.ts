import type { useInbox } from "@/lib/home";
import type { Right } from "@/lib/ipc";

type Inbox = ReturnType<typeof useInbox>;

/** The roles that own a topic: a spec question goes to the spec owners, a run question to the builders. */
const SPEC_OWNERS = ["po", "ba", "architect", "techlead"];
const RUN_OWNERS = ["developer", "architect", "techlead"];

/**
 * What the person sees in the Inbox (`team-rights` REQ-014): an approval with its right, a question
 * as assignee of its ticket or as owner role of its topic, a review with `code.write`. `everyone`
 * shows each item. A solo person (no `role`) has every right and sees each item.
 */
export function routeInbox(
	inbox: Inbox,
	who: {
		everyone: boolean;
		can: (right: Right) => boolean;
		role: string | null;
		/** The assignee of a ticket key. */
		assignee: (key: string) => string | null | undefined;
		me: string | null;
	},
): Inbox {
	if (who.everyone || who.role === null) return inbox;
	return {
		...inbox,
		approvals: inbox.approvals.filter((a) => who.can(a.right)),
		plans: who.can("runs.approve") ? inbox.plans : [],
		questions: inbox.questions.filter(
			(x) =>
				(who.me !== null && who.assignee(x.key) === who.me) ||
				(x.question.spec ? SPEC_OWNERS : RUN_OWNERS).includes(who.role as string),
		),
		reviews: who.can("code.write") ? inbox.reviews : [],
	};
}
