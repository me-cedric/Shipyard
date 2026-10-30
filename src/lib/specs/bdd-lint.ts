export type LintRule = "empty" | "noWhen" | "noThen" | "dup";
export type LintFinding = { line: number; scenario: string; rule: LintRule };

const SCENARIO = /^(Scenario Outline|Scenario|Example)\s*:\s*(.*)$/;
const STEP = /^(Given|When|Then|And|But|\*)\s/;
const FIRST_WORD = /^(\w+|\*)/;

/**
 * Lints the Gherkin of one plan. A scenario needs a step, a When and a Then, and a title that no
 * other scenario of the file uses. `And` and `But` carry the keyword before them.
 * shortcut: a line is a step when it starts with a keyword; doc strings and tables are not parsed.
 */
export function lintGherkin(text: string): LintFinding[] {
	type Scenario = { line: number; name: string; keywords: Set<string>; steps: number };
	const scenarios: Scenario[] = [];
	let current: Scenario | null = null;
	let inDoc = false;
	text.split("\n").forEach((raw, i) => {
		const line = raw.trim();
		if (line.startsWith('"""')) inDoc = !inDoc;
		if (inDoc || line.startsWith("#")) return;
		const header = SCENARIO.exec(line);
		if (header) {
			current = { line: i + 1, name: (header[2] ?? "").trim(), keywords: new Set(), steps: 0 };
			scenarios.push(current);
			return;
		}
		if (/^(Feature|Rule|Background)\s*:/.test(line)) current = null;
		if (!current || !STEP.test(`${line} `)) return;
		current.steps += 1;
		const word = FIRST_WORD.exec(line)?.[1] ?? "";
		if (word !== "And" && word !== "But" && word !== "*") current.keywords.add(word);
	});
	const seen = new Map<string, number>();
	for (const s of scenarios) seen.set(s.name, (seen.get(s.name) ?? 0) + 1);
	return scenarios.flatMap((s) => {
		const at = (rule: LintRule): LintFinding => ({ line: s.line, scenario: s.name, rule });
		const out: LintFinding[] = [];
		if (s.steps === 0) out.push(at("empty"));
		else {
			if (!s.keywords.has("When")) out.push(at("noWhen"));
			if (!s.keywords.has("Then")) out.push(at("noThen"));
		}
		if ((seen.get(s.name) ?? 0) > 1) out.push(at("dup"));
		return out;
	});
}
