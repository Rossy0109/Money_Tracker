import { beforeEach, describe, expect, it } from "vitest";

// Simulation models for End-to-End User Workflows
interface User {
  id: number;
  openId: string;
  email: string;
  name: string;
}

interface Project {
  id: number;
  userId: number;
  name: string;
  isDefault: boolean;
}

interface Transaction {
  id: number;
  projectId: number;
  amount: number;
  type: "income" | "expense";
  category: string;
  note?: string;
  occurredAt: string;
}

interface HouseholdMember {
  householdId: number;
  userId: number;
  role: "owner" | "editor" | "viewer";
}

interface HouseholdExpense {
  id: number;
  householdId: number;
  contributorUserId: number;
  amount: number;
  description: string;
}

class SystemWorkflowEngine {
  users = new Map<number, User>();
  projects = new Map<number, Project>();
  transactions = new Map<number, Transaction>();
  householdMembers = new Map<string, HouseholdMember>();
  householdExpenses = new Map<number, HouseholdExpense>();

  private nextUserId = 1;
  private nextProjectId = 1;
  private nextTxId = 1;
  private nextHouseholdExpenseId = 1;

  // 1. Real OAuth Sign-In Simulation
  simulateOAuthSignIn(provider: "google", payload: { sub: string; email: string; name: string }): User {
    for (const u of this.users.values()) {
      if (u.openId === payload.sub || u.email === payload.email) {
        return u;
      }
    }
    const id = this.nextUserId++;
    const user: User = { id, openId: payload.sub, email: payload.email, name: payload.name };
    this.users.set(id, user);

    // Auto-create default initial project on sign-up
    const projId = this.nextProjectId++;
    this.projects.set(projId, {
      id: projId,
      userId: id,
      name: "ব্যক্তিগত হিসাব",
      isDefault: true,
    });

    return user;
  }

  // 2. Project Management & Switching
  getUserProjects(userId: number): Project[] {
    return Array.from(this.projects.values()).filter(p => p.userId === userId);
  }

  createProject(userId: number, name: string): Project {
    const id = this.nextProjectId++;
    const project: Project = { id, userId, name, isDefault: false };
    this.projects.set(id, project);
    return project;
  }

  // 3. Complete Transaction Lifecycle (Create -> Edit -> Delete)
  createTransaction(userId: number, projectId: number, data: Omit<Transaction, "id" | "projectId">): Transaction {
    const project = this.projects.get(projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Access denied: Not your project");
    }
    const id = this.nextTxId++;
    const tx: Transaction = { id, projectId, ...data };
    this.transactions.set(id, tx);
    return tx;
  }

  updateTransaction(userId: number, txId: number, updates: Partial<Omit<Transaction, "id" | "projectId">>): Transaction {
    const tx = this.transactions.get(txId);
    if (!tx) throw new Error("Transaction not found");
    const project = this.projects.get(tx.projectId);
    if (!project || project.userId !== userId) throw new Error("Access denied");

    const updated = { ...tx, ...updates };
    this.transactions.set(txId, updated);
    return updated;
  }

  deleteTransaction(userId: number, txId: number): boolean {
    const tx = this.transactions.get(txId);
    if (!tx) return false;
    const project = this.projects.get(tx.projectId);
    if (!project || project.userId !== userId) throw new Error("Access denied");
    return this.transactions.delete(txId);
  }

  // 4. Household Workflows
  addHouseholdMember(householdId: number, userId: number, role: "owner" | "editor" | "viewer") {
    this.householdMembers.set(`${householdId}:${userId}`, { householdId, userId, role });
  }

  addHouseholdExpense(householdId: number, userId: number, amount: number, description: string): HouseholdExpense {
    const membership = this.householdMembers.get(`${householdId}:${userId}`);
    if (!membership) throw new Error("Not a member of this household");
    if (membership.role === "viewer") throw new Error("Viewers cannot add expenses");

    const id = this.nextHouseholdExpenseId++;
    const expense: HouseholdExpense = { id, householdId, contributorUserId: userId, amount, description };
    this.householdExpenses.set(id, expense);
    return expense;
  }
}

describe("Full User Workflows (E2E simulation)", () => {
  let engine: SystemWorkflowEngine;

  beforeEach(() => {
    engine = new SystemWorkflowEngine();
  });

  describe("1. Complete Transaction Flow (Create > Edit > Delete)", () => {
    it("executes the full lifecycle of a transaction with balance tracking", () => {
      const user = engine.simulateOAuthSignIn("google", {
        sub: "google_123",
        email: "kamrul@example.com",
        name: "Rossy",
      });
      const project = engine.getUserProjects(user.id)[0];

      // Step A: Create
      const createdTx = engine.createTransaction(user.id, project.id, {
        amount: 500,
        type: "expense",
        category: "Office Supplies",
        note: "Paper and ink",
        occurredAt: new Date().toISOString(),
      });
      expect(createdTx.id).toBeDefined();
      expect(createdTx.amount).toBe(500);

      // Step B: Edit
      const updatedTx = engine.updateTransaction(user.id, createdTx.id, {
        amount: 650,
        note: "Paper, ink, and pens",
      });
      expect(updatedTx.amount).toBe(650);
      expect(updatedTx.note).toBe("Paper, ink, and pens");

      // Step C: Delete
      const deleted = engine.deleteTransaction(user.id, createdTx.id);
      expect(deleted).toBe(true);
      expect(engine.transactions.has(createdTx.id)).toBe(false);
    });
  });

  describe("2. Project Switching Workflow", () => {
    it("creates multiple projects and isolates records when switching between them", () => {
      const user = engine.simulateOAuthSignIn("google", {
        sub: "google_456",
        email: "builder@example.com",
        name: "Ahmed Builders",
      });

      const defaultProject = engine.getUserProjects(user.id)[0];
      const secondProject = engine.createProject(user.id, "প্রজেক্ট ধানমন্ডি");

      // Create transaction in project 1
      engine.createTransaction(user.id, defaultProject.id, {
        amount: 1200,
        type: "income",
        category: "Consulting",
        occurredAt: new Date().toISOString(),
      });

      // Create transaction in project 2
      engine.createTransaction(user.id, secondProject.id, {
        amount: 8500,
        type: "expense",
        category: "Cement",
        occurredAt: new Date().toISOString(),
      });

      const p1Tx = Array.from(engine.transactions.values()).filter(t => t.projectId === defaultProject.id);
      const p2Tx = Array.from(engine.transactions.values()).filter(t => t.projectId === secondProject.id);

      expect(p1Tx).toHaveLength(1);
      expect(p1Tx[0].amount).toBe(1200);

      expect(p2Tx).toHaveLength(1);
      expect(p2Tx[0].amount).toBe(8500);
    });
  });

  describe("3. Real OAuth Sign-In Flow", () => {
    it("signs in user, initializes default ledger, and preserves identity on subsequent sign-ins", () => {
      const firstSignIn = engine.simulateOAuthSignIn("google", {
        sub: "google_999",
        email: "testuser@gmail.com",
        name: "Test User",
      });

      expect(firstSignIn.id).toBe(1);
      expect(engine.getUserProjects(firstSignIn.id)).toHaveLength(1);

      // Repeat sign-in with same sub
      const secondSignIn = engine.simulateOAuthSignIn("google", {
        sub: "google_999",
        email: "testuser@gmail.com",
        name: "Test User",
      });

      expect(secondSignIn.id).toBe(firstSignIn.id);
      expect(engine.getUserProjects(secondSignIn.id)).toHaveLength(1);
    });
  });

  describe("4. Household Multi-Role Collaboration", () => {
    it("enforces role permissions between household owner, editor, and viewer", () => {
      const owner = engine.simulateOAuthSignIn("google", { sub: "o1", email: "o@test.com", name: "Owner" });
      const editor = engine.simulateOAuthSignIn("google", { sub: "e1", email: "e@test.com", name: "Editor" });
      const viewer = engine.simulateOAuthSignIn("google", { sub: "v1", email: "v@test.com", name: "Viewer" });

      const householdId = 100;
      engine.addHouseholdMember(householdId, owner.id, "owner");
      engine.addHouseholdMember(householdId, editor.id, "editor");
      engine.addHouseholdMember(householdId, viewer.id, "viewer");

      // Editor can add expense
      const expense = engine.addHouseholdExpense(householdId, editor.id, 350, "Groceries");
      expect(expense.id).toBeDefined();

      // Viewer is blocked from adding expense
      expect(() => {
        engine.addHouseholdExpense(householdId, viewer.id, 100, "Snacks");
      }).toThrow("Viewers cannot add expenses");
    });
  });
});
