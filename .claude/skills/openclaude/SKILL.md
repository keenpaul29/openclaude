```markdown
# openclaude Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and workflows used in the `openclaude` TypeScript codebase. You'll learn about file organization, code style, commit conventions, and how to safely refactor core logic with comprehensive testing. This guide is ideal for contributors seeking to maintain consistency and reliability in the project.

## Coding Conventions

### File Naming
- All files use **kebab-case**.
  - Example: `input-event.ts`, `parse-keypress.test.ts`

### Import Style
- Use **relative imports**.
  - Example:
    ```typescript
    import { parseKeypress } from './parse-keypress';
    ```

### Export Style
- Use **named exports**.
  - Example:
    ```typescript
    export function handleInputEvent(event: InputEvent) { ... }
    ```

### Commit Messages
- Follow **conventional commit** format.
- Common prefix: `chore`
- Example:
  ```
  chore: refactor input event handling for clarity
  ```

## Workflows

### Refactor and Update Tests
**Trigger:** When you need to remove or refactor legacy logic in a core module and ensure correctness with updated tests.  
**Command:** `/refactor-with-tests`

1. **Refactor or Remove Legacy Logic**
   - Edit the main TypeScript implementation file (e.g., `src/ink/events/input-event.ts`).
   - Remove outdated code or refactor for clarity, performance, or maintainability.
   - Example:
     ```typescript
     // Before
     export function handleInputEvent(event: InputEvent) {
       // legacy logic
     }

     // After
     export function handleInputEvent(event: InputEvent) {
       // improved logic
     }
     ```

2. **Update or Add Comprehensive Unit Tests**
   - Edit or create the corresponding `.test.ts` file (e.g., `src/ink/events/input-event.test.ts`).
   - Ensure all new and changed logic is covered by tests.
   - Example:
     ```typescript
     import { handleInputEvent } from './input-event';

     test('should handle new input event logic', () => {
       // test implementation
     });
     ```

3. **(Optional) Refactor Test Helpers**
   - Improve type safety and documentation in test helpers as needed.

**Files Involved:**
- `src/ink/events/input-event.ts`
- `src/ink/events/input-event.test.ts`
- `src/ink/parse-keypress.test.ts`

**Frequency:** ~2x/month

## Testing Patterns

- **Test Files:** Named with `.test.` before the extension (e.g., `parse-keypress.test.ts`).
- **Framework:** Not explicitly specified; likely uses a standard TypeScript-compatible test runner.
- **Test Structure:** Place tests alongside or near the implementation files.
- **Coverage:** Update or add tests for every change in logic.

Example test:
```typescript
import { parseKeypress } from './parse-keypress';

test('parses keypress correctly', () => {
  expect(parseKeypress('a')).toEqual({ key: 'a' });
});
```

## Commands

| Command              | Purpose                                                        |
|----------------------|----------------------------------------------------------------|
| /refactor-with-tests | Refactor legacy logic and update/add comprehensive unit tests. |
```
