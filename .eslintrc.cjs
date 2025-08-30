// .eslintrc.cjs - Development-friendly configuration
/**
 * ESLint configuration for School ERP SaaS project
 * @type {import('eslint').Linter.Config}
 */
module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
    jest: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  globals: {
    // Add commonly used globals
    'process': 'readonly',
    'Buffer': 'readonly',
    'console': 'readonly',
    'setTimeout': 'readonly',
    'setInterval': 'readonly',
    'clearTimeout': 'readonly',
    'clearInterval': 'readonly'
  },
  rules: {
    // **Relaxed Error Rules** (converted to warnings)
    'no-console': 'warn',  // Allow console statements
    'no-debugger': 'warn', // Allow debugger for development
    'no-unused-vars': ['warn', { 
      argsIgnorePattern: '^_|^next$|^req$|^res$|^err$|^error$',
      varsIgnorePattern: '^_|^logger$|^config$',
      caughtErrorsIgnorePattern: '^_'
    }],
    
    // **Essential Rules** (keep as errors)
    'no-var': 'error',
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-undef': 'error',
    
    // **Style Rules** (warnings instead of errors)
    'prefer-const': 'warn',
    'prefer-arrow-callback': 'warn',
    'eqeqeq': 'warn',
    'curly': 'warn',
    'arrow-spacing': 'warn',
    'no-duplicate-imports': 'warn',
    'object-shorthand': 'warn',
    'prefer-destructuring': 'warn',
    'prefer-template': 'warn',
    'template-curly-spacing': 'warn',
    'camelcase': 'warn',
    
    // **Complexity Rules** (more lenient limits)
    'max-params': ['warn', 8],  // Increased from 5
    'max-lines-per-function': ['warn', { 
      max: 150,  // Increased from 80
      skipComments: true,
      skipBlankLines: true
    }],
    'complexity': ['warn', 20], // Increased from 10
    
    // **Disable problematic rules for now**
    'no-dupe-keys': 'error', // Keep this as error
    'no-useless-escape': 'warn'
  },
  overrides: [
    // **Test files** - Very lenient
    {
      files: [
        '**/*.test.js',
        '**/*.spec.js',
        '**/tests/**/*.js',
        '**/__tests__/**/*.js'
      ],
      rules: {
        'no-console': 'off',
        'max-lines-per-function': 'off',
        'complexity': 'off',
        'no-unused-vars': 'off'
      }
    },
    
    // **Configuration files** - Lenient
    {
      files: [
        '*.config.js',
        '*.config.mjs',
        '.eslintrc.cjs',
        'jest.config.js'
      ],
      rules: {
        'no-console': 'off',
        'max-lines-per-function': 'off',
        'complexity': 'off'
      }
    },
    
    // **Scripts** - Very lenient
    {
      files: [
        'scripts/**/*.js',
        'scripts/**/*.mjs'
      ],
      rules: {
        'no-console': 'off',
        'max-lines-per-function': 'off',
        'complexity': 'off',
        'no-unused-vars': 'off'
      }
    },

    // **Migration and seed files** - Very lenient
    {
      files: [
        'src/infrastructure/database/**/*.js',
        '**/migrations/**/*.js',
        '**/seeds/**/*.js'
      ],
      rules: {
        'no-console': 'off',
        'no-unused-vars': 'off',
        'max-lines-per-function': 'off',
        'complexity': 'off'
      }
    }
  ],
  
  // Ignore patterns
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    'logs/',
    '.next/',
    '.vercel/',
    '*.min.js',
    'temp/',
    'tmp/'
  ]
};
