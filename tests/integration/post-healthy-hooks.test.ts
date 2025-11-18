import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDocker, cleanupByName, waitForLog } from '../helpers/docker.js';
import { $ } from 'zx';
import * as path from 'path';

$.verbose = false;

const TEST_IMAGE_TAG = 'swocker:test-post-healthy-hooks';
const TEST_NETWORK = 'swocker-test-post-healthy-network';
const TEST_DB_CONTAINER = 'swocker-test-post-healthy-mysql';

describe('Post-Healthy Initialization Hooks', () => {
  beforeAll(async () => {
    console.log('Setting up post-healthy hooks test environment...');

    await cleanupByName([TEST_DB_CONTAINER], [TEST_NETWORK]);

    await $`docker build -f docker/Dockerfile --target dev -t ${TEST_IMAGE_TAG} .`;

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
  }, 120000);

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
});
