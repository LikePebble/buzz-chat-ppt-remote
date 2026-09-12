import tseslint from '@electron-toolkit/eslint-config-ts'
import prettier from '@electron-toolkit/eslint-config-prettier'
import vue from 'eslint-plugin-vue'

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'out/**'] },
  tseslint.configs.recommended,
  vue.configs['flat/recommended'],
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: tseslint.parser } } },
  { rules: { '@typescript-eslint/explicit-function-return-type': 'off', 'vue/multi-word-component-names': 'off' } },
  prettier
)
