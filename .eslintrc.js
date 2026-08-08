module.exports = {
  extends: 'erb',
  plugins: ['@typescript-eslint'],
  rules: {
    // A temporary hack related to IDE not resolving correct package.json
    'import/no-extraneous-dependencies': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/jsx-filename-extension': 'off',
    'import/extensions': 'off',
    'import/no-unresolved': 'off',
    'import/no-import-module-exports': 'off',
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
    // airbnb bans for..of to avoid pulling in regenerator-runtime. This is
    // TypeScript on modern V8, where for..of compiles to a plain loop, and the
    // ingest functions in startgg.ts read far better as loops than as chained
    // array methods. The other three selectors are airbnb's defaults, kept.
    'no-restricted-syntax': [
      'error',
      {
        selector: 'ForInStatement',
        message:
          'for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.',
      },
      {
        selector: 'LabeledStatement',
        message:
          'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
      },
      {
        selector: 'WithStatement',
        message:
          '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
      },
    ],
    // getRegistration pages the start.gg API sequentially on purpose, so the
    // throttle from makeRequestThrottle() can space the requests out. Awaiting
    // in the loop is the point; parallelising would defeat it.
    'no-await-in-loop': 'off',
  },
  overrides: [
    {
      // Test factories render a component with sensible defaults and let each
      // case override a prop or two. That reads far better as {...props} than
      // as a hand-maintained list repeated in every helper, and none of this
      // ships.
      files: ['src/__tests__/**/*.{ts,tsx}', 'src/__fixtures__/**/*.{ts,tsx}'],
      rules: {
        'react/jsx-props-no-spreading': 'off',
      },
    },
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  settings: {
    'import/resolver': {
      // See https://github.com/benmosher/eslint-plugin-import/issues/1396#issuecomment-575727774 for line below
      node: {},
      webpack: {
        config: require.resolve('./.erb/configs/webpack.config.eslint.ts'),
      },
      typescript: {},
    },
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx'],
    },
  },
  globals: {
    RequestInfo: true,
    RequestInit: true,
    NodeJS: true,
    // Electron's ambient TS namespace (Electron.Cookie,
    // Electron.MenuItemConstructorOptions) is a type-only global.
    Electron: true,
  },
};
