import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { $ } from 'zx';
import { getDocker } from '../helpers/docker.js';

$.verbose = false;

const TEST_IMAGE_TAG = 'swocker:test-config';
const TEST_NETWORK = 'swocker-test-config-network';
const TEST_DB_CONTAINER = 'swocker-test-config-mysql';

describe('Environment Configuration', () => {
  beforeAll(async () => {
    console.log('Setting up configuration test environment...');

    // Clean up any leftover containers/networks from previous runs
    const { cleanupByName } = await import('../helpers/docker.js');
    await cleanupByName([TEST_DB_CONTAINER], [TEST_NETWORK]);

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

    // Wait for MySQL to be fully initialized
    console.log('Waiting for MySQL to initialize...');
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }, 120000);

  afterAll(async () => {
    // Cleanup
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

  it('PHP memory limit can be configured', async () => {
    const docker = getDocker();

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        'SHOPWARE_VERSION=6.7.4.0',
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PORT=3306',
        'DATABASE_USER=root',
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware',
        'PHP_MEMORY_LIMIT=1024M',
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
      },
    });

    try {
      await container.start();

      // Wait for container to initialize
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Check PHP memory limit
      const exec = await container.exec({
        Cmd: ['php', '-r', 'echo ini_get("memory_limit");'],
        AttachStdout: true,
        AttachStderr: true,
      });
      const stream = await exec.start({ hijack: true, stdin: false });

      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf-8');
      });

      await new Promise((resolve) => {
        stream.on('end', resolve);
      });

      // Clean ANSI codes and Docker stream prefix
      // eslint-disable-next-line no-control-regex
      output = output.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();

      expect(output).toContain('1024M');
    } finally {
      await container.stop({ t: 5 });
      await container.remove();
    }
  }, 60000);

  it('PHP upload max filesize can be configured', async () => {
    const docker = getDocker();

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        'SHOPWARE_VERSION=6.7.4.0',
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PORT=3306',
        'DATABASE_USER=root',
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware_upload',
        'PHP_UPLOAD_MAX_FILESIZE=50M',
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
      },
    });

    try {
      await container.start();

      // Wait for container to initialize
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Check logs to verify setting was applied
      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();

      expect(logStr).toContain('Setting PHP upload_max_filesize to 50M');
    } finally {
      await container.stop({ t: 5 });
      await container.remove();
    }
  }, 60000);

  it('Shopware environment is configured correctly', async () => {
    const docker = getDocker();

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        'SHOPWARE_VERSION=6.7.4.0',
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PORT=3306',
        'DATABASE_USER=root',
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware_env',
        'APP_ENV=prod',
        'APP_URL=http://example.com',
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
      },
    });

    try {
      await container.start();

      // Wait for container to initialize
      await new Promise((resolve) => setTimeout(resolve, 10000));

      // Check logs
      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();

      expect(logStr).toContain('Configuring Shopware environment');
    } finally {
      await container.stop({ t: 5 });
      await container.remove();
    }
  }, 60000);
});
