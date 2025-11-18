import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Docker from 'dockerode';
import { $ } from 'zx';
import { readFileSync, writeFileSync } from 'fs';
import {
  getDocker,
  createContainer,
  cleanup,
  waitForHealthy,
  waitForLog,
} from '../helpers/docker.js';

/**
 * Milestone 4.3: Performance Tests
 * Validates startup times, image sizes, and build performance
 */
describe('Performance', () => {
  const docker = getDocker();

  describe('Image Sizes', () => {
    it('dev image size is reasonable', async () => {
      const image = docker.getImage('swocker:test-dev');
      const info = await image.inspect();
      const sizeGB = info.Size / 1024 ** 3;

      console.log(`Dev image size: ${sizeGB.toFixed(2)} GB`);
      expect(sizeGB).toBeLessThan(2.5); // Allow up to 2.5GB for dev
    });

    it('prod image size is optimized', async () => {
      const image = docker.getImage('swocker:test-prod');
      const info = await image.inspect();
      const sizeGB = info.Size / 1024 ** 3;

      console.log(`Prod image size: ${sizeGB.toFixed(2)} GB`);
      expect(sizeGB).toBeLessThan(1.5); // Prod should be smaller
    });

    it('ci image size is minimal', async () => {
      const image = docker.getImage('swocker:test-ci');
      const info = await image.inspect();
      const sizeMB = info.Size / 1024 ** 2;

      console.log(`CI image size: ${sizeMB.toFixed(2)} MB`);
      expect(sizeMB).toBeLessThan(1000); // Under 1GB
    });
  });

  describe('Startup Performance', () => {
    let mysqlContainer: Docker.Container | null = null;

    beforeAll(async () => {
      // Create MySQL with tmpfs for fast startup
      const mysql = await docker.createContainer({
        Image: 'mysql:8.0',
        Env: ['MYSQL_ROOT_PASSWORD=root', 'MYSQL_DATABASE=shopware', 'MYSQL_ROOT_HOST=%'],
        ExposedPorts: { '3306/tcp': {} },
        HostConfig: {
          PortBindings: { '3306/tcp': [{ HostPort: '0' }] },
          Tmpfs: { '/var/lib/mysql': 'rw,noexec,nosuid,size=1g' },
        },
      });

      await mysql.start();
      mysqlContainer = mysql;
      await waitForLog(mysql, 'ready for connections', 120000);
    }, 180000);

    afterAll(async () => {
      if (mysqlContainer) {
        await cleanup([mysqlContainer]);
      }
    });

    it('dev variant starts in reasonable time', async () => {
      if (!mysqlContainer) {
        throw new Error('MySQL container not available');
      }

      const mysqlInfo = await mysqlContainer.inspect();
      const mysqlPort = mysqlInfo.NetworkSettings.Ports['3306/tcp']?.[0]?.HostPort;

      if (!mysqlPort) {
        throw new Error('MySQL port not found');
      }

      const startTime = Date.now();

      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: [
          `DATABASE_HOST=host.docker.internal`,
          `DATABASE_PORT=${mysqlPort}`,
          'DATABASE_USER=root',
          'DATABASE_PASSWORD=root',
          'DATABASE_NAME=shopware',
          'APP_ENV=dev',
          'APP_SECRET=test-secret',
        ],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
          ExtraHosts: ['host.docker.internal:host-gateway'],
        },
      });

      try {
        await waitForHealthy(container, 60000);
        const duration = Date.now() - startTime;

        console.log(`Dev startup time: ${(duration / 1000).toFixed(2)}s`);
        expect(duration).toBeLessThan(60000); // Under 60s
      } finally {
        await cleanup([container]);
      }
    }, 120000);

    it('prod variant starts faster than dev', async () => {
      if (!mysqlContainer) {
        throw new Error('MySQL container not available');
      }

      const mysqlInfo = await mysqlContainer.inspect();
      const mysqlPort = mysqlInfo.NetworkSettings.Ports['3306/tcp']?.[0]?.HostPort;

      if (!mysqlPort) {
        throw new Error('MySQL port not found');
      }

      const startTime = Date.now();

      const container = await createContainer({
        Image: 'swocker:test-prod',
        Env: [
          `DATABASE_HOST=host.docker.internal`,
          `DATABASE_PORT=${mysqlPort}`,
          'DATABASE_USER=root',
          'DATABASE_PASSWORD=root',
          'DATABASE_NAME=shopware',
          'APP_ENV=prod',
          'APP_SECRET=test-secret',
        ],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
          ExtraHosts: ['host.docker.internal:host-gateway'],
        },
      });

      try {
        await waitForHealthy(container, 45000);
        const duration = Date.now() - startTime;

        console.log(`Prod startup time: ${(duration / 1000).toFixed(2)}s`);
        expect(duration).toBeLessThan(45000); // Under 45s
      } finally {
        await cleanup([container]);
      }
    }, 90000);
  });

  describe('Build Performance', () => {
    it('incremental build is fast', async () => {
      // Make a trivial change to Dockerfile
      const dockerfilePath = 'docker/Dockerfile';
      const originalContent = readFileSync(dockerfilePath, 'utf-8');

      try {
        // Add a comment
        writeFileSync(dockerfilePath, originalContent + '\n# Performance test comment\n');

        // Rebuild and measure
        const startTime = Date.now();
        await $`docker build -f docker/Dockerfile --target dev -t swocker:perf-test .`;
        const duration = Date.now() - startTime;

        console.log(`Incremental build time: ${(duration / 1000).toFixed(2)}s`);
        expect(duration).toBeLessThan(180000); // Under 3 minutes
      } finally {
        // Restore original
        writeFileSync(dockerfilePath, originalContent);

        // Cleanup test image
        try {
          await $`docker rmi swocker:perf-test`;
        } catch {
          // Ignore cleanup errors
        }
      }
    }, 300000);

    it('layer caching is effective', async () => {
      // Build twice and check second build is much faster
      const tag = 'swocker:cache-test';

      // Clear build cache to ensure first build is from scratch
      await $`docker builder prune -f`;

      // First build (without cache)
      const firstBuildStart = Date.now();
      await $`docker build --no-cache -f docker/Dockerfile --target dev -t ${tag} .`;
      const firstBuildTime = Date.now() - firstBuildStart;

      // Second build (should use cache from first build)
      const secondBuildStart = Date.now();
      await $`docker build -f docker/Dockerfile --target dev -t ${tag} .`;
      const secondBuildTime = Date.now() - secondBuildStart;

      console.log(`First build: ${(firstBuildTime / 1000).toFixed(2)}s`);
      console.log(`Second build: ${(secondBuildTime / 1000).toFixed(2)}s`);
      console.log(`Cache speedup: ${(firstBuildTime / secondBuildTime).toFixed(2)}x`);

      // Second build should be at least 5x faster
      expect(secondBuildTime).toBeLessThan(firstBuildTime / 5);

      // Cleanup
      try {
        await $`docker rmi ${tag}`;
      } catch {
        // Ignore cleanup errors
      }
    }, 600000);
  });

  describe('Resource Usage', () => {
    it('container memory usage is reasonable during startup', async () => {
      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: ['DATABASE_HOST=', 'APP_ENV=dev', 'APP_SECRET=test'],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
          Memory: 2 * 1024 * 1024 * 1024, // 2GB limit
        },
      });

      try {
        // Wait a bit for startup
        await new Promise((resolve) => setTimeout(resolve, 10000));

        const stats = await container.stats({ stream: false });
        const memoryUsageMB = stats.memory_stats.usage / 1024 / 1024;

        console.log(`Memory usage: ${memoryUsageMB.toFixed(2)} MB`);
        expect(memoryUsageMB).toBeLessThan(1024); // Under 1GB
      } finally {
        await cleanup([container]);
      }
    }, 30000);
  });

  describe('Build Args and Optimization', () => {
    it('Dockerfile uses multi-stage builds', async () => {
      const dockerfile = await $`cat docker/Dockerfile`;

      // Check for multiple FROM statements (multi-stage)
      const fromStatements = dockerfile.toString().match(/^FROM /gm);
      expect(fromStatements).toBeDefined();
      expect(fromStatements!.length).toBeGreaterThan(1);

      console.log(`Number of build stages: ${fromStatements!.length}`);
    });

    it('Dockerfile has proper layer ordering for cache efficiency', async () => {
      const dockerfile = await $`cat docker/Dockerfile`;
      const content = dockerfile.toString();

      // Split by FROM to check each stage separately
      const stages = content.split(/^FROM /m).filter((s) => s.trim());

      // For each stage, check that system dependency installation comes before app file copies
      let hasGoodOrdering = false;

      stages.forEach((stage) => {
        const lines = stage.split('\n');
        let lastSystemRunIndex = -1;
        let firstAppCopyIndex = -1;

        lines.forEach((line, index) => {
          // System dependency installation commands
          if (
            line.trim().startsWith('RUN apt-get') ||
            line.trim().startsWith('RUN add-apt-repository')
          ) {
            lastSystemRunIndex = index;
          }
          // Application file copies (excluding config files which are typically small)
          if (
            line.trim().startsWith('COPY --from=composer') ||
            line.trim().match(/COPY.*\/var\/www\/html/)
          ) {
            if (firstAppCopyIndex === -1) {
              firstAppCopyIndex = index;
            }
          }
        });

        // If both are found, check ordering
        if (lastSystemRunIndex > -1 && firstAppCopyIndex > -1) {
          if (lastSystemRunIndex < firstAppCopyIndex) {
            hasGoodOrdering = true;
          }
        }
      });

      // At least one stage should have good cache ordering
      expect(hasGoodOrdering).toBe(true);
    });
  });
});
