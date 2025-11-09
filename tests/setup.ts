import { pullImage } from './helpers/docker.js';
import { $ } from 'zx';

$.verbose = false;

/**
 * Global test setup - runs once before all tests
 * Ensures required Docker images are available
 */
export async function setup(): Promise<void> {
  console.log('Setting up test environment...');

  // Pull MySQL image if not available
  console.log('Pulling MySQL images...');
  await pullImage('mysql:8.0');
  await pullImage('mysql:8.1');
  await pullImage('mysql:8.2');
  await pullImage('mysql:8.3');
  await pullImage('mysql:8.4');

  // Build required swocker test images
  console.log('Building swocker test images...');

  // Build dev variant
  console.log('  Building swocker:test-dev...');
  await $`docker build -f docker/Dockerfile --target dev -t swocker:test-dev .`;

  // Build dev-nginx variant
  console.log('  Building swocker:test-nginx...');
  await $`docker build -f docker/Dockerfile --target dev-nginx -t swocker:test-nginx .`;

  // Build prod variant
  console.log('  Building swocker:test-prod...');
  await $`docker build -f docker/Dockerfile --target prod -t swocker:test-prod .`;

  // Build ci variant
  console.log('  Building swocker:test-ci...');
  await $`docker build -f docker/Dockerfile --target ci -t swocker:test-ci .`;

  console.log('Test environment ready');
}
