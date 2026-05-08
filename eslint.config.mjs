import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';
export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*']
  },
  {
    files: ['**/*.rules'],
    plugins: {
      '@firebase/security-rules': firebaseRulesPlugin
    },
    languageOptions: {
      parser: firebaseRulesPlugin.parser,
      sourceType: 'module'
    },
    rules: {
      ...firebaseRulesPlugin.configs['flat/recommended'].rules
    }
  }
];
