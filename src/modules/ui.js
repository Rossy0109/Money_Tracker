export function renderTransactions(list, transactionList, currency) {
    transactionList.innerHTML = list.map(t => `
        <div class="transaction-item" style="display:flex; align-items:center; justify-content:space-between; padding: 10px 0; border-bottom: 1px solid var(--border);">
            <div>
                <strong>${t.category_name || 'N/A'}</strong><br>
                <small>${t.metadata?.sector || 'Gen'} | ${t.method || 'Cash'}</small>
            </div>
            <div style="text-align:right;">
                <span style="color:${t.type === 'income' ? 'var(--income)' : 'var(--expense)'}; display:block; margin-bottom:5px;">
                    ${t.type === 'income' ? '+' : '-'}${currency}${Math.abs(t.amount).toFixed(0)}
                </span>
                <button onclick="deleteTransaction('${t.id}')" style="background:#ef4444; padding:2px 8px; font-size:0.7rem;">Delete</button>
            </div>
        </div>
    `).join('') || `<p class="text-muted">No transactions.</p>`;
}

export function updateAssistantUI(inc, exp) {
    const healthBadge = document.getElementById('health-score-badge');
    const score = Math.max(0, Math.min(100, Math.round((inc > 0 ? (inc - exp) / inc : 0) * 200)));
    healthBadge.innerText = `Score: ${score}`;
    healthBadge.style.background = score > 70 ? '#10b981' : (score > 40 ? '#f59e0b' : '#ef4444');
    document.getElementById('assistant-advice').innerHTML = exp > inc ? "• 🔴 Alert: Spending higher than income!" : "• Balance is stable. Keep tracking!";
}
