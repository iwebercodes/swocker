import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDocker, cleanupByName, waitForLog } from '../helpers/docker.js';
import { $ } from 'zx';
import * as path from 'path';

$.verbose = false;

const TEST_IMAGE_TAG = 'swocker:test-hooks';
const TEST_NETWORK = 'swocker-test-hooks-network';
const TEST_DB_CONTAINER = 'swocker-test-hooks-mysql';

describe('Custom Initialization Hooks', () => {
  beforeAll(async () => {
    console.log('Setting up hooks test environment...');

    await cleanupByName([TEST_DB_CONTAINER], [TEST_NETWORK]);

    await $`docker build -f docker/Dockerfile --target dev -t ${TEST_IMAGE_TAG} .`;

    try {
      await $`docker network create ${TEST_NETWORK}`;
    } catch {
      // Network might already exist
    }

    await $`docker run -d \
      --name ${TEST_DB_CONTAINER} \
      --network ${TEST_NETWORK} \
      --tmpfs /var/lib/mysql:rw,noexec,nosuid,size=1g \
      -e MYSQL_ROOT_PASSWORD=test123 \
      -e MYSQL_DATABASE=shopware \
      mysql:8.0`;

    console.log('Waiting for MySQL to initialize...');
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }, 120000);

  afterAll(async () => {
    try {
      await $`docker rm -f ${TEST_DB_CONTAINER}`;
    } catch {
      // Container might not exist
    }

    try {
      await $`docker network rm ${TEST_NETWORK}`;
    } catch {
      // Network might not exist
    }

    try {
      await $`docker rmi ${TEST_IMAGE_TAG}`;
    } catch {
      // Image might not exist
    }
  });

  describe('Pre-init hooks (/docker-entrypoint-init.d/)', () => {
    it('should execute init hooks before Shopware initialization', async () => {
      const docker = getDocker();
      const initHooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/init');

      const container = await docker.createContainer({
        Image: TEST_IMAGE_TAG,
        Env: [
          `DATABASE_HOST=${TEST_DB_CONTAINER}`,
          'DATABASE_PASSWORD=test123',
          'DATABASE_NAME=shopware_hooks_init',
        ],
        HostConfig: {
          NetworkMode: TEST_NETWORK,
          Binds: [`${initHooksPath}:/docker-entrypoint-init.d:ro`],
        },
      });

      try {
        await container.start();

        // Wait for pre-init hooks to complete
        await waitForLog(container, '[Swocker] ✓ 10-simple-init.sh completed', 60000);

        const logs = await container.logs({ stdout: true, stderr: true });
        const logStr = logs.toString();

        expect(logStr).toContain('[Swocker] Executing pre-initialization scripts');
        expect(logStr).toContain('Running 10-simple-init.sh');
        expect(logStr).toContain('[Test Hook] Init hook executed');

        const exec = await container.exec({
          Cmd: ['cat', '/tmp/init-hook-status'],
          AttachStdout: true,
        });
        const stream = await exec.start({ hijack: true });
        let output = '';
        stream.on('data', (chunk: Buffer) => {
          output += chunk.slice(8).toString();
        });
        await new Promise((resolve) => stream.on('end', resolve));

        expect(output).toContain('SUCCESS');
      } finally {
        await container.stop({ t: 10 });
        await container.remove();
      }
    }, 60000);

    it('should NOT execute init hooks if directory not mounted', async () => {
      const docker = getDocker();

      const container = await docker.createContainer({
        Image: TEST_IMAGE_TAG,
        Env: [
          `DATABASE_HOST=${TEST_DB_CONTAINER}`,
          'DATABASE_PASSWORD=test123',
          'DATABASE_NAME=shopware_no_hooks',
        ],
        HostConfig: {
          NetworkMode: TEST_NETWORK,
        },
      });

      try {
        await container.start();

        // Wait for container to start normally (no hooks to execute)
        await waitForLog(container, 'Container ready', 120000);

        const logs = await container.logs({ stdout: true, stderr: true });
        const logStr = logs.toString();

        expect(logStr).not.toContain('Executing pre-initialization scripts');
      } finally {
        await container.stop({ t: 10 });
        await container.remove();
      }
    }, 60000);
  });

  describe('Shopware hooks (/docker-entrypoint-shopware.d/)', () => {
    it('should execute Shopware hooks after Shopware initialization', async () => {
      const docker = getDocker();
      const shopwareHooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/shopware');

      const container = await docker.createContainer({
        Image: TEST_IMAGE_TAG,
        Env: [
          `DATABASE_HOST=${TEST_DB_CONTAINER}`,
          'DATABASE_PASSWORD=test123',
          'DATABASE_NAME=shopware_hooks_shopware',
        ],
        HostConfig: {
          NetworkMode: TEST_NETWORK,
          Binds: [`${shopwareHooksPath}:/docker-entrypoint-shopware.d:ro`],
        },
      });

      try {
        await container.start();

        // Wait for Shopware hooks to complete
        await waitForLog(container, '[Swocker] ✓ 10-touch-file.sh completed', 180000);

        const logs = await container.logs({ stdout: true, stderr: true });
        const logStr = logs.toString();

        expect(logStr).toContain('[Swocker] Executing Shopware initialization scripts');
        expect(logStr).toContain('Running 10-touch-file.sh');

        const exec = await container.exec({
          Cmd: ['cat', '/var/www/html/hook-marker.txt'],
          AttachStdout: true,
        });
        const stream = await exec.start({ hijack: true });
        let output = '';
        stream.on('data', (chunk: Buffer) => {
          output += chunk.slice(8).toString();
        });
        await new Promise((resolve) => stream.on('end', resolve));

        expect(output).toContain('SHOPWARE_HOOK_EXECUTED');
      } finally {
        await container.stop({ t: 10 });
        await container.remove();
      }
    }, 120000);

    it('should run Shopware hooks as www-data user', async () => {
      const docker = getDocker();
      const shopwareHooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/shopware');

      const container = await docker.createContainer({
        Image: TEST_IMAGE_TAG,
        Env: [
          `DATABASE_HOST=${TEST_DB_CONTAINER}`,
          'DATABASE_PASSWORD=test123',
          'DATABASE_NAME=shopware_hooks_user',
        ],
        HostConfig: {
          NetworkMode: TEST_NETWORK,
          Binds: [`${shopwareHooksPath}:/docker-entrypoint-shopware.d:ro`],
        },
      });

      try {
        await container.start();

        // Wait for Shopware hooks to complete
        await waitForLog(container, '[Swocker] ✓ 10-touch-file.sh completed', 180000);

        const exec = await container.exec({
          Cmd: ['stat', '-c', '%U:%G', '/var/www/html/hook-marker.txt'],
          AttachStdout: true,
        });
        const stream = await exec.start({ hijack: true });
        let output = '';
        stream.on('data', (chunk: Buffer) => {
          output += chunk.slice(8).toString();
        });
        await new Promise((resolve) => stream.on('end', resolve));

        expect(output).toContain('www-data:www-data');
      } finally {
        await container.stop({ t: 10 });
        await container.remove();
      }
    }, 120000);
  });

  describe('Hook execution order', () => {
    it('should execute hooks in alphabetical order', async () => {
      const docker = getDocker();
      const orderingHooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/ordering');

      const container = await docker.createContainer({
        Image: TEST_IMAGE_TAG,
        Env: [
          `DATABASE_HOST=${TEST_DB_CONTAINER}`,
          'DATABASE_PASSWORD=test123',
          'DATABASE_NAME=shopware_hooks_order',
        ],
        HostConfig: {
          NetworkMode: TEST_NETWORK,
          Binds: [`${orderingHooksPath}:/docker-entrypoint-shopware.d:ro`],
        },
      });

      try {
        await container.start();

        // Wait for all ordering hooks to complete
        await waitForLog(container, '[Swocker] ✓ 03-third.sh completed', 180000);

        const logs = await container.logs({ stdout: true, stderr: true });
        const logStr = logs.toString();
        const firstIndex = logStr.indexOf('01-first.sh');
        const secondIndex = logStr.indexOf('02-second.sh');
        const thirdIndex = logStr.indexOf('03-third.sh');

        expect(firstIndex).toBeLessThan(secondIndex);
        expect(secondIndex).toBeLessThan(thirdIndex);

        const checkFile = async (file: string): Promise<boolean> => {
          const exec = await container.exec({
            Cmd: ['test', '-f', file],
            AttachStdout: true,
          });
          const stream = await exec.start({ hijack: true });
          await new Promise((resolve) => stream.on('end', resolve));
          const { ExitCode } = await exec.inspect();
          return ExitCode === 0;
        };

        expect(await checkFile('/tmp/order-1')).toBe(true);
        expect(await checkFile('/tmp/order-2')).toBe(true);
        expect(await checkFile('/tmp/order-3')).toBe(true);
      } finally {
        await container.stop({ t: 10 });
        await container.remove();
      }
    }, 120000);
  });

  describe('Hook error handling', () => {
    it('should fail container startup if hook fails', async () => {
      const docker = getDocker();
      const failingHooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/failing');

      const container = await docker.createContainer({
        Image: TEST_IMAGE_TAG,
        Env: [
          `DATABASE_HOST=${TEST_DB_CONTAINER}`,
          'DATABASE_PASSWORD=test123',
          'DATABASE_NAME=shopware_hooks_fail',
        ],
        HostConfig: {
          NetworkMode: TEST_NETWORK,
          Binds: [`${failingHooksPath}:/docker-entrypoint-shopware.d:ro`],
        },
      });

      try {
        await container.start();

        // Wait for container to fail (poll for container to stop)
        let attempts = 0;
        while (attempts < 30) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const info = await container.inspect();
          if (!info.State.Running) break;
          attempts++;
        }

        const info = await container.inspect();
        expect(info.State.Running).toBe(false);
        expect(info.State.ExitCode).not.toBe(0);

        const logs = await container.logs({ stdout: true, stderr: true });
        const logStr = logs.toString();

        expect(logStr).toContain('99-intentional-failure.sh');
        expect(logStr).toMatch(/failed|ERROR/);
      } finally {
        await container.remove();
      }
    }, 60000);
  });

  describe('Hook environment', () => {
    it('should have access to database environment variables', async () => {
      const docker = getDocker();
      const shopwareHooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/shopware');

      const container = await docker.createContainer({
        Image: TEST_IMAGE_TAG,
        Env: [
          `DATABASE_HOST=${TEST_DB_CONTAINER}`,
          'DATABASE_PASSWORD=test123',
          'DATABASE_NAME=shopware_hooks_db',
        ],
        HostConfig: {
          NetworkMode: TEST_NETWORK,
          Binds: [`${shopwareHooksPath}:/docker-entrypoint-shopware.d:ro`],
        },
      });

      try {
        await container.start();

        // Wait for Shopware hooks to complete (database write hook is 30-database-write.sh)
        await waitForLog(container, '[Swocker] ✓ 30-database-write.sh completed', 180000);

        const exec = await container.exec({
          Cmd: [
            'mysql',
            `-h${TEST_DB_CONTAINER}`,
            '-uroot',
            '-ptest123',
            'shopware_hooks_db',
            '-sN',
            '-e',
            'SELECT message FROM hook_test WHERE id=1',
          ],
          AttachStdout: true,
        });
        const stream = await exec.start({ hijack: true });
        let output = '';
        stream.on('data', (chunk: Buffer) => {
          output += chunk.slice(8).toString();
        });
        await new Promise((resolve) => stream.on('end', resolve));

        expect(output).toContain('Hook executed successfully');
      } finally {
        await container.stop({ t: 10 });
        await container.remove();
      }
    }, 120000);

    it('should have access to custom environment variables', async () => {
      const docker = getDocker();
      const customEnvHooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/custom-env');

      const container = await docker.createContainer({
        Image: TEST_IMAGE_TAG,
        Env: [
          `DATABASE_HOST=${TEST_DB_CONTAINER}`,
          'DATABASE_PASSWORD=test123',
          'DATABASE_NAME=shopware_hooks_custom_env',
          'TEST_CUSTOM_VAR=my-secret-value-12345',
        ],
        HostConfig: {
          NetworkMode: TEST_NETWORK,
          Binds: [`${customEnvHooksPath}:/docker-entrypoint-shopware.d:ro`],
        },
      });

      try {
        await container.start();

        // Wait for custom env hook to complete
        await waitForLog(container, '[Swocker] ✓ 10-test-custom-env.sh completed', 180000);

        const logs = await container.logs({ stdout: true, stderr: true });
        const logStr = logs.toString();

        // Verify hook ran and accessed the custom variable
        expect(logStr).toContain('[Test Hook] Checking custom environment variable');
        expect(logStr).toContain('Custom variable value: my-secret-value-12345');
        expect(logStr).toContain('[Test Hook] Custom environment variable test passed');

        // Verify the file was created with the correct content
        const exec = await container.exec({
          Cmd: ['cat', '/var/www/html/custom-env-test.txt'],
          AttachStdout: true,
        });
        const stream = await exec.start({ hijack: true });
        let output = '';
        stream.on('data', (chunk: Buffer) => {
          output += chunk.slice(8).toString();
        });
        await new Promise((resolve) => stream.on('end', resolve));

        expect(output.trim()).toBe('my-secret-value-12345');
      } finally {
        await container.stop({ t: 10 });
        await container.remove();
      }
    }, 120000);
  });
});
