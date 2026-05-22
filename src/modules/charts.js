export function renderCharts(txs, charts) {
    const ctxMain = document.getElementById('income-expense-chart').getContext('2d');
    const ctxPie = document.getElementById('category-chart').getContext('2d');
    const catData = {}; 
    txs.filter(t => t.type === 'expense').forEach(t => catData[t.category_name] = (catData[t.category_name] || 0) + parseFloat(t.amount));
    
    if (charts.main) charts.main.destroy(); 
    if (charts.pie) charts.pie.destroy();
    
    charts.main = new Chart(ctxMain, { type: 'bar', data: { labels: ['Income', 'Expense'], datasets: [{ data: [txs.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0), txs.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0)], backgroundColor: ['#10b981', '#ef4444'] }] } });
    charts.pie = new Chart(ctxPie, { type: 'doughnut', data: { labels: Object.keys(catData), datasets: [{ data: Object.values(catData), backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#ef4444'] }] } });
    return charts;
}
