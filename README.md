## Table Variable Resolver (Obsidian Plugin)

Resolve inline `{row_name}` variables in a note using data from a markdown table in another note, and generate a resolved copy of the note.

### Usage

1. **Create a table note** with a markdown table. The **first row** is headers, and the **first column** contains row names:

```markdown
| Item   | Price | Stock |
| ------ | ----- | ----- |
| Apple  | 1.20  | 10    |
| Orange | 0.80  | 5     |
```

2. **Create a note that references the table** and add YAML frontmatter:

```markdown
---
sourceTableNote: "Tables/Prices"
column: "Price"
outputNoteTitle: "Resolved - {{title}}"
---

The price of {Apple} is high.
The price of {Orange} is low.
```

3. **Run the command** `Generate resolved note from table` from the command palette while this note is active.

4. A new note will be created in the same folder, with all `{row_name}` placeholders replaced by the values from the specified column in the table.

### YAML frontmatter keys

- `sourceTableNote`: Title or path of the note containing the table to use (e.g. `Tables/Prices`).
- `column`: Name of the table column to use for replacements (e.g. `Price`).
- `outputNoteTitle` (optional): Template for the generated note title. Supports `{{title}}` which is replaced with the current note title. Defaults to `{{title}} (resolved)` if omitted.

### Variable syntax

- Any `{Row Name}` in the note body is treated as a variable.
- `Row Name` must match the value in the **first column** of the table.
- If a row name or the specified column is missing, the placeholder is left unchanged and a notice summarizing missing rows is shown.

### Installation via BRAT

1. Install the **BRAT** plugin in Obsidian.
2. Open BRAT settings and choose **Add Beta plugin**.
3. Enter the GitHub repository URL for this plugin.
4. After BRAT installs the plugin, enable **Table Variable Resolver** in Obsidian’s **Community Plugins**.

### Building from source

1. Install dependencies:

```bash
npm install
```

2. Build the plugin:

```bash
npm run build
```

3. Copy the plugin folder (including `manifest.json`, `main.js`, and `styles.css` if present) into your vault’s `.obsidian/plugins` directory.


