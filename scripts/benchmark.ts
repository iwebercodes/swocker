#!/usr/bin/env tsx
/**
 * Milestone 5.2: Performance Benchmark Script
 * Measures and reports performance metrics
 */

import Docker from 'dockerode';

const docker = new Docker();

interface BenchmarkResult {
  metric: string;
  value: number;
  unit: string;
  target?: number;
  status: 'pass' | 'fail' | 'warn';
}

const results: BenchmarkResult[] = [];

function addResult(result: BenchmarkResult): void {
  results.push(result);
  const icon = result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '⚠';
  const targetInfo = result.target ? ` (target: ${result.target}${result.unit})` : '';
  console.log(`${icon} ${result.metric}: ${result.value.toFixed(2)}${result.unit}${targetInfo}`);
}

async function benchmarkImageSize(tag: string): Promise<void> {
  try {
    const image = docker.getImage(tag);
    const info = await image.inspect();
    const sizeMB = info.Size / 1024 / 1024;

    const variant = tag.split(':')[1]?.split('-')[1] || 'unknown';
    const targets: Record<string, number> = {
      ci: 1000,
      prod: 1500,
      dev: 2500,
    };

    const target = targets[variant] || 2000;
    const status = sizeMB <= target ? 'pass' : sizeMB <= target * 1.2 ? 'warn' : 'fail';

    addResult({
      metric: `Image Size (${tag})`,
      value: sizeMB,
      unit: 'MB',
      target,
      status,
    });
  } catch {
    console.error(`Failed to benchmark image size for ${tag}`);
  }
}

/* Uncomment to benchmark build time (warning: this is slow)
import { $ } from 'zx';

async function benchmarkBuildTime(tag: string): Promise<void> {
  try {
    console.log(`\nBuilding ${tag} to measure build time...`);

    const startTime = Date.now();
    await $`docker build --target ${tag.includes('ci') ? 'ci' : tag.includes('prod') ? 'prod' : 'dev'} -t ${tag}-bench .`;
    const buildTime = (Date.now() - startTime) / 1000;

    const target = 600; // 10 minutes
    const status = buildTime <= target ? 'pass' : buildTime <= target * 1.2 ? 'warn' : 'fail';

    addResult({
      metric: `Build Time (${tag})`,
      value: buildTime,
      unit: 's',
      target,
      status,
    });

    // Cleanup
    await $`docker rmi ${tag}-bench`.catch(() => {});
  } catch {
    console.error(`Failed to benchmark build time for ${tag}`);
  }
}
*/

async function benchmarkStartupTime(tag: string, withDb: boolean = true): Promise<void> {
  let mysqlContainer: Docker.Container | null = null;

  try {
    if (withDb) {
      // Create MySQL with tmpfs
      mysqlContainer = await docker.createContainer({
        Image: 'mysql:8.0',
        Env: ['MYSQL_ROOT_PASSWORD=root', 'MYSQL_DATABASE=shopware'],
        ExposedPorts: { '3306/tcp': {} },
        HostConfig: {
          PortBindings: { '3306/tcp': [{ HostPort: '0' }] },
          Tmpfs: { '/var/lib/mysql': 'rw,noexec,nosuid,size=512m' },
        },
      });

      await mysqlContainer.start();

      // Wait for MySQL
      let ready = false;
      for (let i = 0; i < 60; i++) {
        const logs = await mysqlContainer.logs({ stdout: true, stderr: true });
        if (logs.toString().includes('ready for connections')) {
          ready = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!ready) {
        throw new Error('MySQL did not start in time');
      }
    }

    const mysqlPort = withDb ? await getMysqlPort(mysqlContainer!) : undefined;

    const startTime = Date.now();

    const container = await docker.createContainer({
      Image: tag,
      Env: withDb
        ? [
            'DATABASE_HOST=host.docker.internal',
            `DATABASE_PORT=${mysqlPort}`,
            'DATABASE_PASSWORD=root',
            'APP_ENV=dev',
            'APP_SECRET=bench',
          ]
        : ['APP_ENV=dev', 'APP_SECRET=bench'],
      ExposedPorts: { '80/tcp': {} },
      HostConfig: {
        PortBindings: { '80/tcp': [{ HostPort: '0' }] },
        ExtraHosts: withDb ? ['host.docker.internal:host-gateway'] : undefined,
      },
    });

    await container.start();

    // Wait for healthy
    for (let i = 0; i < 120; i++) {
      const info = await container.inspect();
      if (info.State.Health?.Status === 'healthy') {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const startupTime = (Date.now() - startTime) / 1000;

    await container.stop();
    await container.remove();

    const variant = tag.split(':')[1]?.split('-')[1] || 'unknown';
    const targets: Record<string, number> = {
      dev: 60,
      prod: 45,
    };

    const target = targets[variant] || 60;
    const status = startupTime <= target ? 'pass' : startupTime <= target * 1.2 ? 'warn' : 'fail';

    addResult({
      metric: `Startup Time (${tag})${withDb ? ' with DB' : ''}`,
      value: startupTime,
      unit: 's',
      target,
      status,
    });
  } catch {
    console.error(`Failed to benchmark startup time for ${tag}`);
  } finally {
    if (mysqlContainer) {
      try {
        await mysqlContainer.stop();
        await mysqlContainer.remove();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

async function getMysqlPort(container: Docker.Container): Promise<number> {
  const info = await container.inspect();
  return parseInt(info.NetworkSettings.Ports['3306/tcp']?.[0]?.HostPort || '0', 10);
}

async function benchmarkLayerCount(tag: string): Promise<void> {
  try {
    const image = docker.getImage(tag);
    const history = await image.history();
    const layerCount = history.length;

    const target = 50;
    const status = layerCount <= target ? 'pass' : layerCount <= target * 1.2 ? 'warn' : 'fail';

    addResult({
      metric: `Layer Count (${tag})`,
      value: layerCount,
      unit: '',
      target,
      status,
    });
  } catch {
    console.error(`Failed to benchmark layer count for ${tag}`);
  }
}

async function main(): Promise<void> {
  console.log('⚡ Swocker Performance Benchmarks\n');
  console.log('Running performance tests...\n');

  const variants = [
    { tag: 'swocker:test-dev', name: 'dev' },
    { tag: 'swocker:test-prod', name: 'prod' },
    { tag: 'swocker:test-ci', name: 'ci' },
  ];

  for (const { tag, name } of variants) {
    console.log(`\n📦 Benchmarking ${tag}...\n`);

    try {
      const image = docker.getImage(tag);
      await image.inspect();

      await benchmarkImageSize(tag);
      await benchmarkLayerCount(tag);

      // Skip startup benchmarks for CI variant (no web server)
      if (name !== 'ci') {
        await benchmarkStartupTime(tag, true);
      }

      // Optionally benchmark build time (commented out by default as it's slow)
      // await benchmarkBuildTime(tag);
    } catch {
      console.log(`⚠️  Image ${tag} not found - skipping`);
    }
  }

  // Generate report
  console.log('\n' + '='.repeat(60));
  console.log('Performance Report:');
  console.log('='.repeat(60));

  const passCount = results.filter((r) => r.status === 'pass').length;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const warnCount = results.filter((r) => r.status === 'warn').length;

  console.log(`\n✓ Met targets: ${passCount}`);
  console.log(`✗ Failed targets: ${failCount}`);
  console.log(`⚠ Warnings: ${warnCount}`);

  // Performance comparison table
  console.log('\n' + '='.repeat(60));
  console.log('Performance Comparison:');
  console.log('='.repeat(60));

  const metrics = [...new Set(results.map((r) => r.metric.split('(')[0]?.trim()))];

  for (const metric of metrics) {
    console.log(`\n${metric}:`);
    results
      .filter((r) => r.metric.startsWith(metric || ''))
      .forEach((r) => {
        console.log(
          `  ${r.metric.split('(')[1]?.replace(')', '')}: ${r.value.toFixed(2)}${r.unit}`
        );
      });
  }

  if (failCount > 0) {
    console.log('\n⚠️  Some performance targets were not met');
    process.exit(1);
  } else {
    console.log('\n✅ All performance targets met');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('❌ Benchmarking failed with error:', error);
  process.exit(1);
});
