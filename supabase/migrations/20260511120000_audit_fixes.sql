-- 20260511120000_audit_fixes.sql
-- Fixes critical schema inconsistencies and security issues identified during audit.

-- 1. Align projects table with user ownership
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Fix Project RLS Policies
DROP POLICY IF EXISTS "Projects accessible by team members" ON projects;
CREATE POLICY "Projects accessible by owner" ON projects
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Projects accessible by team members" ON projects
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_members.project_id = projects.id AND team_members.user_id = auth.uid())
  );

-- 3. Fix Team Members RLS
DROP POLICY IF EXISTS "Team members managed by admin" ON team_members;
CREATE POLICY "Team members managed by project owner" ON team_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = team_members.project_id AND projects.user_id = auth.uid())
  );

-- 4. Align base tables with auth.users (Standardizing user references)
-- Profiles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Accounts
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_user_id_fkey;
ALTER TABLE accounts ADD CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Categories
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_user_id_fkey;
ALTER TABLE categories ADD CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Transactions
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;
ALTER TABLE transactions ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Tags
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_user_id_fkey;
ALTER TABLE tags ADD CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 5. Hardened RLS for all data tables (Supporting Collaborators)

-- Transactions
DROP POLICY IF EXISTS transactions_owner ON transactions;
CREATE POLICY "Transactions accessible by team" ON transactions
  FOR ALL USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM team_members WHERE team_members.project_id = transactions.project_id AND team_members.user_id = auth.uid())
  );

-- Budgets
DROP POLICY IF EXISTS budgets_owner ON budgets;
CREATE POLICY "Budgets accessible by team" ON budgets
  FOR ALL USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM team_members WHERE team_members.project_id = budgets.project_id AND team_members.user_id = auth.uid())
  );

-- Categories (Typically shared at profile level, but keeping user-specific for now or project-specific if needed)
-- Standard categories are usually global or user-specific. 
-- For team collaboration, we might need a project_id on categories too, 
-- but for now let's allow teammates to see each other's categories if they are in the same project?
-- Actually, let's keep Categories user-specific but allow SELECT if in same project.

-- Accounts
DROP POLICY IF EXISTS accounts_owner ON accounts;
CREATE POLICY "Accounts accessible by owner" ON accounts
  FOR ALL USING (auth.uid() = user_id);

-- Profiles
DROP POLICY IF EXISTS profiles_owner ON profiles;
CREATE POLICY "Profiles viewable by team members" ON profiles
  FOR SELECT USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM team_members tm1
      JOIN team_members tm2 ON tm1.project_id = tm2.project_id
      WHERE tm1.user_id = auth.uid() AND tm2.user_id = profiles.id
    )
  );
