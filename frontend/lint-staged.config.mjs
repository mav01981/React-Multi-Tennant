export default {
  '*.{ts,tsx}': [
    // Full-project typecheck; the function task deliberately ignores the
    // staged filenames since tsc runs against the whole tsconfig project.
    () => 'npx tsc --noEmit -p tsconfig.json',
    'eslint --fix --max-warnings 0',
    'prettier --check'
  ],
  '*.{json,css,scss,md}': ['prettier --check']
}
