import { drawioSvg, isDrawioXml, svgDataUri, xmlFromDrawioSvg } from "./drawio";
import plain from "./fixtures/orders.drawio?raw";
import compressed from "./fixtures/orders-compressed.drawio?raw";

const BOARD = `<svg xmlns="http://www.w3.org/2000/svg" content="&lt;mxfile&gt;&lt;diagram name=&quot;a&amp;amp;b&quot;/&gt;&lt;/mxfile&gt;"><rect/></svg>`;

describe("drawio", () => {
	it("reads the model out of a .drawio.svg", () => {
		expect(xmlFromDrawioSvg(BOARD)).toBe('<mxfile><diagram name="a&amp;b"/></mxfile>');
	});
	it("answers empty for a plain SVG or a broken file", () => {
		expect(xmlFromDrawioSvg('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBe("");
		expect(xmlFromDrawioSvg("<svg")).toBe("");
	});
	it("tells a draw.io XML from another text", () => {
		expect(isDrawioXml("<mxfile><diagram/></mxfile>")).toBe(true);
		expect(isDrawioXml("<html/>")).toBe(false);
		expect(isDrawioXml("<mxfile")).toBe(false);
	});
	it("encodes the SVG for an image", () => {
		expect(svgDataUri("<svg/>")).toBe("data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E");
	});

	describe("drawioSvg", () => {
		it("draws the boxes, text and edges of a plain file", async () => {
			const svg = await drawioSvg(plain, false);
			const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
			expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
			expect(doc.getElementsByTagName("ellipse")).toHaveLength(1);
			expect(doc.getElementsByTagName("polygon")).toHaveLength(1);
			expect(doc.getElementsByTagName("rect")).toHaveLength(3);
			expect(doc.getElementsByTagName("polyline")).toHaveLength(4);
			const words = Array.from(doc.getElementsByTagName("text")).map((t) => t.textContent);
			expect(words).toEqual(
				expect.arrayContaining(["Order placed", "In stock?", "Ship", "the order", "yes", "no"]),
			);
			expect(svg).toContain('fill="#dae8fc"');
		});
		it("draws a compressed page the same as a plain one", async () => {
			expect(await drawioSvg(compressed, false)).toBe(await drawioSvg(plain, false));
		});
		it("keeps a picture and refuses what has nothing to draw", async () => {
			const picture = '<svg xmlns="http://www.w3.org/2000/svg" content="&lt;mxfile/&gt;"/>';
			expect(await drawioSvg(picture, true)).toBe(picture);
			expect(await drawioSvg("<svg xmlns='http://www.w3.org/2000/svg'/>", true)).toBe("");
			expect(await drawioSvg("<mxfile><diagram/></mxfile>", false)).toBe("");
			expect(await drawioSvg("<mxfile><diagram>not base64 !</diagram></mxfile>", false)).toBe("");
			expect(await drawioSvg("<mxfile", false)).toBe("");
		});
		it("never lets a style or text put markup in the picture", async () => {
			const evil = `<mxGraphModel><root><mxCell id="0"/><mxCell id="a" value="&lt;b&gt;x&lt;/b&gt;&quot;&gt;&lt;script&gt;" style="fillColor=red&quot; onload=&quot;x" vertex="1" parent="1"><mxGeometry width="40" height="20" as="geometry"/></mxCell></root></mxGraphModel>`;
			const svg = await drawioSvg(evil, false);
			expect(svg).not.toContain("onload");
			expect(svg).not.toContain("<script");
		});
	});
});
