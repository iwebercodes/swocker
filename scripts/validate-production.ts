#!/usr/bin/env tsx
/**
 * Milestone 5.2: Production Validation Script
 * Validates that images are production-ready
 */

import Docker from 'dockerode';

const docker = new Docker();

interface ValidationResult {
  check: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string;
}

const results: ValidationResult[] = [];

function addResult(result: ValidationResult): void {
  results.push(result);
  const icon = result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '⚠';
  console.log(`${icon} ${result.check}: ${result.message}`);
  if (result.details) {
    console.log(`  ${result.details}`);
  }
}

async function validateImageExists(tag: string): Promise<boolean> {
  try {
    const images = await docker.listImages();
    return images.some((img) => img.RepoTags?.includes(tag));
  } catch {
    return false;
  }
}

async function validateImageSize(tag: string, maxSizeGB: number): Promise<void> {
  try {
    const image = docker.getImage(tag);
    const info = await image.inspect();
    const sizeGB = info.Size / 1024 ** 3;

    if (sizeGB <= maxSizeGB) {
      addResult({
        check: `Image Size (${tag})`,
        status: 'pass',
        message: `${sizeGB.toFixed(2)} GB (under ${maxSizeGB} GB limit)`,
      });
    } else {
      addResult({
        check: `Image Size (${tag})`,
        status: 'fail',
        message: `${sizeGB.toFixed(2)} GB (exceeds ${maxSizeGB} GB limit)`,
      });
    }
  } catch {
    addResult({
      check: `Image Size (${tag})`,
      status: 'fail',
      message: 'Failed to inspect image',
    });
  }
}

async function validateImageLayers(tag: string): Promise<void> {
  try {
    const image = docker.getImage(tag);
    const history = await image.history();

    const layerCount = history.length;

    if (layerCount < 50) {
      addResult({
        check: `Layer Count (${tag})`,
        status: 'pass',
        message: `${layerCount} layers (optimized)`,
      });
    } else if (layerCount < 100) {
      addResult({
        check: `Layer Count (${tag})`,
        status: 'warn',
        message: `${layerCount} layers (could be optimized)`,
      });
    } else {
      addResult({
        check: `Layer Count (${tag})`,
        status: 'fail',
        message: `${layerCount} layers (too many)`,
      });
    }
  } catch {
    addResult({
      check: `Layer Count (${tag})`,
      status: 'warn',
      message: 'Failed to check layers',
    });
  }
}

async function validateNoDebugTools(tag: string): Promise<void> {
  try {
    const container = await docker.createContainer({
      Image: tag,
      Cmd: ['sh', '-c', 'which gdb lldb strace || echo NONE'],
      AttachStdout: true,
      AttachStderr: true,
    });

    await container.start();
    await container.wait();

    const logs = await container.logs({ stdout: true, stderr: true });
    const output = logs.toString();

    await container.remove();

    if (output.includes('NONE') || output.trim() === '') {
      addResult({
        check: `Debug Tools (${tag})`,
        status: 'pass',
        message: 'No debug tools found (good for production)',
      });
    } else {
      addResult({
        check: `Debug Tools (${tag})`,
        status: 'warn',
        message: 'Debug tools present',
        details: output.trim(),
      });
    }
  } catch {
    addResult({
      check: `Debug Tools (${tag})`,
      status: 'warn',
      message: 'Failed to check debug tools',
    });
  }
}

async function validateHealthCheck(tag: string): Promise<void> {
  try {
    const image = docker.getImage(tag);
    const info = await image.inspect();

    if (info.Config.Healthcheck) {
      addResult({
        check: `Health Check (${tag})`,
        status: 'pass',
        message: 'Health check configured',
        details: info.Config.Healthcheck.Test?.join(' '),
      });
    } else {
      addResult({
        check: `Health Check (${tag})`,
        status: 'warn',
        message: 'No health check configured',
      });
    }
  } catch {
    addResult({
      check: `Health Check (${tag})`,
      status: 'fail',
      message: 'Failed to inspect health check',
    });
  }
}

async function validateSecurityLabels(tag: string): Promise<void> {
  try {
    const image = docker.getImage(tag);
    const info = await image.inspect();

    const hasLabels =
      info.Config.Labels &&
      (info.Config.Labels['org.opencontainers.image.title'] || info.Config.Labels['maintainer']);

    if (hasLabels) {
      addResult({
        check: `Metadata Labels (${tag})`,
        status: 'pass',
        message: 'Image has proper labels',
      });
    } else {
      addResult({
        check: `Metadata Labels (${tag})`,
        status: 'warn',
        message: 'Missing metadata labels',
      });
    }
  } catch {
    addResult({
      check: `Metadata Labels (${tag})`,
      status: 'warn',
      message: 'Failed to check labels',
    });
  }
}

async function validateNoRootUser(tag: string): Promise<void> {
  try {
    const image = docker.getImage(tag);
    const info = await image.inspect();

    // Check if USER directive is set
    const user = info.Config.User;

    if (user && user !== 'root' && user !== '0') {
      addResult({
        check: `Non-Root User (${tag})`,
        status: 'pass',
        message: `Running as user: ${user}`,
      });
    } else {
      addResult({
        check: `Non-Root User (${tag})`,
        status: 'warn',
        message: 'Running as root (consider non-root user for production)',
      });
    }
  } catch {
    addResult({
      check: `Non-Root User (${tag})`,
      status: 'warn',
      message: 'Failed to check user',
    });
  }
}

async function validateEntrypoint(tag: string): Promise<void> {
  try {
    const image = docker.getImage(tag);
    const info = await image.inspect();

    if (info.Config.Entrypoint && info.Config.Entrypoint.length > 0) {
      const entrypoint = Array.isArray(info.Config.Entrypoint)
        ? info.Config.Entrypoint.join(' ')
        : info.Config.Entrypoint;
      addResult({
        check: `Entrypoint (${tag})`,
        status: 'pass',
        message: 'Entrypoint configured',
        details: entrypoint,
      });
    } else {
      addResult({
        check: `Entrypoint (${tag})`,
        status: 'warn',
        message: 'No entrypoint set',
      });
    }
  } catch {
    addResult({
      check: `Entrypoint (${tag})`,
      status: 'warn',
      message: 'Failed to check entrypoint',
    });
  }
}

async function main(): Promise<void> {
  console.log('🔍 Swocker Production Validation\n');
  console.log('Validating production readiness of Docker images...\n');

  const variants = ['dev', 'prod', 'ci'];

  for (const variant of variants) {
    const tag = `swocker:test-${variant}`;

    console.log(`\n📦 Validating ${tag}...`);

    const exists = await validateImageExists(tag);
    if (!exists) {
      addResult({
        check: `Image Existence (${tag})`,
        status: 'fail',
        message: 'Image not found - run build first',
      });
      continue;
    }

    addResult({
      check: `Image Existence (${tag})`,
      status: 'pass',
      message: 'Image found',
    });

    // Size limits per variant
    const sizeLimit = variant === 'ci' ? 1.0 : variant === 'prod' ? 1.5 : 2.5;
    await validateImageSize(tag, sizeLimit);

    await validateImageLayers(tag);
    await validateHealthCheck(tag);
    await validateSecurityLabels(tag);
    await validateNoRootUser(tag);
    await validateEntrypoint(tag);

    // Prod-specific checks
    if (variant === 'prod') {
      await validateNoDebugTools(tag);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  const passCount = results.filter((r) => r.status === 'pass').length;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const warnCount = results.filter((r) => r.status === 'warn').length;

  console.log(`✓ Passed: ${passCount}`);
  console.log(`✗ Failed: ${failCount}`);
  console.log(`⚠ Warnings: ${warnCount}`);

  if (failCount > 0) {
    console.log('\n❌ Validation FAILED - Please fix the issues above');
    process.exit(1);
  } else if (warnCount > 0) {
    console.log('\n⚠️  Validation PASSED with warnings');
    process.exit(0);
  } else {
    console.log('\n✅ All validations PASSED');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('❌ Validation failed with error:', error);
  process.exit(1);
});
