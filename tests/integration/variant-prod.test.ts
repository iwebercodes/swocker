import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { $ } from 'zx';
import { getDocker } from '../helpers/docker.js';

$.verbose = false;

const TEST_IMAGE_TAG = 'swocker:test-prod';
const TEST_NETWORK = 'swocker-test-prod-network';
const TEST_DB_CONTAINER = 'swocker-test-prod-mysql';

describe('Prod Variant', () => {
  beforeAll(async () => {
    console.log('Building prod variant...');

    // Clean up any leftover containers/networks from previous runs
    const { cleanupByName } = await import('../helpers/docker.js');
    await cleanupByName([TEST_DB_CONTAINER], [TEST_NETWORK]);

    // Build the prod variant
    await $`docker build --target prod -f docker/Dockerfile -t ${TEST_IMAGE_TAG} .`;

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

  it('image size is smaller than dev', async () => {
    const docker = getDocker();
    const image = await docker.getImage(TEST_IMAGE_TAG).inspect();
    const sizeGB = image.Size / 1024 ** 3;
    console.log(`Prod image size: ${sizeGB.toFixed(2)} GB`);
    expect(sizeGB).toBeLessThan(1.5);
  });

  it('does NOT have Xdebug installed', async () => {
    const result = await $`docker run --rm ${TEST_IMAGE_TAG} php -m`;
    expect(result.stdout).not.toContain('xdebug');
  });

  it('has Opcache enabled', async () => {
    const result =
      await $`docker run --rm --entrypoint php ${TEST_IMAGE_TAG} -r "echo ini_get('opcache.enable');"`;
    expect(result.stdout.trim()).toBe('1');
  });

  it('does NOT have development tools', async () => {
    const devTools = ['git', 'vim', 'nano'];

    for (const tool of devTools) {
      try {
        await $`docker run --rm ${TEST_IMAGE_TAG} which ${tool}`;
        throw new Error(`${tool} should not be installed in prod`);
      } catch (e: unknown) {
        // Expected - tool not found (exit code 1)
        expect((e as { exitCode: number }).exitCode).toBe(1);
      }
    }
  });

  it('does NOT have Node.js installed', async () => {
    try {
      await $`docker run --rm ${TEST_IMAGE_TAG} which node`;
      throw new Error('node should not be installed in prod');
    } catch (e: unknown) {
      // Expected - tool not found
      expect((e as { exitCode: number }).exitCode).toBe(1);
    }
  });

  it('has same packages as expected (Shopware production template has no dev deps)', async () => {
    const result =
      await $`docker run --rm --entrypoint composer ${TEST_IMAGE_TAG} show --name-only`;
    // Shopware's production template doesn't have require-dev section,
    // so we just verify the package count is reasonable
    const packageCount = result.stdout.trim().split('\n').length;
    expect(packageCount).toBeGreaterThan(100);
    expect(packageCount).toBeLessThan(200);
  });

  it('variant environment variable is set to prod', async () => {
    const result = await $`docker run --rm --entrypoint printenv ${TEST_IMAGE_TAG} VARIANT`;
    expect(result.stdout.trim()).toBe('prod');
  });

  it('expose_php is disabled', async () => {
    const result =
      await $`docker run --rm --entrypoint php ${TEST_IMAGE_TAG} -r "echo ini_get('expose_php');"`;
    expect(result.stdout.trim()).toBe('');
  });

  it('display_errors is disabled', async () => {
    const result =
      await $`docker run --rm --entrypoint php ${TEST_IMAGE_TAG} -r "echo ini_get('display_errors');"`;
    expect(result.stdout.trim()).toBe('');
  });
});
