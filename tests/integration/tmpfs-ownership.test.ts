import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { $ } from 'zx';
import { getDocker, cleanupByName, execInContainer } from '../helpers/docker.js';
import type Docker from 'dockerode';

$.verbose = false;

const TEST_IMAGE_TAG = 'swocker:test-dev';
const TEST_NETWORK = 'swocker-test-tmpfs-network';
const TEST_DB_CONTAINER = 'swocker-test-tmpfs-mysql';

describe('tmpfs Ownership for theme compilation', () => {
  beforeAll(async () => {
    console.log('Setting up tmpfs ownership test environment...');

    // Clean up any leftover containers/networks from previous runs
    await cleanupByName([TEST_DB_CONTAINER], [TEST_NETWORK]);

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
  }, 60000);

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
  });

  it('should allow theme compilation without tmpfs mount', async () => {
    const docker = getDocker();
    let container: Docker.Container | null = null;

    try {
      // Create container WITHOUT tmpfs mount
      container = await docker.createContainer({
        Image: TEST_IMAGE_TAG,
        name: 'swocker-test-tmpfs-no-mount',
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

      await container.start();

      // Wait for Shopware installation to complete
      console.log('Waiting for Shopware installation...');
      await new Promise((resolve) => setTimeout(resolve, 60000));

      // Check ownership of /var/www/html/var
      const ownershipOutput = await execInContainer(container, [
        'stat',
        '-c',
        '%U:%G',
        '/var/www/html/var',
      ]);
      console.log('Directory ownership (no tmpfs):', ownershipOutput);

      // Should be www-data:www-data
      expect(ownershipOutput).toContain('www-data');

      // Try to compile themes as www-data user
      const compileOutput = await execInContainer(container, [
        'bash',
        '-c',
        'cd /var/www/html && su -s /bin/bash www-data -c "bin/console theme:compile --active-only 2>&1"',
      ]);

      console.log('Theme compile output (no tmpfs):', compileOutput);

      // Should not contain permission errors
      expect(compileOutput).not.toContain('Permission denied');
      expect(compileOutput).not.toContain('Failed to open stream');
    } finally {
      if (container) {
        try {
          await container.stop({ t: 5 });
          await container.remove({ force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }, 180000);

  it('should allow theme compilation with tmpfs mount', async () => {
    const docker = getDocker();
    let container: Docker.Container | null = null;

    try {
      // Create container WITH tmpfs mount (reproduces the bug scenario)
      container = await docker.createContainer({
        Image: TEST_IMAGE_TAG,
        name: 'swocker-test-tmpfs-with-mount',
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
          Tmpfs: {
            '/var/www/html/var': 'size=1G,mode=1777',
          },
        },
      });

      await container.start();

      // Wait for Shopware installation to complete
      console.log('Waiting for Shopware installation...');
      await new Promise((resolve) => setTimeout(resolve, 60000));

      // Check ownership of /var/www/html/var
      const ownershipOutput = await execInContainer(container, [
        'stat',
        '-c',
        '%U:%G',
        '/var/www/html/var',
      ]);
      console.log('Directory ownership (with tmpfs):', ownershipOutput);

      // After the fix, should be www-data:www-data
      // Before the fix, this would be root:root
      expect(ownershipOutput).toContain('www-data');

      // Try to compile themes as www-data user
      const compileOutput = await execInContainer(container, [
        'bash',
        '-c',
        'cd /var/www/html && su -s /bin/bash www-data -c "bin/console theme:compile --active-only 2>&1"',
      ]);

      console.log('Theme compile output (with tmpfs):', compileOutput);

      // Should not contain permission errors
      expect(compileOutput).not.toContain('Permission denied');
      expect(compileOutput).not.toContain('Failed to open stream');
      expect(compileOutput).not.toContain('UnableToWriteFile');
    } finally {
      if (container) {
        try {
          await container.stop({ t: 5 });
          await container.remove({ force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }, 180000);
});
