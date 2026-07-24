export function updateAssistantUI(inc, exp) {
    const healthBadge = document.getElementById('health-score-badge');
    const score = Math.max(0, Math.min(100, Math.round((inc > 0 ? (inc - exp) / inc : 0) * 200)));
    healthBadge.innerText = `Score: ${score}`;
    healthBadge.style.background = score > 70 ? '#10b981' : (score > 40 ? '#f59e0b' : '#ef4444');
    document.getElementById('assistant-advice').innerHTML = exp > inc ? "• 🔴 Alert: Spending higher than income!" : "• Balance is stable. Keep tracking!";
}
