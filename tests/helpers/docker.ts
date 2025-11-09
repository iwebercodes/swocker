import Docker from 'dockerode';
import { waitFor } from './wait.js';

const docker = new Docker();

export interface ContainerConfig {
  Image: string;
  name?: string;
  Env?: string[];
  ExposedPorts?: Record<string, object>;
  HostConfig?: {
    PortBindings?: Record<string, Array<{ HostPort: string }>>;
    Tmpfs?: Record<string, string>;
    Binds?: string[];
    ExtraHosts?: string[];
    Memory?: number;
    ReadonlyRootfs?: boolean;
    NetworkMode?: string;
  };
}

/**
 * Get Docker client instance
 */
export function getDocker(): Docker {
  return docker;
}

/**
 * Pull a Docker image if not already available
 */
export async function pullImage(imageName: string): Promise<void> {
  const images = await docker.listImages();
  const imageExists = images.some((img) => img.RepoTags?.some((tag) => tag === imageName));

  if (!imageExists) {
    console.log(`Pulling image: ${imageName}`);
    await new Promise<void>((resolve, reject) => {
      docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) {
          reject(err);
          return;
        }

        docker.modem.followProgress(
          stream,
          (err: Error | null) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          },
          (event: { status?: string }) => {
            if (event.status) {
              console.log(event.status);
            }
          }
        );
      });
    });
  }
}

/**
 * Create and start a container
 */
export async function createContainer(config: ContainerConfig): Promise<Docker.Container> {
  const container = await docker.createContainer(config);
  await container.start();
  return container;
}

/**
 * Stop and remove a container
 */
export async function removeContainer(container: Docker.Container): Promise<void> {
  try {
    const info = await container.inspect();
    if (info.State.Running) {
      await container.stop({ t: 10 });
    }
  } catch (error) {
    // Container might already be stopped or removed - this is fine
    // Only log if it's not a "not found" error
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode !== 404) {
      console.log('Error stopping container:', error);
    }
  }

  try {
    await container.remove({ force: true });
  } catch (error) {
    // Container might already be removed - this is fine
    // Only log if it's not a "not found" error
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode !== 404) {
      console.error('Error removing container:', error);
    }
  }
}

/**
 * Cleanup multiple containers
 */
export async function cleanup(containers: Docker.Container[]): Promise<void> {
  for (const container of containers) {
    await removeContainer(container);
  }
}

/**
 * Clean up containers and networks by name (useful for test setup)
 */
export async function cleanupByName(
  containerNames: string[],
  networkNames: string[]
): Promise<void> {
  const docker = getDocker();

  // Remove containers
  for (const name of containerNames) {
    try {
      const container = docker.getContainer(name);
      await removeContainer(container);
    } catch {
      // Container doesn't exist - that's fine
    }
  }

  // Remove networks
  for (const name of networkNames) {
    try {
      const network = docker.getNetwork(name);
      await network.remove();
    } catch (error) {
      // Network doesn't exist or in use - that's fine
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode !== 404) {
        // Only log if it's not a "not found" error
        const message = 'message' in error ? String(error.message) : 'Unknown error';
        console.log(`Note: Could not remove network ${name}:`, message);
      }
    }
  }
}

/**
 * Get the host port for a container port
 */
export async function getContainerPort(
  container: Docker.Container,
  containerPort: number
): Promise<number> {
  const info = await container.inspect();
  const portKey = `${containerPort}/tcp`;
  const portBindings = info.NetworkSettings.Ports[portKey];

  if (!portBindings || portBindings.length === 0) {
    throw new Error(`Port ${containerPort} not bound`);
  }

  return parseInt(portBindings[0]?.HostPort ?? '0', 10);
}

/**
 * Execute a command in a container and get output
 */
export async function execInContainer(container: Docker.Container, cmd: string[]): Promise<string> {
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({ hijack: true, stdin: false });

  return new Promise((resolve, reject) => {
    let output = '';

    stream.on('data', (chunk: Buffer) => {
      // Docker multiplexes stdout/stderr, first 8 bytes are header
      const data = chunk.slice(8).toString();
      output += data;
    });

    stream.on('end', () => {
      resolve(output.trim());
    });

    stream.on('error', reject);
  });
}

/**
 * Wait for a container to be healthy
 */
export async function waitForHealthy(
  container: Docker.Container,
  timeoutMs: number = 60000
): Promise<void> {
  await waitFor(
    async () => {
      const info = await container.inspect();
      return info.State.Health?.Status === 'healthy';
    },
    timeoutMs,
    1000,
    'Container health check'
  );
}

/**
 * Wait for a container to have specific log output
 */
export async function waitForLog(
  container: Docker.Container,
  pattern: string | RegExp,
  timeoutMs: number = 60000
): Promise<void> {
  await waitFor(
    async () => {
      const logs = await container.logs({ stdout: true, stderr: true });
      const logStr = logs.toString();

      if (typeof pattern === 'string') {
        return logStr.includes(pattern);
      } else {
        return pattern.test(logStr);
      }
    },
    timeoutMs,
    1000,
    `Log pattern: ${pattern}`
  );
}

/**
 * Create a Shopware container with standard configuration
 */
export async function createShopwareContainer(
  image: string,
  databaseHost: string,
  options: {
    phpVersion?: string;
    env?: Record<string, string>;
    network?: string;
    name?: string;
  } = {}
): Promise<Docker.Container> {
  const baseEnv = [
    'SHOPWARE_VERSION=6.7.4.0',
    `DATABASE_HOST=${databaseHost}`,
    'DATABASE_PORT=3306',
    'DATABASE_USER=root',
    'DATABASE_PASSWORD=test123',
    'DATABASE_NAME=shopware',
  ];

  // Add PHP_VERSION if specified
  if (options.phpVersion) {
    baseEnv.push(`PHP_VERSION=${options.phpVersion}`);
  }

  // Add additional environment variables
  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      baseEnv.push(`${key}=${value}`);
    }
  }

  const config: ContainerConfig = {
    Image: image,
    Env: baseEnv,
    HostConfig: {
      NetworkMode: options.network,
    },
  };

  if (options.name) {
    config.name = options.name;
  }

  return await createContainer(config);
}
