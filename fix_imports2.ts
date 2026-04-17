import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const RE_EXPORTS = new Set([
    'AppState',
    'AppStateStore',
    'CompletionBoundary',
    'getDefaultAppState',
    'IDLE_SPECULATION_STATE',
    'SpeculationResult',
    'SpeculationState'
]);

const files = globSync('src/**/*.{ts,tsx}');
let modifiedCount = 0;

for (const file of files) {
    if (file === 'src/state/AppState.tsx' || file === 'src/state/AppStateStore.ts') continue;
    let content = readFileSync(file, 'utf-8');
    let hasChanges = false;

    // Use a regex that can handle multiline inner content
    const importRegex = /import\s+(type\s+)?\{\s*([\s\S]*?)\s*\}\s+from\s+['"]([^'"]*?state\/AppState\.js)['"]/g;

    content = content.replace(importRegex, (match, isRootType, inner, importPath) => {
        const specs = inner.split(',').map((s: string) => s.trim()).filter(Boolean);
        const appStateSpecs: string[] = [];
        const appStateStoreSpecs: string[] = [];

        for (const spec of specs) {
            let isTypeSpec = spec.startsWith('type ');
            let name = spec;
            if (isTypeSpec) name = spec.substring(5).trim();
            const asMatch = name.match(/^([A-Za-z0-9_]+)\s+as\s+/);
            if (asMatch) name = asMatch[1];

            if (RE_EXPORTS.has(name)) {
                // Keep 'type ' if it had it, or if root had it
                appStateStoreSpecs.push(spec);
            } else {
                appStateSpecs.push(spec);
            }
        }
        if (appStateStoreSpecs.length === 0) return match;

        hasChanges = true;
        const newAppStateStorePath = importPath.replace('AppState.js', 'AppStateStore.js');
        let replacement = '';

        const typePrefix = isRootType ? 'type ' : '';

        if (appStateSpecs.length > 0) {
            replacement += `import ${typePrefix}{ ${appStateSpecs.join(', ')} } from '${importPath}'\n`;
        }
        replacement += `import ${typePrefix}{ ${appStateStoreSpecs.join(', ')} } from '${newAppStateStorePath}'`;
        return replacement;
    });

    if (hasChanges) {
        writeFileSync(file, content, 'utf-8');
        modifiedCount++;
    }
}

console.log(`Modified ${modifiedCount} files`);
