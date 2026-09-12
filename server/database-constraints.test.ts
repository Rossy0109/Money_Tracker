import { beforeEach, describe, expect, it } from "vitest";

// In-memory relational database model to simulate SQLite/MySQL schema constraints
class MockRelationalDb {
  users = new Map<number, { id: number; openId: string; email: string }>();
  projects = new Map<number, { id: number; userId: number; name: string }>();
  transactions = new Map<number, { id: number; projectId: number; amount: number }>();
  categories = new Map<number, { id: number; projectId: number; name: string }>();

  private nextId = 1;

  createUser(openId: string, email: string) {
    // Unique constraint on openId
    for (const user of this.users.values()) {
      if (user.openId === openId) {
        throw new Error("Duplicate entry for key 'users.openId'");
      }
    }
    const id = this.nextId++;
    const user = { id, openId, email };
    this.users.set(id, user);
    return user;
  }

  createProject(userId: number, name: string) {
    // Foreign key constraint on userId
    if (!this.users.has(userId)) {
      throw new Error("Cannot add or update a child row: a foreign key constraint fails (userId)");
    }
    // Compound unique constraint on (userId, name)
    for (const proj of this.projects.values()) {
      if (proj.userId === userId && proj.name.toLowerCase() === name.toLowerCase()) {
        throw new Error("Duplicate entry for key 'finance_projects_user_name_unique'");
      }
    }
    const id = this.nextId++;
    const project = { id, userId, name };
    this.projects.set(id, project);
    return project;
  }

  createTransaction(projectId: number, amount: number) {
    // Foreign key constraint on projectId
    if (!this.projects.has(projectId)) {
      throw new Error("Cannot add or update a child row: a foreign key constraint fails (projectId)");
    }
    const id = this.nextId++;
    const tx = { id, projectId, amount };
    this.transactions.set(id, tx);
    return tx;
  }

  deleteProject(projectId: number) {
    if (!this.projects.has(projectId)) return;
    this.projects.delete(projectId);

    // Cascade delete transactions belonging to this project
    for (const [id, tx] of this.transactions.entries()) {
      if (tx.projectId === projectId) {
        this.transactions.delete(id);
      }
    }

    // Cascade delete categories belonging to this project
    for (const [id, cat] of this.categories.entries()) {
      if (cat.projectId === projectId) {
        this.categories.delete(id);
      }
    }
  }

  deleteUser(userId: number) {
    if (!this.users.has(userId)) return;
    this.users.delete(userId);

    // Cascade delete projects and their descendants
    for (const [id, proj] of this.projects.entries()) {
      if (proj.userId === userId) {
        this.deleteProject(id);
      }
    }
  }
}

describe("server/database-constraints.test.ts - Unique, Foreign Key, and Cascade Operations", () => {
  let db: MockRelationalDb;

  beforeEach(() => {
    db = new MockRelationalDb();
  });

  describe("Unique Constraints", () => {
    it("enforces uniqueness on user openId", () => {
      db.createUser("user_123", "user1@example.com");
      expect(() => db.createUser("user_123", "user2@example.com")).toThrow(
        "Duplicate entry for key 'users.openId'"
      );
    });

    it("enforces compound unique constraint on project (userId + name)", () => {
      const user1 = db.createUser("user_1", "u1@example.com");
      const user2 = db.createUser("user_2", "u2@example.com");

      db.createProject(user1.id, "দৈনিক হিসাব");

      // Same user cannot create project with same name
      expect(() => db.createProject(user1.id, "দৈনিক হিসাব")).toThrow("finance_projects_user_name_unique");

      // Different user CAN have a project with the same name
      expect(db.createProject(user2.id, "দৈনিক হিসাব")).toBeDefined();
    });
  });

  describe("Foreign Key Integrity", () => {
    it("rejects project creation when userId does not exist", () => {
      expect(() => db.createProject(9999, "অজানা প্রজেক্ট")).toThrow(
        "foreign key constraint fails (userId)"
      );
    });

    it("rejects transaction insertion when projectId does not exist", () => {
      expect(() => db.createTransaction(9999, 1500)).toThrow(
        "foreign key constraint fails (projectId)"
      );
    });
  });

  describe("Cascade Delete Operations", () => {
    it("cascades project deletion to delete all associated transactions", () => {
      const user = db.createUser("usr_owner", "owner@example.com");
      const project = db.createProject(user.id, "ব্যবসা");

      db.createTransaction(project.id, 1000);
      db.createTransaction(project.id, 2000);

      expect(db.transactions.size).toBe(2);

      db.deleteProject(project.id);

      expect(db.projects.has(project.id)).toBe(false);
      expect(db.transactions.size).toBe(0); // All child transactions deleted
    });

    it("cascades user deletion to delete projects and all child transactions", () => {
      const user = db.createUser("usr_test", "test@example.com");
      const proj1 = db.createProject(user.id, "ব্যক্তিগত");
      const proj2 = db.createProject(user.id, "দোকান");

      db.createTransaction(proj1.id, 500);
      db.createTransaction(proj2.id, 1200);

      expect(db.projects.size).toBe(2);
      expect(db.transactions.size).toBe(2);

      db.deleteUser(user.id);

      expect(db.users.has(user.id)).toBe(false);
      expect(db.projects.size).toBe(0);
      expect(db.transactions.size).toBe(0);
    });
  });
});
