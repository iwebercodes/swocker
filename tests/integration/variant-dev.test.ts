import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { $ } from 'zx';
import { getDocker } from '../helpers/docker.js';

$.verbose = false;

const TEST_IMAGE_TAG = 'swocker:test-dev';
const TEST_NETWORK = 'swocker-test-dev-network';
const TEST_DB_CONTAINER = 'swocker-test-dev-mysql';

describe('Dev Variant', () => {
  beforeAll(async () => {
    console.log('Building dev variant...');

    // Clean up any leftover containers/networks from previous runs
    const { cleanupByName } = await import('../helpers/docker.js');
    await cleanupByName([TEST_DB_CONTAINER], [TEST_NETWORK]);

    // Build the dev variant
    await $`docker build --target dev -f docker/Dockerfile -t ${TEST_IMAGE_TAG} .`;

    // Create test network
    try {
      await $`docker network create ${TEST_NETWORK}`;
    } catch {
      // Network might already exist
    }

    // Start MySQL
    await $`docker run -d \
      --name ${TEST_DB_CONTAINER} \
      --network ${TEST_NETWORK} \
      --tmpfs /var/lib/mysql:rw,noexec,nosuid,size=1g \
      -e MYSQL_ROOT_PASSWORD=test123 \
      -e MYSQL_DATABASE=shopware \
      mysql:8.0`;

    // Wait for MySQL
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }, 180000);

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

  it('builds successfully', async () => {
    const docker = getDocker();
    const images = await docker.listImages();
    expect(images.some((img) => img.RepoTags?.includes(TEST_IMAGE_TAG))).toBe(true);
  });

  it('has Xdebug installed', async () => {
    const result = await $`docker run --rm ${TEST_IMAGE_TAG} php -m`;
    expect(result.stdout).toContain('xdebug');
  });

  it('Xdebug is disabled by default', async () => {
    const docker = getDocker();

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [`DATABASE_HOST=${TEST_DB_CONTAINER}`, 'DATABASE_PASSWORD=test123'],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
      },
    });

    try {
      await container.start();
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();

      expect(logStr).toContain('Xdebug is installed but disabled');
    } finally {
      try {
        await container.stop({ t: 5 });
      } catch {
        // Container might already be stopped
      }
      await container.remove();
    }
  }, 60000);

  it('Xdebug can be enabled', async () => {
    // Test that Xdebug configuration is written when XDEBUG_ENABLED=1
    // The entrypoint.sh enables Xdebug automatically when XDEBUG_ENABLED=1
    const result =
      await $`docker run --rm -e XDEBUG_ENABLED=1 ${TEST_IMAGE_TAG} php -r "echo ini_get('xdebug.mode');"`;

    // Filter out entrypoint logs and get the last non-empty line (the actual PHP output)
    const lines = result.stdout
      .trim()
      .split('\n')
      .filter((line) => line.trim() !== '');
    const phpOutput = lines[lines.length - 1];
    expect(phpOutput).toBe('debug');
  }, 60000);

  it('has development tools installed', async () => {
    const tools = ['git', 'vim', 'nano', 'node', 'npm', 'composer'];

    for (const tool of tools) {
      const result = await $`docker run --rm ${TEST_IMAGE_TAG} which ${tool}`;
      expect(result.stdout.trim()).toBeTruthy();
    }
  });

  it('has all packages installed', async () => {
    const result =
      await $`docker run --rm --entrypoint composer ${TEST_IMAGE_TAG} show --name-only`;
    // Shopware production template doesn't have require-dev, so dev and prod have same composer packages
    // The difference is in system tools (git, node, etc) which are tested separately
    const packageCount = result.stdout.trim().split('\n').length;
    expect(packageCount).toBeGreaterThan(100);
  });

  it('variant environment variable is set to dev', async () => {
    const result = await $`docker run --rm --entrypoint printenv ${TEST_IMAGE_TAG} VARIANT`;
    expect(result.stdout.trim()).toBe('dev');
  });
});
