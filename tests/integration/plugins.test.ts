import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { $ } from 'zx';
import { getDocker } from '../helpers/docker.js';
import * as path from 'path';

$.verbose = false;

const TEST_IMAGE_TAG = 'swocker:test-plugins';
const TEST_NETWORK = 'swocker-test-plugins-network';
const TEST_DB_CONTAINER = 'swocker-test-plugins-mysql';

describe('Plugin Installation', () => {
  beforeAll(async () => {
    console.log('Setting up plugin test environment...');

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

  it('installs plugin from AUTO_INSTALL_PLUGINS', async () => {
    const docker = getDocker();
    const pluginPath = path.resolve(process.cwd(), 'tests/fixtures/test-plugin');

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        'SHOPWARE_VERSION=6.7.4.0',
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PORT=3306',
        'DATABASE_USER=root',
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware_plugin_test',
        'AUTO_INSTALL_PLUGINS=TestPlugin',
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
        Binds: [`${pluginPath}:/var/www/html/custom/plugins/TestPlugin:ro`],
      },
    });

    try {
      await container.start();

      // Wait for installation to complete (Shopware installation + plugin)
      console.log('Waiting for Shopware and plugin installation...');
      await new Promise((resolve) => setTimeout(resolve, 60000));

      // Check logs for plugin installation
      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();

      expect(logStr).toContain('Auto-installing plugins');
      expect(logStr).toContain('TestPlugin');
      expect(logStr).toContain('Successfully installed plugin: TestPlugin');
    } finally {
      await container.stop({ t: 10 });
      await container.remove();
    }
  }, 120000);

  it('installs multiple plugins', async () => {
    const docker = getDocker();
    const pluginPath = path.resolve(process.cwd(), 'tests/fixtures/test-plugin');

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        'SHOPWARE_VERSION=6.7.4.0',
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PORT=3306',
        'DATABASE_USER=root',
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware_multi_plugin_test',
        // Use the same plugin twice with different names (just for testing the mechanism)
        'AUTO_INSTALL_PLUGINS=TestPlugin',
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
        Binds: [`${pluginPath}:/var/www/html/custom/plugins/TestPlugin:ro`],
      },
    });

    try {
      await container.start();

      // Wait for installation to complete
      console.log('Waiting for Shopware and plugins installation...');
      await new Promise((resolve) => setTimeout(resolve, 60000));

      // Check logs
      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();

      expect(logStr).toContain('Auto-installing plugins');
      expect(logStr).toContain('Refreshing plugin list');
    } finally {
      await container.stop({ t: 10 });
      await container.remove();
    }
  }, 120000);

  it('container works without AUTO_INSTALL_PLUGINS', async () => {
    const docker = getDocker();

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        'SHOPWARE_VERSION=6.7.4.0',
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PORT=3306',
        'DATABASE_USER=root',
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware_no_plugins',
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
      },
    });

    try {
      await container.start();

      // Wait for installation
      console.log('Waiting for Shopware installation...');
      await new Promise((resolve) => setTimeout(resolve, 45000));

      const info = await container.inspect();
      expect(info.State.Running).toBe(true);

      // Check logs - should NOT contain plugin installation messages
      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();

      expect(logStr).not.toContain('Auto-installing plugins');
      expect(logStr).toContain('Container ready');
    } finally {
      await container.stop({ t: 10 });
      await container.remove();
    }
  }, 90000);
});
