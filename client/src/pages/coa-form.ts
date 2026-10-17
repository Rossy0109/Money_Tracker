/**
 * Pure form logic for the Chart-of-Accounts create/edit dialog.
 * Kept free of React/JSX so it can be unit-tested in the node vitest env.
 */

export const ROOT_PARENT_VALUE = "__root__";

export const MAX_CODE = 30;
export const MAX_NAME = 120;
export const MAX_NAME_BN = 120;
export const MAX_DESCRIPTION = 500;

export interface CoaTreeNode {
  id: number;
  code: string;
  name: string;
  children: CoaTreeNode[];
}

/** Shape returned by finance.getChartOfAccountsTree (nested children). */
export interface CoaServerNode {
  id: number;
  code: string;
  name: string;
  nameBn?: string | null;
  description?: string | null;
  accountTypeId: number;
  currentBalance: string;
  isDetail: boolean;
  isActive: boolean;
  parentId: number | null;
  children?: CoaServerNode[];
}

export interface CoaFlatAccount {
  id: number;
  code: string;
  name: string;
  nameBn: string | null;
  description?: string | null;
  accountTypeId: number;
  currentBalance: string;
  isDetail: boolean;
  isActive: boolean;
  parentId: number | null;
  children: CoaFlatAccount[];
}

/**
 * The server returns the chart as nested roots. Flatten the response first,
 * then rebuild parent/child links by parentId — a flat list keeps orphaned
 * rows (parent outside the set) as roots instead of silently dropping the
 * nested children the old top-level-only pass lost.
 */
export function buildCoaTree(nodes: CoaServerNode[]): CoaFlatAccount[] {
  const flat: Omit<CoaFlatAccount, "children">[] = [];
  const walk = (list: CoaServerNode[]) => {
    for (const node of list) {
      flat.push({
        id: node.id,
        code: node.code,
        name: node.name,
        nameBn: node.nameBn ?? null,
        description: node.description ?? null,
        accountTypeId: node.accountTypeId,
        currentBalance: node.currentBalance,
        isDetail: node.isDetail,
        isActive: node.isActive,
        parentId: node.parentId,
      });
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);

  const accountMap = new Map<number, CoaFlatAccount>();
  flat.forEach(a => accountMap.set(a.id, { ...a, children: [] }));

  const roots: CoaFlatAccount[] = [];
  flat.forEach(acc => {
    const withChildren = accountMap.get(acc.id)!;
    if (acc.parentId && accountMap.has(acc.parentId)) {
      accountMap.get(acc.parentId)!.children.push(withChildren);
    } else {
      roots.push(withChildren);
    }
  });
  return roots;
}

export interface AccountFormValues {
  accountTypeId: string;
  parentId: string;
  code: string;
  name: string;
  nameBn: string;
  description: string;
  isDetail: boolean;
  openingBalance: string;
}

/** Initial values coming from a tree account (numbers) or an empty create form. */
export interface AccountFormDefaults {
  accountTypeId?: number | string;
  parentId?: number | string;
  code?: string;
  name?: string;
  nameBn?: string;
  description?: string;
  isDetail?: boolean;
  openingBalance?: number | string;
}

export type AccountFormErrors = Partial<
  Record<keyof AccountFormValues, string>
>;

export interface SubmittedAccountValues {
  accountTypeId: number;
  parentId?: number;
  code: string;
  name: string;
  nameBn?: string;
  description?: string;
  isDetail: boolean;
  openingBalance: number;
}

export function emptyAccountForm(
  defaults?: AccountFormDefaults
): AccountFormValues {
  const asString = (value: number | string | undefined) =>
    value != null && value !== "" ? String(value) : "";
  return {
    accountTypeId: asString(defaults?.accountTypeId),
    parentId: asString(defaults?.parentId) || ROOT_PARENT_VALUE,
    code: defaults?.code ?? "",
    name: defaults?.name ?? "",
    nameBn: defaults?.nameBn ?? "",
    description: defaults?.description ?? "",
    isDetail: defaults?.isDetail ?? true,
    openingBalance: asString(defaults?.openingBalance),
  };
}

export function validateAccountForm(values: AccountFormValues): AccountFormErrors {
  const errors: AccountFormErrors = {};
  if (!values.accountTypeId || Number(values.accountTypeId) <= 0) {
    errors.accountTypeId = "Account type is required";
  }
  const code = values.code.trim();
  if (!code) {
    errors.code = "Code is required";
  } else if (code.length > MAX_CODE) {
    errors.code = `Code must be at most ${MAX_CODE} characters`;
  }
  const name = values.name.trim();
  if (!name) {
    errors.name = "Name is required";
  } else if (name.length > MAX_NAME) {
    errors.name = `Name must be at most ${MAX_NAME} characters`;
  }
  if (values.nameBn.trim().length > MAX_NAME_BN) {
    errors.nameBn = `Bangla name must be at most ${MAX_NAME_BN} characters`;
  }
  if (values.description.trim().length > MAX_DESCRIPTION) {
    errors.description = `Description must be at most ${MAX_DESCRIPTION} characters`;
  }
  if (
    values.openingBalance.trim() !== "" &&
    !Number.isFinite(Number(values.openingBalance))
  ) {
    errors.openingBalance = "Opening balance must be a number";
  }
  return errors;
}

/**
 * Ids of every descendant of `rootId` (excluding `rootId` itself).
 * Used to stop an account from being re-parented under its own subtree.
 */
export function collectSubtreeIds(
  nodes: CoaTreeNode[],
  rootId: number
): Set<number> {
  const ids = new Set<number>();
  const visit = (list: CoaTreeNode[]) => {
    for (const node of list) {
      if (node.id === rootId) {
        const stack = [...node.children];
        while (stack.length) {
          const current = stack.pop()!;
          ids.add(current.id);
          stack.push(...current.children);
        }
        return;
      }
      visit(node.children);
    }
  };
  visit(nodes);
  return ids;
}

export interface ParentOption {
  id: number;
  label: string;
}

export function flattenAccountOptions(
  nodes: CoaTreeNode[],
  depth = 0,
  out: ParentOption[] = []
): ParentOption[] {
  for (const node of nodes) {
    out.push({
      id: node.id,
      label: `${"\u00a0".repeat(depth * 2)}${node.code} — ${node.name}`,
    });
    flattenAccountOptions(node.children, depth + 1, out);
  }
  return out;
}

/**
 * Parent choices for the dialog: every account except the edited account
 * and its own descendants (choosing those would create a cycle).
 */
export function buildParentOptions(
  nodes: CoaTreeNode[],
  excludeId?: number
): ParentOption[] {
  const options = flattenAccountOptions(nodes);
  if (excludeId == null) return options;
  const blocked = collectSubtreeIds(nodes, excludeId);
  blocked.add(excludeId);
  return options.filter(option => !blocked.has(option.id));
}

/**
 * Maps the string-typed form state onto the typed mutation payload.
 * `lockParentId` (add-child mode) always wins over the select value.
 */
export function buildSubmittedValues(
  values: AccountFormValues,
  lockParentId?: number
): SubmittedAccountValues {
  return {
    accountTypeId: Number(values.accountTypeId),
    parentId:
      lockParentId ??
      (values.parentId === ROOT_PARENT_VALUE
        ? undefined
        : Number(values.parentId)),
    code: values.code.trim(),
    name: values.name.trim(),
    nameBn: values.nameBn.trim() || undefined,
    description: values.description.trim() || undefined,
    isDetail: values.isDetail,
    openingBalance:
      values.openingBalance.trim() === "" ? 0 : Number(values.openingBalance),
  };
}
