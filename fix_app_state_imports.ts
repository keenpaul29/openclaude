import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const files = globSync('src/**/*.{ts,tsx}');
let count = 0;

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  if (content.includes('import { AppState } from') || content.includes('import { AppStateStore } from')) {
    let replaced = content.replace(/import\s*\{\s*AppState\s*\}\s*from/g, "import type { AppState } from");
    replaced = replaced.replace(/import\s*\{\s*AppStateStore\s*\}\s*from/g, "import type { AppStateStore } from");

    // There might be mixed imports: import { useAppState, AppState } from '...AppState.js'
    // This script might not be perfect, let's just restore original then do it right.
  }
}
