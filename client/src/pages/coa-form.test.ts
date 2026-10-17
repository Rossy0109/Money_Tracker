import { describe, expect, it } from "vitest";
import {
  MAX_CODE,
  ROOT_PARENT_VALUE,
  buildCoaTree,
  buildParentOptions,
  buildSubmittedValues,
  collectSubtreeIds,
  emptyAccountForm,
  flattenAccountOptions,
  validateAccountForm,
  type CoaServerNode,
  type CoaTreeNode,
} from "./coa-form";

function tree(): CoaTreeNode[] {
  return [
    {
      id: 1000,
      code: "1000",
      name: "Current Assets",
      children: [
        {
          id: 1110,
          code: "1110",
          name: "Cash in Hand",
          children: [
            { id: 1111, code: "1111", name: "Cash Drawer", children: [] },
          ],
        },
        { id: 1200, code: "1200", name: "Bank", children: [] },
      ],
    },
    {
      id: 4000,
      code: "4000",
      name: "Income",
      children: [{ id: 4100, code: "4100", name: "Sales", children: [] }],
    },
  ];
}

const validForm = {
  accountTypeId: "3",
  parentId: ROOT_PARENT_VALUE,
  code: "1300",
  name: "Receivable",
  nameBn: "বাকি",
  description: "desc",
  isDetail: true,
  openingBalance: "125.50",
};

describe("validateAccountForm", () => {
  it("accepts a fully valid form", () => {
    expect(validateAccountForm(validForm)).toEqual({});
  });

  it("requires an account type, code and name", () => {
    const errors = validateAccountForm({
      ...validForm,
      accountTypeId: "",
      code: "   ",
      name: "",
    });
    expect(errors.accountTypeId).toBe("Account type is required");
    expect(errors.code).toBe("Code is required");
    expect(errors.name).toBe("Name is required");
  });

  it("rejects a code longer than the schema limit", () => {
    const errors = validateAccountForm({
      ...validForm,
      code: "x".repeat(MAX_CODE + 1),
    });
    expect(errors.code).toBe(`Code must be at most ${MAX_CODE} characters`);
  });

  it("rejects a non-numeric opening balance but allows empty", () => {
    expect(
      validateAccountForm({ ...validForm, openingBalance: "abc" })
        .openingBalance
    ).toBe("Opening balance must be a number");
    expect(
      validateAccountForm({ ...validForm, openingBalance: "" }).openingBalance
    ).toBeUndefined();
  });
});

describe("emptyAccountForm", () => {
  it("builds a blank form when no defaults are given", () => {
    expect(emptyAccountForm()).toEqual({
      accountTypeId: "",
      parentId: ROOT_PARENT_VALUE,
      code: "",
      name: "",
      nameBn: "",
      description: "",
      isDetail: true,
      openingBalance: "",
    });
  });

  it("keeps unchanged values from an existing account (edit prefill)", () => {
    const form = emptyAccountForm({
      accountTypeId: 7,
      parentId: 1000,
      code: "1110",
      name: "Cash in Hand",
      nameBn: "হাতে নগদ",
      description: "wallet",
      isDetail: false,
      openingBalance: 50,
    });
    expect(form).toEqual({
      accountTypeId: "7",
      parentId: "1000",
      code: "1110",
      name: "Cash in Hand",
      nameBn: "হাতে নগদ",
      description: "wallet",
      isDetail: false,
      openingBalance: "50",
    });
  });

  it("maps a null parent to the root sentinel", () => {
    expect(emptyAccountForm({ parentId: null as never }).parentId).toBe(
      ROOT_PARENT_VALUE
    );
  });
});

describe("buildSubmittedValues", () => {
  it("round-trips unchanged values untouched", () => {
    const form = emptyAccountForm({
      accountTypeId: 3,
      parentId: 1000,
      code: "1110",
      name: "Cash in Hand",
      nameBn: "হাতে নগদ",
      description: "wallet",
      isDetail: true,
      openingBalance: 0,
    });
    expect(buildSubmittedValues(form)).toEqual({
      accountTypeId: 3,
      parentId: 1000,
      code: "1110",
      name: "Cash in Hand",
      nameBn: "হাতে নগদ",
      description: "wallet",
      isDetail: true,
      openingBalance: 0,
    });
  });

  it("persists changed values and trims whitespace", () => {
    const submitted = buildSubmittedValues({
      ...validForm,
      code: "  1300  ",
      name: " Trade Receivable ",
      nameBn: "",
      description: "",
      isDetail: false,
      openingBalance: "99.25",
    });
    expect(submitted.code).toBe("1300");
    expect(submitted.name).toBe("Trade Receivable");
    expect(submitted.nameBn).toBeUndefined();
    expect(submitted.description).toBeUndefined();
    expect(submitted.isDetail).toBe(false);
    expect(submitted.openingBalance).toBe(99.25);
  });

  it("maps the root sentinel to an undefined parent", () => {
    expect(buildSubmittedValues(validForm).parentId).toBeUndefined();
  });

  it("lets lockParentId (add-child mode) win over the select", () => {
    expect(buildSubmittedValues(validForm, 4000).parentId).toBe(4000);
  });

  it("treats an empty opening balance as 0", () => {
    expect(
      buildSubmittedValues({ ...validForm, openingBalance: "" }).openingBalance
    ).toBe(0);
  });
});

describe("buildCoaTree", () => {
  const serverNode = (
    id: number,
    code: string,
    parentId: number | null,
    children: CoaServerNode[] = []
  ): CoaServerNode => ({
    id,
    code,
    name: `Name ${code}`,
    nameBn: null,
    description: null,
    accountTypeId: 1,
    currentBalance: "0.00",
    isDetail: children.length === 0,
    isActive: true,
    parentId,
    children,
  });

  it("keeps nested children from the server response (regression: children were dropped)", () => {
    const roots = buildCoaTree([
      serverNode(1, "1000", null, [
        serverNode(2, "1100", 1, [serverNode(3, "1110", 2)]),
        serverNode(4, "1200", 1),
      ]),
      serverNode(5, "2000", null),
    ]);
    expect(roots.map(r => r.code)).toEqual(["1000", "2000"]);
    expect(roots[0].children.map(c => c.code)).toEqual(["1100", "1200"]);
    expect(roots[0].children[0].children.map(c => c.code)).toEqual(["1110"]);
    expect(roots[0].children[0].isDetail).toBe(false);
    expect(roots[0].children[0].children[0].isDetail).toBe(true);
  });

  it("promotes children of unknown parents to roots instead of losing them", () => {
    const roots = buildCoaTree([serverNode(2, "1100", 999)]);
    expect(roots.map(r => r.code)).toEqual(["1100"]);
    expect(roots[0].parentId).toBe(999);
  });
});

describe("collectSubtreeIds / flattenAccountOptions / buildParentOptions", () => {
  it("collects every descendant but not the root itself", () => {
    const ids = collectSubtreeIds(tree(), 1000);
    expect([...ids].sort()).toEqual([1110, 1111, 1200]);
    expect(ids.has(1000)).toBe(false);
  });

  it("flattens the tree in code order with depth indentation", () => {
    expect(flattenAccountOptions(tree())).toEqual([
      { id: 1000, label: "1000 — Current Assets" },
      { id: 1110, label: "\u00a0\u00a01110 — Cash in Hand" },
      { id: 1111, label: "\u00a0\u00a0\u00a0\u00a01111 — Cash Drawer" },
      { id: 1200, label: "\u00a0\u00a01200 — Bank" },
      { id: 4000, label: "4000 — Income" },
      { id: 4100, label: "\u00a0\u00a04100 — Sales" },
    ]);
  });

  it("excludes the edited account and its descendants from parent choices", () => {
    const ids = buildParentOptions(tree(), 1110).map(o => o.id);
    expect(ids).toEqual([1000, 1200, 4000, 4100]);
  });

  it("offers every account when nothing is excluded", () => {
    expect(buildParentOptions(tree()).map(o => o.id)).toEqual([
      1000, 1110, 1111, 1200, 4000, 4100,
    ]);
  });
});
