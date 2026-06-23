import { describe, expect, it } from "vitest";
import { extractEntities } from "./entities.js";

describe("entity extraction (generic regex for all languages)", () => {
  it("extracts python functions and classes via regex", () => {
    const src = [
      "class Greeter:",
      "    def greet(self, name):",
      "        return 'hi ' + name",
      "",
      "def standalone(x):",
      "    return x + 1",
    ].join("\n");
    const ents = extractEntities(src, "python");
    const names = ents.map((e) => e.name);
    expect(names).toContain("Greeter");
    expect(names).toContain("greet");
    expect(names).toContain("standalone");
  });

  it("extracts a JS arrow function and a class", () => {
    const src = [
      "export class Service {",
      "  run() { return 1; }",
      "}",
      "const handler = (req) => {",
      "  return req.body;",
      "};",
    ].join("\n");
    const ents = extractEntities(src, "javascript");
    const names = ents.map((e) => e.name);
    expect(names).toContain("Service");
    expect(names).toContain("handler");
  });

  it("estimates a python block end by indentation", () => {
    const src = ["def f(x):", "    a = x", "    return a", "y = 2"].join("\n");
    const ents = extractEntities(src, "python");
    const f = ents.find((e) => e.name === "f");
    expect(f).toBeDefined();
    // body spans lines 1..3, not the dedented y = 2 at line 4
    expect(f!.start_line).toBe(1);
    expect(f!.end_line).toBe(3);
  });

  it("returns nothing for empty source", () => {
    expect(extractEntities("   \n  ", "python")).toEqual([]);
  });
});
