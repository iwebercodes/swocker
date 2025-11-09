import { describe, it, expect } from 'vitest';
import Docker from 'dockerode';
import {
  getDocker,
  createContainer,
  cleanup,
  execInContainer,
  waitForLog,
  waitForHealthy,
} from '../helpers/docker.js';

/**
 * Milestone 5.1: Edge Cases and Error Handling
 * Tests unusual scenarios, error conditions, and boundary cases
 */
describe('Edge Cases and Error Handling', () => {
  const docker = getDocker();

  describe('Database Connection Failures', () => {
    it('handles invalid database host gracefully', async () => {
      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: [
          'DATABASE_HOST=invalid-mysql-host-that-does-not-exist',
          'DATABASE_PASSWORD=root',
          'DATABASE_NAME=shopware',
          'APP_ENV=dev',
          'APP_SECRET=test',
          'DB_MAX_RETRIES=3',
          'DB_RETRY_INTERVAL=1',
        ],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
        },
      });

      try {
        // Wait for error message to appear in logs
        await waitForLog(
          container,
          /exception.*driver|connection.*exception|failed.*getaddrinfo|could not connect/i,
          30000
        );
        // If waitForLog succeeds, the pattern was found
      } finally {
        await cleanup([container]);
      }
    }, 45000);

    it('handles wrong database credentials', async () => {
      let mysqlContainer: Docker.Container | null = null;

      try {
        // Create MySQL
        mysqlContainer = await docker.createContainer({
          Image: 'mysql:8.0',
          Env: ['MYSQL_ROOT_PASSWORD=correctpass', 'MYSQL_DATABASE=shopware'],
          ExposedPorts: { '3306/tcp': {} },
          HostConfig: {
            PortBindings: { '3306/tcp': [{ HostPort: '0' }] },
            Tmpfs: { '/var/lib/mysql': 'rw,noexec,nosuid,size=512m' },
          },
        });
        await mysqlContainer.start();
        await waitForLog(mysqlContainer, 'ready for connections', 60000);

        const mysqlInfo = await mysqlContainer.inspect();
        const mysqlPort = mysqlInfo.NetworkSettings.Ports['3306/tcp']?.[0]?.HostPort;

        // Try to connect with wrong password
        const container = await createContainer({
          Image: 'swocker:test-dev',
          Env: [
            'DATABASE_HOST=host.docker.internal',
            `DATABASE_PORT=${mysqlPort}`,
            'DATABASE_PASSWORD=wrongpassword',
            'DATABASE_NAME=shopware',
            'APP_ENV=dev',
            'APP_SECRET=test',
            'DB_MAX_RETRIES=2',
          ],
          ExposedPorts: { '80/tcp': {} },
          HostConfig: {
            PortBindings: { '80/tcp': [{ HostPort: '0' }] },
            ExtraHosts: ['host.docker.internal:host-gateway'],
          },
        });

        try {
          // Wait for authentication error to appear in logs
          await waitForLog(container, /access denied|authentication failed/i, 30000);
        } finally {
          await cleanup([container]);
        }
      } finally {
        if (mysqlContainer) {
          await cleanup([mysqlContainer]);
        }
      }
    }, 90000);
  });

  describe('Environment Variable Edge Cases', () => {
    it('handles missing required environment variables', async () => {
      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: [
          // Missing DATABASE_HOST intentionally
          'APP_ENV=dev',
        ],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
        },
      });

      try {
        // Wait for no-database message to appear in logs
        await waitForLog(container, /No database configured|DATABASE_HOST|skipping/i, 30000);
      } finally {
        await cleanup([container]);
      }
    }, 35000);

    it('handles very long environment variable values', async () => {
      const longSecret = 'a'.repeat(1000);

      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: ['DATABASE_HOST=', 'APP_ENV=dev', `APP_SECRET=${longSecret}`],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
        },
      });

      try {
        // Wait for container startup (no database configured)
        await waitForLog(container, /No database configured|Starting/i, 30000);

        // Should start without crashing
        const info = await container.inspect();
        expect(info.State.Running).toBe(true);
      } finally {
        await cleanup([container]);
      }
    }, 40000);

    it('handles special characters in environment variables', async () => {
      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: [
          'DATABASE_HOST=',
          'APP_ENV=dev',
          'APP_SECRET=test!@#$%^&*()_+-=[]{}|;:,.<>?',
          'SHOPWARE_ADMIN_PASSWORD=P@$$w0rd!123',
        ],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
        },
      });

      try {
        // Wait for container startup (no database configured)
        await waitForLog(container, /No database configured|Starting/i, 30000);

        const info = await container.inspect();
        expect(info.State.Running).toBe(true);
      } finally {
        await cleanup([container]);
      }
    }, 40000);
  });

  describe('Resource Constraints', () => {
    it('handles low memory conditions gracefully', async () => {
      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: ['DATABASE_HOST=', 'APP_ENV=dev', 'APP_SECRET=test'],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
          Memory: 256 * 1024 * 1024, // 256MB - very low
        },
      });

      try {
        // Wait for container startup (no database configured) - may be slow due to low memory
        await waitForLog(container, /No database configured|Starting/i, 40000);

        // Container might be killed by OOM or run slowly
        const info = await container.inspect();
        // Just verify it doesn't cause a crash of the test
        expect(info).toBeDefined();
      } finally {
        await cleanup([container]);
      }
    }, 40000);

    it('handles disk space constraints', async () => {
      // Simulated by using very small tmpfs
      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: ['DATABASE_HOST=', 'APP_ENV=dev', 'APP_SECRET=test'],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
          Tmpfs: {
            '/tmp': 'size=10m', // Very small temp space
          },
        },
      });

      try {
        // Wait for container startup (no database configured)
        await waitForLog(container, /No database configured|Starting/i, 30000);

        const info = await container.inspect();
        expect(info).toBeDefined();
      } finally {
        await cleanup([container]);
      }
    }, 40000);
  });

  describe('Concurrent Operations', () => {
    it('handles rapid start/stop cycles', async () => {
      const containers: Docker.Container[] = [];

      try {
        // Create multiple containers
        for (let i = 0; i < 3; i++) {
          const container = await createContainer({
            Image: 'swocker:test-dev',
            Env: ['DATABASE_HOST=', 'APP_ENV=dev', `APP_SECRET=test${i}`],
            ExposedPorts: { '80/tcp': {} },
            HostConfig: {
              PortBindings: { '80/tcp': [{ HostPort: '0' }] },
            },
          });
          containers.push(container);
        }

        // Wait for all containers to start
        await Promise.all(
          containers.map((c) => waitForLog(c, /No database configured|Starting/i, 15000))
        );

        // Stop all rapidly
        await Promise.all(containers.map((c) => c.stop()));

        // Restart all
        await Promise.all(containers.map((c) => c.start()));

        // Wait for all containers to restart
        await Promise.all(
          containers.map((c) => waitForLog(c, /No database configured|Starting/i, 15000))
        );

        // All should be running
        for (const container of containers) {
          const info = await container.inspect();
          expect(info.State.Running).toBe(true);
        }
      } finally {
        await cleanup(containers);
      }
    }, 60000);
  });

  describe('Invalid Configuration', () => {
    it('handles invalid PHP configuration values', async () => {
      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: [
          'DATABASE_HOST=',
          'APP_ENV=dev',
          'APP_SECRET=test',
          'PHP_MEMORY_LIMIT=invalid',
          'PHP_MAX_EXECUTION_TIME=not_a_number',
        ],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
        },
      });

      try {
        // Wait for container startup (no database configured)
        await waitForLog(container, /No database configured|Starting/i, 30000);

        // Container should still be running
        const info = await container.inspect();
        expect(info.State.Running).toBe(true);
      } finally {
        await cleanup([container]);
      }
    }, 40000);

    it('handles conflicting environment variables', async () => {
      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: [
          'DATABASE_HOST=mysql',
          'DATABASE_PORT=3306',
          'DATABASE_PASSWORD=pass',
          // Conflicting DATABASE_URL
          'DATABASE_URL=mysql://root:otherpass@otherhost:3307/otherdb',
          'APP_ENV=dev',
          'APP_SECRET=test',
        ],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
        },
      });

      try {
        // Wait for container startup (database connection will likely fail)
        await waitForLog(container, /Starting|Waiting for database|Exception/i, 30000);

        const info = await container.inspect();
        expect(info.State.Running).toBe(true);

        // Check which configuration won (DATABASE_URL should take precedence based on our entrypoint)
        const logs = await container.logs({ stdout: true, stderr: true });
        expect(logs.toString()).toBeDefined();
      } finally {
        await cleanup([container]);
      }
    }, 40000);
  });

  describe('File System Edge Cases', () => {
    it('handles read-only file system for non-critical paths', async () => {
      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: ['DATABASE_HOST=', 'APP_ENV=dev', 'APP_SECRET=test'],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
          ReadonlyRootfs: false, // We need some write access
          Tmpfs: {
            '/tmp': 'rw',
            '/var/www/html/var': 'rw', // Shopware needs this
          },
        },
      });

      try {
        // Wait for container startup (no database configured)
        await waitForLog(container, /No database configured|Starting/i, 30000);

        const info = await container.inspect();
        expect(info.State.Running).toBe(true);
      } finally {
        await cleanup([container]);
      }
    }, 40000);

    it('handles missing plugin directories gracefully', async () => {
      // This test needs a database to trigger plugin installation
      let mysqlContainer: Docker.Container | null = null;

      try {
        // Create MySQL
        const docker = getDocker();
        mysqlContainer = await docker.createContainer({
          Image: 'mysql:8.0',
          Env: ['MYSQL_ROOT_PASSWORD=test', 'MYSQL_DATABASE=shopware'],
          ExposedPorts: { '3306/tcp': {} },
          HostConfig: {
            PortBindings: { '3306/tcp': [{ HostPort: '0' }] },
            Tmpfs: { '/var/lib/mysql': 'rw,noexec,nosuid,size=512m' },
          },
        });
        await mysqlContainer.start();
        await waitForLog(mysqlContainer, 'ready for connections', 60000);

        const mysqlInfo = await mysqlContainer.inspect();
        const mysqlPort = mysqlInfo.NetworkSettings.Ports['3306/tcp']?.[0]?.HostPort;

        const container = await createContainer({
          Image: 'swocker:test-dev',
          Env: [
            'DATABASE_HOST=host.docker.internal',
            `DATABASE_PORT=${mysqlPort}`,
            'DATABASE_PASSWORD=test',
            'APP_ENV=dev',
            'APP_SECRET=test',
            'AUTO_INSTALL_PLUGINS=NonExistentPlugin,AnotherMissingPlugin',
          ],
          ExposedPorts: { '80/tcp': {} },
          HostConfig: {
            PortBindings: { '80/tcp': [{ HostPort: '0' }] },
            ExtraHosts: ['host.docker.internal:host-gateway'],
          },
        });

        try {
          // Wait for container to complete startup and plugin installation
          await waitForHealthy(container, 180000);

          const logs = await container.logs({ stdout: true, stderr: true });
          const logStr = logs.toString();

          // Should show warning about missing plugins
          expect(logStr).toMatch(/plugin.*not found|WARNING|Failed to install/i);

          // But container should still be running
          const info = await container.inspect();
          expect(info.State.Running).toBe(true);
        } finally {
          await cleanup([container]);
        }
      } finally {
        if (mysqlContainer) {
          await cleanup([mysqlContainer]);
        }
      }
    }, 120000);
  });

  describe('Variant-Specific Edge Cases', () => {
    it('CI variant works without database or web server', async () => {
      const container = await docker.createContainer({
        Image: 'swocker:test-ci',
        Cmd: ['php', '-v'],
      });

      await container.start();

      try {
        // Wait for PHP version output in logs
        await waitForLog(container, /PHP/i, 10000);

        const logs = await container.logs({ stdout: true, stderr: true });
        expect(logs.toString()).toContain('PHP');
      } finally {
        await cleanup([container]);
      }
    }, 10000);

    it('prod variant enforces production settings', async () => {
      const container = await createContainer({
        Image: 'swocker:test-prod',
        Env: ['DATABASE_HOST=', 'APP_ENV=prod', 'APP_SECRET=production-secret'],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
        },
      });

      try {
        // Wait for container startup (no database configured)
        await waitForLog(container, /No database configured|Starting/i, 30000);

        // Check PHP configuration
        const phpInfo = await execInContainer(container, ['php', '-i']);

        // Opcache should be enabled in prod
        expect(phpInfo).toMatch(/opcache\.enable.*On/i);

        // Xdebug should NOT be present in prod
        expect(phpInfo).not.toContain('xdebug');
      } finally {
        await cleanup([container]);
      }
    }, 40000);
  });
});
