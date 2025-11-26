// @ts-check

import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist/*', 'eslint.config.js', 'prebuild.js', 'postbuild.js'] },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    eslintPluginPrettierRecommended,
    {
        languageOptions: {
            parserOptions: {
                project: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/require-await': 'off',
            '@typescript-eslint/no-redundant-type-constituents': 'off',
            '@typescript-eslint/no-empty-function': ['error', { allow: ['private-constructors'] }],
            '@typescript-eslint/no-unused-vars': ['error', { args: 'none' }],
            '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignoreConditionalTests: true }],
            'no-console': 'error',
            'complexity': ['warn', { max: 24 }],
        },
    },
);
