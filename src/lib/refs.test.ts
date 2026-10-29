import { describe, expect, it } from "vitest";
import { isRef } from "./refs";

const ULID = "01JD0000000000000000000000";

// Same cases as `crates/shipyard-core/src/refs.rs`.
const valid = [
	"project:shipyard",
	"member:ada-1",
	"diagram:context",
	"model:domain",
	"adr:0004",
	"api:ipc",
	"data:run-log",
	"flow:onboarding",
	"screen:home",
	"change:add-refs",
	"spec:auth",
	"spec:auth#REQ-003",
	"spec:auth#REQ-0003",
	"test:smoke",
	"q:Q-012",
	"wi:SHIP-42",
	"wi:S1-9",
	"est:v1",
	"wf:deliver",
	`run:${ULID}`,
	`run:${ULID}/plan`,
	"pr:github:42",
	"commit:abc1234",
	"doc:docs/plan.md",
	"doc:a/b..c",
	"conn:github-1",
];

const rejected = [
	"project:Ship",
	"member:-ada",
	"diagram:a_b",
	"model:",
	"adr:12",
	"api:IPC",
	"data:run log",
	"flow:-x",
	"screen:Home",
	"change:add_refs",
	"spec:auth#REQ-3",
	"spec:auth#REQ-",
	"spec:auth#X-003",
	"test:",
	"q:Q-12",
	"wi:ship-42",
	"wi:SHIP-0",
	"est:V1",
	"wf:de liver",
	"run:81JD0000000000000000000000",
	`run:${ULID}/`,
	"run:01JD000000000000000000000U",
	"pr:github:0",
	"pr:github:1x",
	"commit:abc123",
	"commit:ABC1234",
	`commit:${"a".repeat(41)}`,
	"doc:../x",
	"doc:/etc/passwd",
	"doc:a\\b",
	"doc:a/../b",
	"conn:a:b",
	"foo:bar",
	"constructor:x",
	"",
	"adr",
];

describe("isRef", () => {
	it.each(valid)("accepts %s", (s) => expect(isRef(s)).toBe(true));
	it.each(rejected)("rejects %s", (s) => expect(isRef(s)).toBe(false));
});
