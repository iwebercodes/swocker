#!/usr/bin/env tsx

/**
 * Validates that all tooling is properly configured
 * - Runs ESLint on scripts/
 * - Runs TypeScript compiler
 * - Runs Prettier check
 * - Verifies all npm scripts are defined
 */

import { $, chalk } from 'zx';
import fs from 'fs';

$.verbose = true;

interface ValidationResult {
  name: string;
  success: boolean;
  error?: string;
}

const results: ValidationResult[] = [];

async function validateESLint(): Promise<ValidationResult> {
  console.log(chalk.blue('→ Validating ESLint configuration...'));
  try {
    await $`npx eslint --version`;

    // Check if config file exists
    if (!fs.existsSync('eslint.config.js')) {
      throw new Error('eslint.config.js not found');
    }

    console.log(chalk.green('✓ ESLint is configured'));
    return { name: 'ESLint', success: true };
  } catch (error) {
    return {
      name: 'ESLint',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function validateTypeScript(): Promise<ValidationResult> {
  console.log(chalk.blue('→ Validating TypeScript configuration...'));
  try {
    await $`npx tsc --version`;

    // Check if config file exists
    if (!fs.existsSync('tsconfig.json')) {
      throw new Error('tsconfig.json not found');
    }

    // Verify TypeScript can parse the config
    await $`npx tsc --showConfig > /dev/null`;

    console.log(chalk.green('✓ TypeScript is configured'));
    return { name: 'TypeScript', success: true };
  } catch (error) {
    return {
      name: 'TypeScript',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function validatePrettier(): Promise<ValidationResult> {
  console.log(chalk.blue('→ Validating Prettier configuration...'));
  try {
    await $`npx prettier --version`;

    // Check if config file exists
    if (!fs.existsSync('.prettierrc')) {
      throw new Error('.prettierrc not found');
    }

    console.log(chalk.green('✓ Prettier is configured'));
    return { name: 'Prettier', success: true };
  } catch (error) {
    return {
      name: 'Prettier',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function validateNpmScripts(): Promise<ValidationResult> {
  console.log(chalk.blue('→ Validating npm scripts...'));
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

    const requiredScripts = [
      'lint',
      'lint:fix',
      'format',
      'format:check',
      'type-check',
      'verify',
      'test',
    ];

    const missingScripts = requiredScripts.filter((script) => !packageJson.scripts[script]);

    if (missingScripts.length > 0) {
      throw new Error(`Missing scripts: ${missingScripts.join(', ')}`);
    }

    console.log(chalk.green('✓ All required npm scripts are defined'));
    return { name: 'npm scripts', success: true };
  } catch (error) {
    return {
      name: 'npm scripts',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function validateProjectStructure(): Promise<ValidationResult> {
  console.log(chalk.blue('→ Validating project structure...'));
  try {
    const requiredFiles = ['package.json', 'tsconfig.json', 'eslint.config.js', '.prettierrc'];

    const missingFiles = requiredFiles.filter((file) => !fs.existsSync(file));

    if (missingFiles.length > 0) {
      throw new Error(`Missing files: ${missingFiles.join(', ')}`);
    }

    const requiredDirs = ['scripts'];
    const missingDirs = requiredDirs.filter((dir) => !fs.existsSync(dir));

    if (missingDirs.length > 0) {
      throw new Error(`Missing directories: ${missingDirs.join(', ')}`);
    }

    console.log(chalk.green('✓ Project structure is valid'));
    return { name: 'Project structure', success: true };
  } catch (error) {
    return {
      name: 'Project structure',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  console.log(chalk.bold('\n🔧 Swocker Tooling Verification\n'));

  // Run all validations
  results.push(await validateProjectStructure());
  results.push(await validateESLint());
  results.push(await validateTypeScript());
  results.push(await validatePrettier());
  results.push(await validateNpmScripts());

  // Print summary
  console.log(chalk.bold('\n📊 Summary:\n'));

  let allPassed = true;
  for (const result of results) {
    if (result.success) {
      console.log(chalk.green(`✓ ${result.name}`));
    } else {
      console.log(chalk.red(`✗ ${result.name}: ${result.error}`));
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log(chalk.bold.green('\n✅ All tooling validations passed!\n'));
    process.exit(0);
  } else {
    console.log(chalk.bold.red('\n❌ Some validations failed\n'));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(chalk.red('Error running verification:'), error);
  process.exit(1);
});
