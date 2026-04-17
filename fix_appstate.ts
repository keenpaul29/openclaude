import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/state/AppState.tsx', 'utf-8');

const replacement = '';

content = content.replace(/\/\/ TODO: Remove these re-exports once all callers import directly from\n\/\/ \.\/AppStateStore\.js\. Kept for back-compat during migration so \.ts callers\n\/\/ can incrementally move off the \.tsx import and stop pulling React\.\nexport \{ type AppState, type AppStateStore, type CompletionBoundary, getDefaultAppState, IDLE_SPECULATION_STATE, type SpeculationResult, type SpeculationState \} from '\.\/AppStateStore\.js';\n/g, replacement);

writeFileSync('src/state/AppState.tsx', content, 'utf-8');
console.log('AppState.tsx fixed');
