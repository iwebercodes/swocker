import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { $ } from 'zx';
import { getDocker } from '../helpers/docker.js';

$.verbose = false;

const TEST_IMAGE_TAG = 'swocker:test-db';
const TEST_NETWORK = 'swocker-test-network';
const TEST_DB_CONTAINER = 'swocker-test-mysql';
const TEST_APP_CONTAINER = 'swocker-test-app';

describe('Database Integration', () => {
  beforeAll(async () => {
    console.log('Setting up database integration test environment...');

    // Clean up any leftover containers/networks from previous runs
    const { cleanupByName } = await import('../helpers/docker.js');
    await cleanupByName([TEST_DB_CONTAINER, TEST_APP_CONTAINER], [TEST_NETWORK]);

    // Build the test image with dev target (includes Apache and entrypoint)
    await $`docker build -f docker/Dockerfile --target dev -t ${TEST_IMAGE_TAG} .`;

    // Create a test network
    try {
      await $`docker network create ${TEST_NETWORK}`;
    } catch {
      // Network might already exist
    }

    // Start MySQL container with tmpfs for faster performance
    await $`docker run -d \
      --name ${TEST_DB_CONTAINER} \
      --network ${TEST_NETWORK} \
      --tmpfs /var/lib/mysql:rw,noexec,nosuid,size=1g \
      -e MYSQL_ROOT_PASSWORD=test123 \
      -e MYSQL_DATABASE=shopware \
      mysql:8.0`;

    // Wait for MySQL to be fully initialized (can take 20-30 seconds)
    console.log('Waiting for MySQL to initialize...');
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }, 120000); // 2 minute timeout for setup

  afterAll(async () => {
    // Cleanup
    try {
      await $`docker rm -f ${TEST_APP_CONTAINER}`;
    } catch {
      // Container might not exist
    }

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

  it('connects to database successfully', async () => {
    const docker = getDocker();

    const container = await docker.createContainer({
      name: TEST_APP_CONTAINER,
      Image: TEST_IMAGE_TAG,
      Env: [
        'SHOPWARE_VERSION=6.7.4.0',
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PORT=3306',
        'DATABASE_USER=root',
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware',
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
      },
    });

    try {
      await container.start();

      // Wait for Shopware installation to complete (migrations take time)
      // Poll logs until we see "Container ready" or timeout
      let logStr = '';
      const maxAttempts = 30;
      const pollInterval = 2000;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        const logs = await container.logs({ stdout: true, stderr: true });
        logStr = logs.toString();

        if (logStr.includes('Container ready')) {
          break;
        }
      }

      const info = await container.inspect();
      expect(info.State.Running).toBe(true);

      // Check logs for database connection success
      expect(logStr).toContain('Waiting for database');
      expect(logStr).toContain('Database is ready');
      expect(logStr).toContain('Container ready');
    } finally {
      await container.stop({ t: 5 });
      await container.remove();
    }
  }, 90000); // 90 second timeout

  it('creates database if it does not exist', async () => {
    const docker = getDocker();
    const testDbName = 'shopware_test_create';

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        'SHOPWARE_VERSION=6.7.4.0',
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PORT=3306',
        'DATABASE_USER=root',
        'DATABASE_PASSWORD=test123',
        `DATABASE_NAME=${testDbName}`,
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
      },
    });

    try {
      await container.start();

      // Wait for initialization
      await new Promise((resolve) => setTimeout(resolve, 15000));

      // Check logs for database creation
      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();

      expect(logStr).toContain(`Creating database '${testDbName}'`);
      expect(logStr).toContain('Database is ready');
    } finally {
      await container.stop({ t: 5 });
      await container.remove();
    }
  }, 60000); // 1 minute timeout

  it('works without database when DATABASE_HOST is not set', async () => {
    const docker = getDocker();

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: ['SHOPWARE_VERSION=6.7.4.0'],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
      },
    });

    try {
      await container.start();

      // Wait for container to initialize (should be quick without database)
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const info = await container.inspect();
      expect(info.State.Running).toBe(true);

      // Check logs - should NOT contain database messages
      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();

      expect(logStr).not.toContain('Waiting for database');
      expect(logStr).toContain('Container ready');
    } finally {
      await container.stop({ t: 5 });
      await container.remove();
    }
  }, 20000); // 20 second timeout
});
