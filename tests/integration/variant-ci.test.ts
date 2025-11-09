import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { $ } from 'zx';
import { getDocker } from '../helpers/docker.js';

$.verbose = false;

const TEST_IMAGE_TAG = 'swocker:test-ci';

describe('CI Variant', () => {
  beforeAll(async () => {
    console.log('Building CI variant...');

    // Build the CI variant
    await $`docker build --target ci -f docker/Dockerfile -t ${TEST_IMAGE_TAG} .`;
  }, 180000);

  afterAll(async () => {
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

  it('image size is minimal', async () => {
    const docker = getDocker();
    const image = await docker.getImage(TEST_IMAGE_TAG).inspect();
    const sizeMB = image.Size / 1024 ** 2;
    console.log(`CI image size: ${sizeMB.toFixed(2)} MB`);
    expect(sizeMB).toBeLessThan(1024); // ~1GB is reasonable for CLI with Shopware
  });

  it('uses PHP CLI base image (not Apache)', async () => {
    // Check that apache2 is not running
    const docker = getDocker();
    const container = await docker.createContainer({
      Image: TEST_IMAGE_TAG,
      Cmd: ['sleep', '5'],
    });

    try {
      await container.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Try to find apache process
      const exec = await container.exec({
        Cmd: ['ps', 'aux'],
        AttachStdout: true,
      });
      const stream = await exec.start({});
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const output = Buffer.concat(chunks).toString();
      expect(output).not.toContain('apache2');
      expect(output).not.toContain('httpd');
    } finally {
      await container.stop({ t: 1 });
      await container.remove();
    }
  });

  it('has PHP CLI working', async () => {
    const result = await $`docker run --rm ${TEST_IMAGE_TAG} php -v`;
    expect(result.stdout).toContain('PHP');
    expect(result.stdout).toContain('cli');
  });

  it('has Composer installed', async () => {
    const result = await $`docker run --rm ${TEST_IMAGE_TAG} composer --version`;
    expect(result.stdout).toContain('Composer');
  });

  it('has all packages installed', async () => {
    const result = await $`docker run --rm ${TEST_IMAGE_TAG} composer show --name-only`;
    // Shopware production template doesn't have require-dev, so packages are same across variants
    const packageCount = result.stdout.trim().split('\n').length;
    expect(packageCount).toBeGreaterThan(100);
  });

  it('variant environment variable is set to ci', async () => {
    const result = await $`docker run --rm ${TEST_IMAGE_TAG} printenv VARIANT`;
    expect(result.stdout.trim()).toBe('ci');
  });

  it('has all required PHP extensions', async () => {
    const result = await $`docker run --rm ${TEST_IMAGE_TAG} php -m`;
    const extensions = ['gd', 'intl', 'pdo_mysql', 'mysqli', 'zip', 'bcmath', 'soap', 'xsl'];

    for (const ext of extensions) {
      expect(result.stdout).toContain(ext);
    }
  });

  it('has Git installed for CI workflows', async () => {
    const result = await $`docker run --rm ${TEST_IMAGE_TAG} git --version`;
    expect(result.stdout).toContain('git version');
  });

  it('can run Shopware console commands', async () => {
    const result = await $`docker run --rm ${TEST_IMAGE_TAG} bin/console --version`;
    expect(result.stdout).toContain('Shopware');
  });
});
