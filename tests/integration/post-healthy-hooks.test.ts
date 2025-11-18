import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDocker, cleanupByName, waitForLog, waitForHealthy } from '../helpers/docker.js';
import { $ } from 'zx';
import * as path from 'path';

$.verbose = false;

const TEST_IMAGE_TAG = 'swocker:test-post-healthy-hooks';
const TEST_NETWORK = 'swocker-test-post-healthy-network';
const TEST_DB_CONTAINER = 'swocker-test-post-healthy-mysql';

describe('Post-Healthy Initialization Hooks', () => {
  beforeAll(async () => {
    console.log('Setting up post-healthy hooks test environment...');

    await cleanupByName([TEST_DB_CONTAINER, 'swocker-test-webhook-receiver'], [TEST_NETWORK]);

    await $`docker build -f docker/Dockerfile --target dev -t ${TEST_IMAGE_TAG} .`;

    // Pull webhook-receiver image
    console.log('Pulling webhook-receiver image...');
    await $`docker pull iwebercodes/webhook-receiver:latest`;

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
  }, 180000); // Increased timeout to account for webhook-receiver image pull

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

  it('should execute post-healthy hooks after container becomes healthy', async () => {
    const docker = getDocker();
    const hooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/post-healthy');

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware_post_healthy_timing',
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
        Binds: [`${hooksPath}:/docker-entrypoint-shopware-healthy.d:ro`],
      },
    });

    try {
      await container.start();

      // Wait for container to become ready
      await waitForLog(container, '[Swocker] Container ready!', 120000);

      // Wait for healthy state detection
      await waitForLog(container, '[Swocker] Container is healthy', 90000);

      // Wait for hook execution
      await waitForLog(container, '[Swocker] ✓ 10-timing-test.sh completed', 30000);

      // Wait for completion marker
      await waitForLog(container, '[Swocker] Post-healthy hooks complete', 10000);

      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();

      expect(logStr).toContain('[Swocker] Post-healthy hook monitor started');
      expect(logStr).toContain('[Swocker] Container is healthy');
      expect(logStr).toContain('[Swocker] Executing post-healthy initialization scripts');
      expect(logStr).toContain('[Test Hook] Post-healthy hook executed');
      expect(logStr).toContain('[Swocker] Post-healthy hooks complete');

      // Verify the hook created the expected file
      const exec = await container.exec({
        Cmd: ['cat', '/tmp/post-healthy-hook-status'],
        AttachStdout: true,
      });
      const stream = await exec.start({ hijack: true });
      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.slice(8).toString();
      });
      await new Promise((resolve) => stream.on('end', resolve));

      expect(output).toContain('POST_HEALTHY_SUCCESS');

      // Verify completion marker exists
      const markerExec = await container.exec({
        Cmd: [
          'sh',
          '-c',
          'test -f /tmp/.swocker-post-healthy-complete && echo "EXISTS" || echo "NOT_FOUND"',
        ],
        AttachStdout: true,
      });
      const markerStream = await markerExec.start({ hijack: true });
      let markerOutput = '';
      markerStream.on('data', (chunk: Buffer) => {
        markerOutput += chunk.slice(8).toString();
      });
      await new Promise((resolve) => markerStream.on('end', resolve));
      expect(markerOutput.trim()).toBe('EXISTS');
    } finally {
      await container.stop({ t: 10 });
      await container.remove();
    }
  }, 180000);

  it('should run hooks as www-data user with correct permissions', async () => {
    const docker = getDocker();
    const hooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/post-healthy');

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware_post_healthy_user',
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
        Binds: [`${hooksPath}:/docker-entrypoint-shopware-healthy.d:ro`],
      },
    });

    try {
      await container.start();

      await waitForLog(container, '[Swocker] Post-healthy hooks complete', 180000);

      // Check user info
      const userExec = await container.exec({
        Cmd: ['cat', '/tmp/post-healthy-user-info'],
        AttachStdout: true,
      });
      const userStream = await userExec.start({ hijack: true });
      let userOutput = '';
      userStream.on('data', (chunk: Buffer) => {
        userOutput += chunk.slice(8).toString();
      });
      await new Promise((resolve) => userStream.on('end', resolve));

      expect(userOutput).toContain('User: www-data');

      // Check file ownership
      const ownerExec = await container.exec({
        Cmd: ['stat', '-c', '%U:%G', '/tmp/post-healthy-user-test'],
        AttachStdout: true,
      });
      const ownerStream = await ownerExec.start({ hijack: true });
      let ownerOutput = '';
      ownerStream.on('data', (chunk: Buffer) => {
        ownerOutput += chunk.slice(8).toString();
      });
      await new Promise((resolve) => ownerStream.on('end', resolve));

      expect(ownerOutput.trim()).toBe('www-data:www-data');
    } finally {
      await container.stop({ t: 10 });
      await container.remove();
    }
  }, 180000);

  it('should execute hooks in alphabetical order', async () => {
    const docker = getDocker();
    const hooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/post-healthy-ordering');

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware_post_healthy_order',
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
        Binds: [`${hooksPath}:/docker-entrypoint-shopware-healthy.d:ro`],
      },
    });

    try {
      await container.start();

      await waitForLog(container, '[Swocker] Post-healthy hooks complete', 180000);

      const exec = await container.exec({
        Cmd: ['cat', '/tmp/post-healthy-order-test'],
        AttachStdout: true,
      });
      const stream = await exec.start({ hijack: true });
      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.slice(8).toString();
      });
      await new Promise((resolve) => stream.on('end', resolve));

      const lines = output.trim().split('\n');
      expect(lines).toEqual(['FIRST', 'SECOND', 'THIRD']);
    } finally {
      await container.stop({ t: 10 });
      await container.remove();
    }
  }, 180000);

  it('CRITICAL: should continue container when hook fails (non-fatal errors)', async () => {
    const docker = getDocker();
    const hooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/post-healthy-failing');

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware_post_healthy_fail',
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
        Binds: [`${hooksPath}:/docker-entrypoint-shopware-healthy.d:ro`],
      },
    });

    try {
      await container.start();

      // Wait for hooks to complete despite failure
      await waitForLog(container, '[Swocker] Post-healthy hooks complete', 180000);

      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();

      // Verify failure was logged with warning symbol
      expect(logStr).toContain('⚠ 20-failure.sh failed with exit code 1');
      expect(logStr).toContain('WARNING: Post-healthy hook failed, but container continues');

      // Verify hooks before and after failure both executed
      expect(logStr).toContain('✓ 10-success.sh completed');
      expect(logStr).toContain('✓ 30-also-success.sh completed');

      // Verify completion message still appears
      expect(logStr).toContain('[Swocker] Post-healthy hooks complete');

      // Verify container is still running
      const inspectResult = await container.inspect();
      expect(inspectResult.State.Running).toBe(true);

      // Verify completion marker was created despite failure
      const markerExec = await container.exec({
        Cmd: [
          'sh',
          '-c',
          'test -f /tmp/.swocker-post-healthy-complete && echo "EXISTS" || echo "NOT_FOUND"',
        ],
        AttachStdout: true,
      });
      const markerStream = await markerExec.start({ hijack: true });
      let markerOutput = '';
      markerStream.on('data', (chunk: Buffer) => {
        markerOutput += chunk.slice(8).toString();
      });
      await new Promise((resolve) => markerStream.on('end', resolve));
      expect(markerOutput.trim()).toBe('EXISTS');

      // Verify the file shows all three hooks ran
      const fileExec = await container.exec({
        Cmd: ['cat', '/tmp/post-healthy-failure-test'],
        AttachStdout: true,
      });
      const fileStream = await fileExec.start({ hijack: true });
      let fileOutput = '';
      fileStream.on('data', (chunk: Buffer) => {
        fileOutput += chunk.slice(8).toString();
      });
      await new Promise((resolve) => fileStream.on('end', resolve));

      expect(fileOutput).toContain('BEFORE_FAILURE');
      expect(fileOutput).toContain('FAILURE');
      expect(fileOutput).toContain('AFTER_FAILURE');
    } finally {
      await container.stop({ t: 10 });
      await container.remove();
    }
  }, 180000);

  it('should have access to environment variables in hooks', async () => {
    const docker = getDocker();
    const hooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/post-healthy');

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware_post_healthy_env',
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
        Binds: [`${hooksPath}:/docker-entrypoint-shopware-healthy.d:ro`],
      },
    });

    try {
      await container.start();

      await waitForLog(container, '[Swocker] Post-healthy hooks complete', 180000);

      const exec = await container.exec({
        Cmd: ['cat', '/tmp/post-healthy-env-test'],
        AttachStdout: true,
      });
      const stream = await exec.start({ hijack: true });
      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.slice(8).toString();
      });
      await new Promise((resolve) => stream.on('end', resolve));

      expect(output).toContain(`DATABASE_HOST=${TEST_DB_CONTAINER}`);
      expect(output).toContain('DATABASE_NAME=shopware_post_healthy_env');
    } finally {
      await container.stop({ t: 10 });
      await container.remove();
    }
  }, 180000);

  it('should have database access from post-healthy hooks', async () => {
    const docker = getDocker();
    const hooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/post-healthy');

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware_post_healthy_db',
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
        Binds: [`${hooksPath}:/docker-entrypoint-shopware-healthy.d:ro`],
      },
    });

    try {
      await container.start();

      await waitForLog(container, '[Swocker] Post-healthy hooks complete', 180000);

      // Verify database test hook succeeded
      const exec = await container.exec({
        Cmd: ['cat', '/tmp/post-healthy-db-status'],
        AttachStdout: true,
      });
      const stream = await exec.start({ hijack: true });
      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.slice(8).toString();
      });
      await new Promise((resolve) => stream.on('end', resolve));

      expect(output).toContain('DATABASE_TEST_SUCCESS');
    } finally {
      await container.stop({ t: 10 });
      await container.remove();
    }
  }, 180000);

  it('should have HTTP access to Shopware from post-healthy hooks', async () => {
    const docker = getDocker();
    const hooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/post-healthy');

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware_post_healthy_http',
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
        Binds: [`${hooksPath}:/docker-entrypoint-shopware-healthy.d:ro`],
      },
    });

    try {
      await container.start();

      await waitForLog(container, '[Swocker] Post-healthy hooks complete', 180000);

      // Verify HTTP test hook succeeded
      const exec = await container.exec({
        Cmd: ['cat', '/tmp/post-healthy-http-status'],
        AttachStdout: true,
      });
      const stream = await exec.start({ hijack: true });
      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.slice(8).toString();
      });
      await new Promise((resolve) => stream.on('end', resolve));

      expect(output).toContain('HTTP_TEST_SUCCESS');
    } finally {
      await container.stop({ t: 10 });
      await container.remove();
    }
  }, 180000);

  it('should NOT execute hooks if directory not mounted', async () => {
    const docker = getDocker();

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware_post_healthy_no_hooks',
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
      },
    });

    try {
      await container.start();

      // Wait for container to become ready
      await waitForLog(container, '[Swocker] Container ready!', 120000);

      // Wait a bit for the monitor to run
      await new Promise((resolve) => setTimeout(resolve, 90000));

      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();

      // Monitor should start but find no hooks
      expect(logStr).toContain('[Swocker] Post-healthy hook monitor started');
      // Should not execute any hooks
      expect(logStr).not.toContain('Executing post-healthy initialization scripts');
    } finally {
      await container.stop({ t: 10 });
      await container.remove();
    }
  }, 180000);

  it('should log appropriate message when hook directory is empty', async () => {
    const docker = getDocker();

    // Create a temporary empty directory
    const emptyDir = path.resolve(process.cwd(), 'tests/fixtures/hooks/post-healthy-empty');
    await $`mkdir -p ${emptyDir}`;

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware_post_healthy_empty',
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
        Binds: [`${emptyDir}:/docker-entrypoint-shopware-healthy.d:ro`],
      },
    });

    try {
      await container.start();

      await waitForLog(container, '[Swocker] Container is healthy', 120000);

      // Wait a bit for hooks to process
      await new Promise((resolve) => setTimeout(resolve, 10000));

      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();

      expect(logStr).toContain('[Swocker] Post-healthy hook monitor started');
      expect(logStr).toContain('[Swocker] Container is healthy');
      expect(logStr).toContain('No post-healthy initialization scripts found, skipping');
      expect(logStr).toContain('[Swocker] Post-healthy hooks complete');

      // Verify completion marker was created
      const markerExec = await container.exec({
        Cmd: [
          'sh',
          '-c',
          'test -f /tmp/.swocker-post-healthy-complete && echo "EXISTS" || echo "NOT_FOUND"',
        ],
        AttachStdout: true,
      });
      const markerStream = await markerExec.start({ hijack: true });
      let markerOutput = '';
      markerStream.on('data', (chunk: Buffer) => {
        markerOutput += chunk.slice(8).toString();
      });
      await new Promise((resolve) => markerStream.on('end', resolve));
      expect(markerOutput.trim()).toBe('EXISTS');
    } finally {
      await container.stop({ t: 10 });
      await container.remove();
      await $`rm -rf ${emptyDir}`;
    }
  }, 180000);

  it('should respect POST_HEALTHY_TIMEOUT configuration', async () => {
    const docker = getDocker();
    const hooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/post-healthy');

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware_post_healthy_timeout',
        'POST_HEALTHY_TIMEOUT=600', // 10 minutes
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
        Binds: [`${hooksPath}:/docker-entrypoint-shopware-healthy.d:ro`],
      },
    });

    try {
      await container.start();

      await waitForLog(container, '[Swocker] Post-healthy hooks complete', 180000);

      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();

      // Verify the custom timeout is logged
      expect(logStr).toContain('Post-healthy hook monitor started (max wait: 600s)');
    } finally {
      await container.stop({ t: 10 });
      await container.remove();
    }
  }, 180000);

  it('CRITICAL: should send webhooks to external services from post-healthy hooks', async () => {
    const docker = getDocker();
    const hooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/post-healthy-webhook');

    // Start webhook-receiver container
    const webhookReceiverContainer = await docker.createContainer({
      Image: 'iwebercodes/webhook-receiver:latest',
      name: 'swocker-test-webhook-receiver',
      HostConfig: {
        NetworkMode: TEST_NETWORK,
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [TEST_NETWORK]: {
            Aliases: ['webhook-receiver'],
          },
        },
      },
    });

    let shopwareContainer;

    try {
      await webhookReceiverContainer.start();

      // Wait for webhook-receiver to be ready
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Start Shopware container with webhook hook
      shopwareContainer = await docker.createContainer({
        Image: TEST_IMAGE_TAG,
        Env: [
          `DATABASE_HOST=${TEST_DB_CONTAINER}`,
          'DATABASE_PASSWORD=test123',
          'DATABASE_NAME=shopware_post_healthy_webhook',
          'APP_URL=http://shopware-webhook-test',
        ],
        HostConfig: {
          NetworkMode: TEST_NETWORK,
          Binds: [`${hooksPath}:/docker-entrypoint-shopware-healthy.d:ro`],
        },
      });

      await shopwareContainer.start();

      // Wait for post-healthy hooks to complete
      await waitForLog(shopwareContainer, '[Swocker] Post-healthy hooks complete', 180000);

      // Verify webhook was sent by checking hook status file
      const statusExec = await shopwareContainer.exec({
        Cmd: ['cat', '/tmp/post-healthy-webhook-status'],
        AttachStdout: true,
      });
      const statusStream = await statusExec.start({ hijack: true });
      let statusOutput = '';
      statusStream.on('data', (chunk: Buffer) => {
        statusOutput += chunk.slice(8).toString();
      });
      await new Promise((resolve) => statusStream.on('end', resolve));

      expect(statusOutput.trim()).toBe('WEBHOOK_SENT');

      // Query webhook-receiver API to verify webhook was received
      const webhookCheckExec = await webhookReceiverContainer.exec({
        Cmd: ['curl', '-s', 'http://localhost/api/webhooks/test-session-swocker'],
        AttachStdout: true,
      });
      const webhookStream = await webhookCheckExec.start({ hijack: true });
      let webhookOutput = '';
      webhookStream.on('data', (chunk: Buffer) => {
        webhookOutput += chunk.slice(8).toString();
      });
      await new Promise((resolve) => webhookStream.on('end', resolve));

      // Parse webhook response (API returns array directly)
      const webhooks = JSON.parse(webhookOutput);

      // Verify webhook was received
      expect(Array.isArray(webhooks)).toBe(true);
      expect(webhooks.length).toBeGreaterThan(0);

      // Verify webhook payload
      const webhook = webhooks[0];
      expect(webhook).toHaveProperty('body');

      // webhook.body is already an object, not a JSON string
      const body = webhook.body;
      expect(body.event).toBe('shop.ready');
      expect(body.data.shop_url).toBe('http://shopware-webhook-test');
      expect(body.data.database).toBe('shopware_post_healthy_webhook');
      expect(body.data.message).toContain('Shopware is fully ready');

      // Verify webhook headers
      expect(webhook.headers).toHaveProperty('content-type');
      expect(webhook.headers['content-type']).toContain('application/json');
      expect(webhook.headers).toHaveProperty('x-shopware-shop-signature');
      expect(webhook.headers['x-shopware-shop-signature']).toBe('test-signature');

      // Verify logs show webhook was sent
      const logs = await shopwareContainer.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();

      expect(logStr).toContain('[Test Hook] Sending webhook to external service');
      expect(logStr).toContain('[Test Hook] ✓ Webhook sent successfully');
    } finally {
      if (shopwareContainer) {
        await shopwareContainer.stop({ t: 10 });
        await shopwareContainer.remove();
      }
      await webhookReceiverContainer.stop({ t: 5 });
      await webhookReceiverContainer.remove();
    }
  }, 240000);

  it('REGRESSION: should execute hooks when HEALTHCHECK is overridden (APP_URL=container)', async () => {
    const docker = getDocker();
    const hooksPath = path.resolve(process.cwd(), 'tests/fixtures/hooks/post-healthy');

    // This test reproduces the bug reported in feedback:
    // When users override HEALTHCHECK and set APP_URL to container hostname,
    // Docker reports container as healthy, but /usr/local/bin/healthcheck.sh fails
    // because it curls localhost with wrong Host header expectations.

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: [
        `DATABASE_HOST=${TEST_DB_CONTAINER}`,
        'DATABASE_PASSWORD=test123',
        'DATABASE_NAME=shopware_post_healthy_override',
        'APP_URL=http://shopware', // Container hostname - breaks healthcheck.sh
      ],
      HostConfig: {
        NetworkMode: TEST_NETWORK,
        Binds: [`${hooksPath}:/docker-entrypoint-shopware-healthy.d:ro`],
      },
      // Override HEALTHCHECK (like users do in docker-compose.yml)
      Healthcheck: {
        Test: ['CMD', 'curl', '-f', 'http://localhost/api/_info/health-check'],
        Interval: 10000000000, // 10s in nanoseconds
        Timeout: 5000000000, // 5s in nanoseconds
        Retries: 15,
        StartPeriod: 60000000000, // 60s in nanoseconds
      },
    });

    try {
      await container.start();

      // Wait for container startup
      await waitForLog(container, '[Swocker] Container ready!', 120000);

      // Wait for Docker to report container as healthy
      // This SHOULD succeed because the custom HEALTHCHECK works
      await waitForHealthy(container, 180000);

      console.log('✅ Docker reports container as healthy');

      // Now verify healthcheck.sh behavior
      const healthcheckExec = await container.exec({
        Cmd: ['/usr/local/bin/healthcheck.sh'],
        AttachStdout: true,
        AttachStderr: true,
      });
      const healthStream = await healthcheckExec.start({ hijack: true });
      let healthOutput = '';
      healthStream.on('data', (chunk: Buffer) => {
        healthOutput += chunk.slice(8).toString();
      });
      await new Promise((resolve) => healthStream.on('end', resolve));

      const healthInspect = await healthcheckExec.inspect();
      console.log('healthcheck.sh exit code:', healthInspect.ExitCode);
      console.log('healthcheck.sh output:', healthOutput);

      // Document the bug: healthcheck.sh fails even though Docker reports healthy
      if (healthInspect.ExitCode !== 0) {
        console.log('⚠️  BUG CONFIRMED: healthcheck.sh fails but Docker is healthy');
      }

      // The critical test: post-healthy hooks SHOULD execute when Docker is healthy
      // Currently this will timeout because hooks never run (the bug)
      await waitForLog(container, '[Swocker] Post-healthy hooks complete', 90000);

      // Verify hook actually ran
      const exec = await container.exec({
        Cmd: ['cat', '/tmp/post-healthy-hook-status'],
        AttachStdout: true,
      });
      const stream = await exec.start({ hijack: true });
      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.slice(8).toString();
      });
      await new Promise((resolve) => stream.on('end', resolve));

      expect(output).toContain('POST_HEALTHY_SUCCESS');
    } finally {
      await container.stop({ t: 10 });
      await container.remove();
    }
  }, 240000);
});
