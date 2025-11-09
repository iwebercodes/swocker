import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { $ } from 'zx';
import { getDocker } from '../helpers/docker.js';

$.verbose = false;

const TEST_IMAGE_TAG = 'swocker:test-build';

describe('Docker Build', () => {
  beforeAll(async () => {
    console.log('Building Docker image... this may take several minutes');
  }, 600000); // 10 minute timeout for setup

  afterAll(async () => {
    // Cleanup: remove test image
    try {
      await $`docker rmi ${TEST_IMAGE_TAG}`;
      console.log(`Cleaned up test image: ${TEST_IMAGE_TAG}`);
    } catch {
      console.log('Image cleanup skipped or failed');
    }
  });

  it('builds successfully', async () => {
    const startTime = Date.now();

    // Build dev target (main target with Apache and full functionality)
    await $`docker build -f docker/Dockerfile --target dev -t ${TEST_IMAGE_TAG} .`;

    const duration = Date.now() - startTime;
    console.log(`Build completed in ${Math.round(duration / 1000)}s`);

    // Verify build completed in reasonable time (< 10 minutes)
    expect(duration).toBeLessThan(600000);
  }, 600000); // 10 minute timeout

  it('image exists after build', async () => {
    const docker = getDocker();
    const images = await docker.listImages();

    const found = images.some((img) => img.RepoTags?.includes(TEST_IMAGE_TAG));
    expect(found).toBe(true);
  });

  it('image size is reasonable', async () => {
    const docker = getDocker();
    const image = await docker.getImage(TEST_IMAGE_TAG).inspect();
    const sizeGB = image.Size / 1024 ** 3;

    console.log(`Image size: ${sizeGB.toFixed(2)} GB`);
    expect(sizeGB).toBeLessThan(2);
  });

  it('contains expected Shopware files', async () => {
    const result = await $`docker run --rm ${TEST_IMAGE_TAG} ls -la /var/www/html`;

    expect(result.stdout).toContain('public');
    expect(result.stdout).toContain('vendor');
    expect(result.stdout).toContain('composer.json');
    expect(result.stdout).toContain('bin');
  });

  it('has PHP 8.3 installed by default', async () => {
    // Bypass entrypoint to directly test the binary
    const result = await $`docker run --rm --entrypoint php ${TEST_IMAGE_TAG} -v`;

    expect(result.stdout).toContain('PHP 8.3');
  });

  it('has PHP 8.2 available', async () => {
    // Bypass entrypoint to directly test the binary
    const result = await $`docker run --rm --entrypoint php8.2 ${TEST_IMAGE_TAG} -v`;

    expect(result.stdout).toContain('PHP 8.2');
  });

  it('can switch PHP version at runtime', async () => {
    // Test that PHP_VERSION env var works
    const result = await $`docker run --rm -e PHP_VERSION=8.2 ${TEST_IMAGE_TAG} php -v`;

    // The output will include entrypoint messages, but should also show PHP 8.2
    expect(result.stdout).toContain('PHP 8.2');
  });

  it('has Composer installed', async () => {
    const result = await $`docker run --rm ${TEST_IMAGE_TAG} composer --version`;

    expect(result.stdout).toContain('Composer');
  });

  it('has Node.js installed', async () => {
    const result = await $`docker run --rm ${TEST_IMAGE_TAG} node --version`;

    expect(result.stdout).toMatch(/v\d+\.\d+\.\d+/);
  });

  it('has required PHP extensions', async () => {
    const result = await $`docker run --rm ${TEST_IMAGE_TAG} php -m`;

    const requiredExtensions = [
      'pdo_mysql',
      'mysqli',
      'gd',
      'intl',
      'xml',
      'zip',
      'Zend OPcache',
      'bcmath',
      'soap',
    ];

    for (const ext of requiredExtensions) {
      expect(result.stdout).toContain(ext);
    }
  });

  it('container starts without errors', async () => {
    const docker = getDocker();

    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Env: ['SHOPWARE_VERSION=6.7.4.0'],
    });

    try {
      await container.start();

      // Wait a bit for container to initialize
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const info = await container.inspect();
      expect(info.State.Running).toBe(true);

      // Check logs for startup message
      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();
      expect(logStr).toContain('Swocker');
    } finally {
      await container.stop({ t: 5 });
      await container.remove();
    }
  }, 30000);
});
