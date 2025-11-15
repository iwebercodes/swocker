import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Docker from 'dockerode';
import {
  getDocker,
  createContainer,
  cleanup,
  execInContainer,
  waitForHealthy,
  waitForLog,
} from '../helpers/docker.js';

/**
 * Milestone 5.1: Complete E2E Workflow Tests
 * Tests the entire lifecycle from container start to full Shopware installation
 */
describe('Complete E2E Workflow', () => {
  const docker = getDocker();
  let mysqlContainer: Docker.Container | null = null;

  beforeAll(async () => {
    // Create MySQL with tmpfs
    const mysql = await docker.createContainer({
      Image: 'mysql:8.4',
      Env: ['MYSQL_ROOT_PASSWORD=root', 'MYSQL_DATABASE=shopware', 'MYSQL_ROOT_HOST=%'],
      ExposedPorts: { '3306/tcp': {} },
      HostConfig: {
        PortBindings: { '3306/tcp': [{ HostPort: '3306' }] },
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

  describe('Complete Installation Flow', () => {
    it('performs full Shopware installation and setup', async () => {
      if (!mysqlContainer) {
        throw new Error('MySQL container not available');
      }

      // Create database first
      await execInContainer(mysqlContainer, [
        'mysql',
        '-uroot',
        '-proot',
        '-e',
        'CREATE DATABASE IF NOT EXISTS shopware;',
      ]);

      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: [
          `DATABASE_HOST=host.docker.internal`,
          `DATABASE_PORT=3306`,
          'DATABASE_USER=root',
          'DATABASE_PASSWORD=root',
          'DATABASE_NAME=shopware',
          'APP_ENV=dev',
          'APP_SECRET=test-secret-key',
          'SHOPWARE_ADMIN_USER=testadmin',
          'SHOPWARE_ADMIN_PASSWORD=testpass123',
          'SHOPWARE_ADMIN_EMAIL=test@example.com',
        ],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '80' }] },
          ExtraHosts: ['host.docker.internal:host-gateway'],
        },
      });

      try {
        // Wait for container to be healthy
        await waitForHealthy(container, 120000);

        // Wait for Shopware installation to fully complete (install.lock file)
        // This ensures migrations are done, not just healthcheck passing
        await waitForLog(container, 'Container ready', 180000);

        // Test 1: Verify storefront is accessible
        const storefrontResponse = await fetch('http://localhost', {
          redirect: 'follow',
        });
        expect(storefrontResponse.status).toBeLessThan(400);

        // Test 2: Verify admin is accessible
        const adminResponse = await fetch('http://localhost/admin', {
          redirect: 'follow',
        });
        expect(adminResponse.status).toBeLessThan(400);

        // Test 3: Verify database tables were created
        const tables = await execInContainer(container, [
          'mysql',
          '-h',
          'host.docker.internal',
          `-P3306`,
          '-uroot',
          '-proot',
          'shopware',
          '-e',
          'SHOW TABLES;',
        ]);
        expect(tables).toContain('product');
        expect(tables).toContain('customer');

        // Test 4: Verify admin user exists
        const adminUser = await execInContainer(container, [
          'mysql',
          '-h',
          'host.docker.internal',
          `-P3306`,
          '-uroot',
          '-proot',
          'shopware',
          '-e',
          "SELECT username FROM user WHERE username='testadmin';",
        ]);
        expect(adminUser).toContain('testadmin');

        // Test 5: Verify Shopware console works
        const consoleOutput = await execInContainer(container, ['bin/console', 'list']);
        expect(consoleOutput).toContain('Shopware');

        // Test 6: Verify plugins can be listed
        const pluginList = await execInContainer(container, ['bin/console', 'plugin:list']);
        expect(pluginList).toBeDefined();

        // Test 7: Verify cache can be cleared
        const cacheOutput = await execInContainer(container, ['bin/console', 'cache:clear']);
        expect(cacheOutput).toMatch(/cache.*clear|successfully/i);
      } finally {
        await cleanup([container]);
      }
    }, 240000);
  });

  describe('Plugin Installation Workflow', () => {
    it('auto-installs single plugin on startup', async () => {
      if (!mysqlContainer) {
        throw new Error('MySQL container not available');
      }

      // Create database first
      await execInContainer(mysqlContainer, [
        'mysql',
        '-uroot',
        '-proot',
        '-e',
        'CREATE DATABASE IF NOT EXISTS shopware_plugin_test;',
      ]);

      const pluginPath = `${process.cwd()}/tests/fixtures/test-plugins/SwockerTestPluginOne`;

      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: [
          `DATABASE_HOST=host.docker.internal`,
          `DATABASE_PORT=3306`,
          'DATABASE_USER=root',
          'DATABASE_PASSWORD=root',
          'DATABASE_NAME=shopware_plugin_test',
          'AUTO_INSTALL_PLUGINS=SwockerTestPluginOne',
          'APP_ENV=dev',
          'APP_SECRET=test-secret',
        ],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '80' }] },
          Binds: [`${pluginPath}:/var/www/html/custom/plugins/SwockerTestPluginOne`],
          ExtraHosts: ['host.docker.internal:host-gateway'],
        },
      });

      try {
        await waitForHealthy(container, 180000);

        // Verify plugin was auto-installed
        const logs = await container.logs({ stdout: true, stderr: true });
        const logStr = logs.toString();
        expect(logStr).toMatch(/SwockerTestPluginOne|Installing and activating plugin/i);

        // Verify plugin appears in list and is installed
        const pluginList = await execInContainer(container, ['bin/console', 'plugin:list']);
        expect(pluginList).toContain('SwockerTestPluginOne');
        expect(pluginList).toMatch(/SwockerTestPluginOne.*Yes.*Yes/); // Installed and Active
      } finally {
        await cleanup([container]);
      }
    }, 300000);

    it('auto-installs multiple plugins on startup', async () => {
      if (!mysqlContainer) {
        throw new Error('MySQL container not available');
      }

      // Create database first
      await execInContainer(mysqlContainer, [
        'mysql',
        '-uroot',
        '-proot',
        '-e',
        'CREATE DATABASE IF NOT EXISTS shopware_plugin_multi_test;',
      ]);

      const pluginOnePath = `${process.cwd()}/tests/fixtures/test-plugins/SwockerTestPluginOne`;
      const pluginTwoPath = `${process.cwd()}/tests/fixtures/test-plugins/SwockerTestPluginTwo`;

      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: [
          `DATABASE_HOST=host.docker.internal`,
          `DATABASE_PORT=3306`,
          'DATABASE_USER=root',
          'DATABASE_PASSWORD=root',
          'DATABASE_NAME=shopware_plugin_multi_test',
          'AUTO_INSTALL_PLUGINS=SwockerTestPluginOne,SwockerTestPluginTwo',
          'APP_ENV=dev',
          'APP_SECRET=test-secret',
        ],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '80' }] },
          Binds: [
            `${pluginOnePath}:/var/www/html/custom/plugins/SwockerTestPluginOne`,
            `${pluginTwoPath}:/var/www/html/custom/plugins/SwockerTestPluginTwo`,
          ],
          ExtraHosts: ['host.docker.internal:host-gateway'],
        },
      });

      try {
        await waitForHealthy(container, 180000);

        // Verify both plugins were auto-installed
        const logs = await container.logs({ stdout: true, stderr: true });
        const logStr = logs.toString();
        expect(logStr).toMatch(/SwockerTestPluginOne.*installed/i);
        expect(logStr).toMatch(/SwockerTestPluginTwo.*installed/i);

        // Verify both plugins appear in list and are installed
        const pluginList = await execInContainer(container, ['bin/console', 'plugin:list']);
        expect(pluginList).toContain('SwockerTestPluginOne');
        expect(pluginList).toContain('SwockerTestPluginTwo');
        expect(pluginList).toMatch(/SwockerTestPluginOne.*Yes.*Yes/); // Installed and Active
        expect(pluginList).toMatch(/SwockerTestPluginTwo.*Yes.*Yes/); // Installed and Active
      } finally {
        await cleanup([container]);
      }
    }, 300000);
  });

  describe('Container Restart Persistence', () => {
    it('persists data across container restarts', async () => {
      if (!mysqlContainer) {
        throw new Error('MySQL container not available');
      }

      // Create database
      await execInContainer(mysqlContainer, [
        'mysql',
        '-uroot',
        '-proot',
        '-e',
        'CREATE DATABASE IF NOT EXISTS shopware_persist_test;',
      ]);

      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: [
          `DATABASE_HOST=host.docker.internal`,
          `DATABASE_PORT=3306`,
          'DATABASE_USER=root',
          'DATABASE_PASSWORD=root',
          'DATABASE_NAME=shopware_persist_test',
          'APP_ENV=dev',
          'APP_SECRET=test-secret',
          'APP_URL=http://localhost',
          'SHOPWARE_ADMIN_USER=testadmin',
          'SHOPWARE_ADMIN_PASSWORD=testpass123',
          'SHOPWARE_ADMIN_EMAIL=test@example.com',
        ],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '80' }] },
          ExtraHosts: ['host.docker.internal:host-gateway'],
        },
      });

      try {
        // First start
        await waitForHealthy(container, 300000);

        // Verify installation (should work with default http://localhost)
        console.log('[Test] Fetching http://localhost after initial startup...');
        const response1 = await fetch('http://localhost');
        console.log(`[Test] Initial fetch response status: ${response1.status}`);
        if (response1.status >= 400) {
          const body = await response1.text();
          console.log(
            `[Test] Error response body (first ${Math.min(500, body.length)} chars):`,
            body.substring(0, 500)
          );
          const containerInfo = await container.inspect();
          console.log(
            `[Test] Container ID: ${containerInfo.Id.substring(0, 12)}, State: ${containerInfo.State.Status}`
          );
        }
        expect(response1.status).toBeLessThan(400);

        // Restart container
        console.log('[Test] Restarting container...');
        await container.restart();

        // Wait for it to come back up
        console.log('[Test] Waiting for container to be healthy after restart...');
        await waitForHealthy(container, 300000);

        // Verify it's still accessible and didn't reinstall
        console.log('[Test] Fetching http://localhost after restart...');
        const response2 = await fetch('http://localhost');
        console.log(`[Test] Post-restart fetch response status: ${response2.status}`);
        if (response2.status >= 400) {
          const body = await response2.text();
          console.log(
            `[Test] Error response body (first ${Math.min(500, body.length)} chars):`,
            body.substring(0, 500)
          );
          const containerInfo = await container.inspect();
          console.log(
            `[Test] Container ID: ${containerInfo.Id.substring(0, 12)}, State: ${containerInfo.State.Status}`
          );
          const logs = await container.logs({ stdout: true, stderr: true, tail: 100 });
          console.log(
            `[Test] Container logs (last 100 lines):\n`,
            logs.toString().substring(0, 2000)
          );
        }
        expect(response2.status).toBeLessThan(400);

        // Check logs - should say "already installed"
        const logs = await container.logs({ stdout: true, stderr: true });
        expect(logs.toString()).toMatch(/already installed|running migrations/i);
      } finally {
        await cleanup([container]);
      }
    }, 300000);
  });
});
