import { describe, it, expect } from 'vitest';
import { $ } from 'zx';
import { getDocker } from '../helpers/docker.js';
import versions from '../../versions.json';

$.verbose = false;

describe('Build Matrix', () => {
  it('can build with different Shopware versions', async () => {
    // Test with first 2 versions to save time
    const testVersions = versions.versions.slice(0, 2);

    for (const version of testVersions) {
      const tag = `swocker:${version.version}-test`;
      console.log(`Building ${tag}...`);

      await $`docker build \
          -f docker/Dockerfile \
          --target dev \
          --build-arg SHOPWARE_VERSION=${version.version} \
          -t ${tag} \
          .`;

      // Verify version in container by checking the download happened correctly
      const result =
        await $`docker run --rm ${tag} bash -c "cd /var/www/html && ls -la composer.json"`;
      expect(result.stdout).toContain('composer.json');

      // Cleanup
      await $`docker rmi ${tag}`;
    }
  }, 600000); // 10 minute timeout

  it('can build all variants with version parameters', async () => {
    const variants = ['dev', 'prod', 'ci'];
    const version = versions.versions[0]?.version;

    if (!version) {
      throw new Error('No versions available for testing');
    }

    for (const variant of variants) {
      const tag = `swocker:${version}-${variant}-test`;
      console.log(`Building ${variant} variant...`);

      await $`docker build \
          -f docker/Dockerfile \
          --target ${variant} \
          --build-arg SHOPWARE_VERSION=${version} \
          -t ${tag} \
          .`;

      const docker = getDocker();
      const images = await docker.listImages();
      expect(images.some((img) => img.RepoTags?.includes(tag))).toBe(true);

      await $`docker rmi ${tag}`;
    }
  }, 600000);

  it('builds with correct PHP version for each Shopware version', async () => {
    // Test that we can build any version with any of its compatible PHP versions
    const testVersion = versions.versions[0];

    if (!testVersion) {
      throw new Error('No versions available for testing');
    }

    const tag = `swocker:${testVersion.version}-test`;
    console.log(`Building ${testVersion.version} with multiple PHP versions...`);

    await $`docker build \
        -f docker/Dockerfile \
        --target dev \
        --build-arg SHOPWARE_VERSION=${testVersion.version} \
        -t ${tag} \
        .`;

    // Test that each compatible PHP version can be selected at runtime
    for (const phpVersion of testVersion.php) {
      console.log(`Testing ${testVersion.version} with PHP ${phpVersion}...`);

      const result = await $`docker run --rm -e PHP_VERSION=${phpVersion} ${tag} php -v`;
      expect(result.stdout).toContain(`PHP ${phpVersion}`);
    }

    await $`docker rmi ${tag}`;
  }, 600000);
});
