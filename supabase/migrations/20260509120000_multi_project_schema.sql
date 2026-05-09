-- 1. Create Projects
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  budget numeric(14,2) DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

-- 2. Update Transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);

-- 3. Create Team Members
CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  role text DEFAULT 'manager' CHECK (role IN ('admin', 'manager', 'viewer')),
  created_at timestamptz DEFAULT now()
);

-- 4. Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- 5. Policies
CREATE POLICY "Projects accessible by team members" ON projects
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM team_members WHERE team_members.project_id = projects.id AND team_members.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Team members managed by admin" ON team_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
