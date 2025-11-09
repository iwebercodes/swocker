import { describe, it, expect } from 'vitest';
import { getDocker, pullImage } from './helpers/docker.js';
import fs from 'fs';

describe('Test Infrastructure', () => {
  it('can connect to Docker daemon', async () => {
    const docker = getDocker();
    const info = await docker.info();
    expect(info).toBeDefined();
    expect(info.ServerVersion).toBeDefined();
    console.log(`Connected to Docker ${info.ServerVersion}`);
  });

  it('can pull test image', async () => {
    const docker = getDocker();
    const testImage = 'hello-world:latest';

    await pullImage(testImage);

    const images = await docker.listImages();
    const found = images.some((img) => img.RepoTags?.includes(testImage));
    expect(found).toBe(true);
  }, 60000); // 60 second timeout for pulling

  it('can create and remove a test container', async () => {
    const docker = getDocker();

    // Ensure hello-world image is available
    await pullImage('hello-world:latest');

    // Create container
    const container = await docker.createContainer({
      Image: 'hello-world:latest',
    });

    expect(container).toBeDefined();
    expect(container.id).toBeDefined();

    // Remove container
    await container.remove({ force: true });

    // Verify removed
    const containers = await docker.listContainers({ all: true });
    const found = containers.some((c) => c.Id === container.id);
    expect(found).toBe(false);
  }, 30000);

  it('test fixtures directory exists', () => {
    expect(fs.existsSync('tests/fixtures')).toBe(true);
  });

  it('test helpers directory exists', () => {
    expect(fs.existsSync('tests/helpers')).toBe(true);
    expect(fs.existsSync('tests/helpers/docker.ts')).toBe(true);
    expect(fs.existsSync('tests/helpers/wait.ts')).toBe(true);
  });
});
