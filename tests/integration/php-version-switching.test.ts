import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { $ } from 'zx';
import {
  createShopwareContainer,
  cleanup,
  execInContainer,
  waitForLog,
} from '../helpers/docker.js';

$.verbose = false;

const TEST_IMAGE_TAG = 'swocker:test-multiversion';
const TEST_NETWORK = 'swocker-test-php-switching';
const TEST_DB_CONTAINER = 'swocker-test-mysql-phpswitch';

describe('PHP Version Switching', () => {
  beforeAll(async () => {
    console.log('Building multi-version test image...');

    // Clean up any leftover containers/networks from previous runs
    const { cleanupByName } = await import('../helpers/docker.js');
    await cleanupByName([TEST_DB_CONTAINER], [TEST_NETWORK]);

    // Build the test image with default PHP 8.3
    await $`docker build \
      -f docker/Dockerfile \
      --build-arg SHOPWARE_VERSION=6.7.4.0 \
      --build-arg DEFAULT_PHP_VERSION=8.3 \
      --target dev \
      -t ${TEST_IMAGE_TAG} .`;

    // Create test network
    try {
      await $`docker network create ${TEST_NETWORK}`;
    } catch {
      // Network might already exist
    }

    // Start MySQL container
    await $`docker run -d \
      --name ${TEST_DB_CONTAINER} \
      --network ${TEST_NETWORK} \
      --tmpfs /var/lib/mysql:rw,noexec,nosuid,size=1g \
      -e MYSQL_ROOT_PASSWORD=test123 \
      -e MYSQL_DATABASE=shopware \
      mysql:8.0`;

    // Wait for MySQL
    console.log('Waiting for MySQL...');
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }, 180000); // 3 minute timeout

  afterAll(async () => {
    try {
      await $`docker rm -f ${TEST_DB_CONTAINER}`;
    } catch {
      // Container doesn't exist - that's fine
    }

    try {
      await $`docker network rm ${TEST_NETWORK}`;
    } catch {
      // Network doesn't exist - that's fine
    }
  });

  it('starts with PHP 8.2 when specified', async () => {
    const container = await createShopwareContainer(TEST_IMAGE_TAG, TEST_DB_CONTAINER, {
      phpVersion: '8.2',
      network: TEST_NETWORK,
      name: 'test-php82',
    });

    try {
      await waitForLog(container, /Container ready|PHP 8\.2/i, 90000);

      const phpVersion = await execInContainer(container, ['php', '-v']);
      expect(phpVersion).toContain('PHP 8.2');

      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();
      expect(logStr).toMatch(/Using PHP 8\.2|Configuring PHP 8\.2/i);
    } finally {
      await cleanup([container]);
    }
  }, 120000);

  it('starts with PHP 8.3 when specified', async () => {
    const container = await createShopwareContainer(TEST_IMAGE_TAG, TEST_DB_CONTAINER, {
      phpVersion: '8.3',
      network: TEST_NETWORK,
      name: 'test-php83',
    });

    try {
      await waitForLog(container, /Container ready|PHP 8\.3/i, 90000);

      const phpVersion = await execInContainer(container, ['php', '-v']);
      expect(phpVersion).toContain('PHP 8.3');

      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();
      expect(logStr).toMatch(/Using PHP 8\.3|Configuring PHP 8\.3/i);
    } finally {
      await cleanup([container]);
    }
  }, 120000);

  it('uses default PHP 8.3 when PHP_VERSION not specified', async () => {
    const container = await createShopwareContainer(TEST_IMAGE_TAG, TEST_DB_CONTAINER, {
      network: TEST_NETWORK,
      name: 'test-php-default',
    });

    try {
      await waitForLog(container, /Container ready|PHP 8\.3/i, 90000);

      const phpVersion = await execInContainer(container, ['php', '-v']);
      expect(phpVersion).toContain('PHP 8.3');
    } finally {
      await cleanup([container]);
    }
  }, 120000);

  it('rejects unsupported PHP version', async () => {
    const container = await createShopwareContainer(TEST_IMAGE_TAG, TEST_DB_CONTAINER, {
      phpVersion: '7.4',
      network: TEST_NETWORK,
      name: 'test-php-invalid',
    });

    try {
      // Wait a bit for the container to process and exit
      await new Promise((resolve) => setTimeout(resolve, 10000));

      const info = await container.inspect();
      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();

      // Container should have exited with error
      expect(info.State.Running).toBe(false);
      expect(logStr).toMatch(/ERROR.*PHP 7\.4.*not supported/i);
      expect(logStr).toMatch(/Supported PHP versions:/i);
    } finally {
      await cleanup([container]);
    }
  }, 30000);

  it('both PHP versions have required extensions', async () => {
    const container = await createShopwareContainer(TEST_IMAGE_TAG, TEST_DB_CONTAINER, {
      phpVersion: '8.2',
      network: TEST_NETWORK,
      name: 'test-php-extensions',
    });

    try {
      await waitForLog(container, /Container ready/i, 90000);

      // Check PHP 8.2 extensions
      const php82Modules = await execInContainer(container, ['php8.2', '-m']);
      expect(php82Modules).toContain('pdo_mysql');
      expect(php82Modules).toContain('gd');
      expect(php82Modules).toContain('intl');
      expect(php82Modules).toContain('Zend OPcache');
      expect(php82Modules).toContain('zip');

      // Check PHP 8.3 extensions
      const php83Modules = await execInContainer(container, ['php8.3', '-m']);
      expect(php83Modules).toContain('pdo_mysql');
      expect(php83Modules).toContain('gd');
      expect(php83Modules).toContain('intl');
      expect(php83Modules).toContain('Zend OPcache');
      expect(php83Modules).toContain('zip');
    } finally {
      await cleanup([container]);
    }
  }, 120000);

  it('PHP version persists after container restart', async () => {
    const container = await createShopwareContainer(TEST_IMAGE_TAG, TEST_DB_CONTAINER, {
      phpVersion: '8.2',
      network: TEST_NETWORK,
      name: 'test-php-restart',
    });

    try {
      await waitForLog(container, /Container ready/i, 90000);

      let phpVersion = await execInContainer(container, ['php', '-v']);
      expect(phpVersion).toContain('PHP 8.2');

      // Restart container
      await container.restart();
      await waitForLog(container, /Container ready/i, 90000);

      phpVersion = await execInContainer(container, ['php', '-v']);
      expect(phpVersion).toContain('PHP 8.2');
    } finally {
      await cleanup([container]);
    }
  }, 180000);
});
