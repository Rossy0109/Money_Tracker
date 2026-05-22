export function renderCategoryManager(categories, onDelete) {
    const list = document.getElementById('category-manager-list');
    list.innerHTML = categories.map(c => `
        <div class="category-item" style="display:flex; justify-content:space-between; padding: 5px;">
            <span>${c.name} (${c.type})</span>
            <button onclick="deleteCategory('${c.id}')" style="background:var(--expense);">Delete</button>
        </div>
    `).join('');
}

export function renderImportUI(onImport) {
    const importInput = document.getElementById('import-file');
    importInput.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => onImport(event.target.result);
        reader.readAsText(file);
    };
}
