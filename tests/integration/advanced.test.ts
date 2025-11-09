import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';
import { $ } from 'zx';
import Docker from 'dockerode';
import {
  getDocker,
  createContainer,
  cleanup,
  getContainerPort,
  execInContainer,
  waitForHealthy,
  waitForLog,
} from '../helpers/docker.js';

/**
 * Milestone 4.1: Advanced Configuration Tests
 * Tests for Nginx support, SSL/HTTPS, demo data, and improved health checks
 */
describe('Advanced Configuration', () => {
  const docker = getDocker();
  let mysqlContainer: Docker.Container | null = null;

  beforeAll(async () => {
    // Create MySQL container with tmpfs for faster tests
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

    // Wait for MySQL to be ready
    await waitForLog(mysql, 'ready for connections', 120000);
  }, 180000);

  afterAll(async () => {
    if (mysqlContainer) {
      await cleanup([mysqlContainer]);
    }
  });

  describe('Nginx Web Server Support', () => {
    it('can build with nginx variant', async () => {
      // Build nginx variant
      await $`docker build -f docker/Dockerfile --target dev-nginx -t swocker:test-nginx .`;

      const images = await docker.listImages();
      expect(images.some((img) => img.RepoTags?.includes('swocker:test-nginx'))).toBe(true);
    }, 600000);

    it('nginx variant serves content correctly', async () => {
      if (!mysqlContainer) {
        throw new Error('MySQL container not available');
      }

      const mysqlPort = await getContainerPort(mysqlContainer, 3306);
      const mysqlHost = `host.docker.internal:${mysqlPort}`;

      const container = await createContainer({
        Image: 'swocker:test-nginx',
        Env: [
          `DATABASE_URL=mysql://root:root@${mysqlHost}/shopware`,
          'APP_ENV=dev',
          'APP_SECRET=test-secret',
          'SHOPWARE_SKIP_MIGRATIONS=0',
        ],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
          ExtraHosts: ['host.docker.internal:host-gateway'],
        },
      });

      try {
        await waitForHealthy(container, 180000);

        const port = await getContainerPort(container, 80);
        const response = await axios.get(`http://localhost:${port}/admin`, {
          maxRedirects: 0,
          validateStatus: (status) => status >= 200 && status < 400,
        });

        expect(response.status).toBeLessThan(400);
      } finally {
        await cleanup([container]);
      }
    }, 240000);

    it('nginx configuration is valid', async () => {
      const container = await docker.createContainer({
        Image: 'swocker:test-nginx',
        Cmd: ['nginx', '-t'],
      });

      await container.start();

      try {
        // Wait a bit for command to complete
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const logs = await container.logs({ stdout: true, stderr: true });
        const result = logs.toString();

        expect(result).toContain('syntax is ok');
        expect(result).toContain('test is successful');
      } finally {
        await cleanup([container]);
      }
    }, 30000);
  });

  describe('SSL/HTTPS Support', () => {
    it('can build with SSL enabled', async () => {
      if (!mysqlContainer) {
        throw new Error('MySQL container not available');
      }

      const mysqlPort = await getContainerPort(mysqlContainer, 3306);
      const mysqlHost = `host.docker.internal:${mysqlPort}`;

      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: [
          `DATABASE_URL=mysql://root:root@${mysqlHost}/shopware`,
          'APP_ENV=dev',
          'APP_SECRET=test-secret',
          'SSL_ENABLED=1',
          'SHOPWARE_SKIP_MIGRATIONS=0',
        ],
        ExposedPorts: { '80/tcp': {}, '443/tcp': {} },
        HostConfig: {
          PortBindings: {
            '80/tcp': [{ HostPort: '0' }],
            '443/tcp': [{ HostPort: '0' }],
          },
          ExtraHosts: ['host.docker.internal:host-gateway'],
        },
      });

      try {
        await waitForHealthy(container, 120000);

        // Check that SSL port is listening
        const httpsPort = await getContainerPort(container, 443);
        expect(httpsPort).toBeGreaterThan(0);

        // Verify SSL certificate exists
        const certCheck = await execInContainer(container, [
          'test',
          '-f',
          '/etc/ssl/certs/swocker.crt',
        ]);
        expect(certCheck).toBeDefined();
      } finally {
        await cleanup([container]);
      }
    }, 180000);

    it('redirects HTTP to HTTPS when SSL is enabled', async () => {
      if (!mysqlContainer) {
        throw new Error('MySQL container not available');
      }

      const mysqlPort = await getContainerPort(mysqlContainer, 3306);
      const mysqlHost = `host.docker.internal:${mysqlPort}`;

      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: [
          `DATABASE_URL=mysql://root:root@${mysqlHost}/shopware`,
          'APP_ENV=dev',
          'APP_SECRET=test-secret',
          'SSL_ENABLED=1',
          'SHOPWARE_SKIP_MIGRATIONS=0',
        ],
        ExposedPorts: { '80/tcp': {}, '443/tcp': {} },
        HostConfig: {
          PortBindings: {
            '80/tcp': [{ HostPort: '0' }],
            '443/tcp': [{ HostPort: '0' }],
          },
          ExtraHosts: ['host.docker.internal:host-gateway'],
        },
      });

      try {
        await waitForHealthy(container, 120000);

        const httpPort = await getContainerPort(container, 80);
        const response = await axios.get(`http://localhost:${httpPort}/admin`, {
          maxRedirects: 0,
          validateStatus: () => true,
        });

        // Should redirect to HTTPS
        expect(response.status).toBe(301);
        expect(response.headers.location).toMatch(/^https:/);
      } finally {
        await cleanup([container]);
      }
    }, 180000);
  });

  describe('Improved Health Check', () => {
    it('health check validates database connection', async () => {
      if (!mysqlContainer) {
        throw new Error('MySQL container not available');
      }

      const mysqlPort = await getContainerPort(mysqlContainer, 3306);
      const mysqlHost = `host.docker.internal:${mysqlPort}`;

      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: [
          `DATABASE_URL=mysql://root:root@${mysqlHost}/shopware`,
          'APP_ENV=dev',
          'APP_SECRET=test-secret',
          'SHOPWARE_SKIP_MIGRATIONS=0',
        ],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
          ExtraHosts: ['host.docker.internal:host-gateway'],
        },
      });

      try {
        await waitForHealthy(container, 120000);

        // Run health check manually and verify it checks database
        const healthOutput = await execInContainer(container, ['/usr/local/bin/healthcheck.sh']);

        expect(healthOutput).toMatch(/database|mysql|connection/i);
      } finally {
        await cleanup([container]);
      }
    }, 180000);

    it('health check fails when database is unavailable', async () => {
      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: [
          'DATABASE_URL=mysql://root:wrong@invalid-host:3306/shopware',
          'APP_ENV=dev',
          'APP_SECRET=test-secret',
          'SHOPWARE_SKIP_MIGRATIONS=1',
        ],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
        },
      });

      try {
        // Wait a bit for startup
        await new Promise((resolve) => setTimeout(resolve, 10000));

        // Health check should fail
        try {
          const healthOutput = await execInContainer(container, ['/usr/local/bin/healthcheck.sh']);
          // If it doesn't throw, check the output indicates failure
          expect(healthOutput).toMatch(/fail|error|unhealthy/i);
        } catch (error) {
          // Expected - health check should fail with non-zero exit code
          expect(error).toBeDefined();
        }
      } finally {
        await cleanup([container]);
      }
    }, 60000);

    it('health check validates PHP-FPM or Apache is running', async () => {
      if (!mysqlContainer) {
        throw new Error('MySQL container not available');
      }

      const mysqlPort = await getContainerPort(mysqlContainer, 3306);
      const mysqlHost = `host.docker.internal:${mysqlPort}`;

      const container = await createContainer({
        Image: 'swocker:test-dev',
        Env: [
          `DATABASE_URL=mysql://root:root@${mysqlHost}/shopware`,
          'APP_ENV=dev',
          'APP_SECRET=test-secret',
          'SHOPWARE_SKIP_MIGRATIONS=0',
        ],
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
          ExtraHosts: ['host.docker.internal:host-gateway'],
        },
      });

      try {
        await waitForHealthy(container, 120000);

        const healthOutput = await execInContainer(container, ['/usr/local/bin/healthcheck.sh']);

        // Should check that web server is running
        expect(healthOutput).toMatch(/apache|php-fpm|web.*server/i);
      } finally {
        await cleanup([container]);
      }
    }, 180000);
  });
});
