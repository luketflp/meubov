import { describe, expect, it } from "vitest";
import { DEFAULT_SORT, INITIAL_FILTERS } from "@/components/herd/filters";
import { DEFAULT_PAGE_SIZE } from "@/components/herd/pagination";
import {
  DEFAULT_VIEW,
  parseHerdView,
  serializeHerdView,
  type HerdView,
} from "@/components/herd/view-params";

function parse(query: string): HerdView {
  return parseHerdView(new URLSearchParams(query));
}

describe("parseHerdView", () => {
  it("reads the default view from an empty query", () => {
    expect(parse("")).toEqual({
      filters: INITIAL_FILTERS,
      sort: DEFAULT_SORT,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
    expect(parse("")).toEqual(DEFAULT_VIEW);
  });

  it("reads every key of a full query", () => {
    expect(
      parse(
        "pagina=3&por=100&busca=nel&categoria=cow&lote=lot-1&status=overdue&ordem=weight-desc"
      )
    ).toEqual({
      filters: { search: "nel", category: "cow", lotId: "lot-1", status: "overdue" },
      sort: { column: "weight", direction: "desc" },
      page: 3,
      pageSize: 100,
    });
  });

  it("falls back to page 1 for a page that is not a positive integer", () => {
    expect(parse("pagina=abc").page).toBe(1);
    expect(parse("pagina=0").page).toBe(1);
    expect(parse("pagina=-2").page).toBe(1);
    expect(parse("pagina=2.5").page).toBe(1);
  });

  it("falls back to the default size for a size outside the offered ones", () => {
    expect(parse("por=7").pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(parse("por=25").pageSize).toBe(25);
  });

  it("ignores an unknown category, status or sort", () => {
    const view = parse("categoria=dragon&status=asleep&ordem=color-asc");

    expect(view.filters.category).toBe("todas");
    expect(view.filters.status).toBe("todos");
    expect(view.sort).toEqual(DEFAULT_SORT);
  });

  it("ignores a sort with an unknown direction", () => {
    expect(parse("ordem=weight-sideways").sort).toEqual(DEFAULT_SORT);
  });
});

describe("serializeHerdView", () => {
  it("writes nothing for the default view", () => {
    expect(serializeHerdView(DEFAULT_VIEW)).toBe("");
  });

  it("writes only the keys that differ from the defaults", () => {
    const view: HerdView = {
      ...DEFAULT_VIEW,
      filters: { ...INITIAL_FILTERS, status: "attention" },
      page: 2,
    };

    expect(serializeHerdView(view)).toBe("pagina=2&status=attention");
  });

  it("drops a search made only of spaces", () => {
    const view: HerdView = {
      ...DEFAULT_VIEW,
      filters: { ...INITIAL_FILTERS, search: "   " },
    };

    expect(serializeHerdView(view)).toBe("");
  });

  it("round-trips a full view", () => {
    const view: HerdView = {
      filters: { search: "brinco 12", category: "heifer", lotId: "lot-9", status: "healthy" },
      sort: { column: "birthDate", direction: "asc" },
      page: 4,
      pageSize: 25,
    };

    expect(parseHerdView(new URLSearchParams(serializeHerdView(view)))).toEqual(view);
  });
});
