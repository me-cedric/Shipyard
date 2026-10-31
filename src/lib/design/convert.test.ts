import { type BoardFormat, convertBoard, newBoard } from "./convert";

const MERMAID = 'flowchart LR\n  a["Order"] -->|ok| b{"Paid?"}\n  b --> c(("Done"))\n';
const FORMATS: BoardFormat[] = ["mermaid", "drawio", "bpmn", "excalidraw"];

describe("convertBoard", () => {
	it("keeps the boxes, the arrows and their labels through every format", () => {
		for (const via of FORMATS) {
			const there = via === "mermaid" ? MERMAID : convertBoard("mermaid", via, MERMAID);
			const back = convertBoard(via, "mermaid", there);
			expect(back, via).toContain('["Order"]');
			expect(back, via).toContain('{"Paid?"}');
			expect(back, via).toContain('(("Done"))');
			expect(back, via).toMatch(/-->\|ok\|/);
			expect(back.match(/-->/g), via).toHaveLength(2);
		}
	});

	it("writes a BPMN file with a start, a task and an end, and the diagram positions", () => {
		const bpmn = newBoard("bpmn");
		expect(bpmn).toContain("<bpmn:startEvent");
		expect(bpmn).toContain("<bpmn:task");
		expect(bpmn).toContain("<bpmn:endEvent");
		expect(bpmn).toContain("<bpmndi:BPMNEdge");
		expect(
			new DOMParser().parseFromString(bpmn, "application/xml").getElementsByTagName("parsererror"),
		).toHaveLength(0);
		expect(newBoard("drawio")).toContain("<mxGraphModel>");
	});

	it("refuses a board with nothing to convert and a compressed draw.io page", () => {
		expect(() => convertBoard("mermaid", "bpmn", "flowchart LR\n")).toThrow("no boxes");
		expect(() =>
			convertBoard("drawio", "mermaid", "<mxfile><diagram>eJzLzcw</diagram></mxfile>"),
		).toThrow("compressed");
		expect(() => convertBoard("bpmn", "mermaid", "<a>")).toThrow("Not a valid XML");
	});
});
