#!/usr/bin/env tsx

import { $ } from 'zx';
import { generateBuildMatrix } from './generate-matrix.js';

$.verbose = true;

/**
 * Builds all Docker images from the build matrix with correct tags
 * Usage: npm run build:all
 */
async function buildAll(): Promise<void> {
  console.log('🚀 Building all Docker images from matrix...\n');

  const matrix = generateBuildMatrix();
  const total = matrix.include.length;
  let completed = 0;

  console.log(`Found ${total} images to build\n`);

  for (const entry of matrix.include) {
    completed++;
    const tags = [`iwebercodes/swocker:${entry.tag}`];

    // Add latest tags for the latest Shopware version
    if (entry.isLatest) {
      tags.push(`iwebercodes/swocker:latest-${entry.variant}`);
      if (entry.variant === 'dev') {
        tags.push('iwebercodes/swocker:latest');
      }
    }

    console.log(`\n[${completed}/${total}] Building ${entry.shopware} ${entry.variant}...`);
    console.log(`Tags: ${tags.join(', ')}`);

    try {
      // Build docker command with all tags
      const args = [
        'build',
        '-f',
        'docker/Dockerfile',
        '--target',
        entry.variant,
        '--build-arg',
        `SHOPWARE_VERSION=${entry.shopware}`,
        '--build-arg',
        `DEFAULT_PHP_VERSION=${entry.defaultPhp}`,
      ];

      // Add all tags
      for (const tag of tags) {
        args.push('-t', tag);
      }

      args.push('.');

      await $`docker ${args}`;

      console.log(`✅ Successfully built ${tags[0]}`);
    } catch (error) {
      console.error(`❌ Failed to build ${tags[0]}`);
      throw error;
    }
  }

  console.log(`\n🎉 Successfully built all ${total} images!`);
  console.log('\nTo push to Docker Hub, run:');
  console.log('  docker login');
  console.log('  docker push --all-tags iwebercodes/swocker');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildAll().catch((error) => {
    console.error('Build failed:', error);
    process.exit(1);
  });
}
