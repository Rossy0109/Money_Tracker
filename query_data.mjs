
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function run() {
  console.log('--- Projects ---');
  const { data: projects, error: pError } = await supabase.from('projects').select('*');
  if (pError) console.error(pError);
  else console.table(projects);

  console.log('\n--- Transaction Summary by Project ---');
  const { data: summary, error: sError } = await supabase
    .from('transactions')
    .select('project_id, amount, type');
  
  if (sError) {
    console.error(sError);
  } else {
    const projectStats = {};
    summary.forEach(t => {
      if (!projectStats[t.project_id]) projectStats[t.project_id] = { income: 0, expense: 0 };
      if (t.type === 'income') projectStats[t.project_id].income += Number(t.amount);
      else projectStats[t.project_id].expense += Number(t.amount);
    });
    console.table(projectStats);
  }
}

run();
