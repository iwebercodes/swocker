#!/usr/bin/env tsx

/**
 * Fetches available Shopware versions and generates versions.json
 * Queries Packagist API for shopware/production package versions
 */

import { $, chalk } from 'zx';
import axios from 'axios';
import fs from 'fs';
import type { VersionsData, ShopwareVersion } from './types.js';

$.verbose = false;

const PACKAGIST_API = 'https://repo.packagist.org/p2/shopware/production.json';
const MIN_VERSION = '6.7.0.0';

/**
 * Parse version string to comparable array
 */
function parseVersion(version: string): number[] {
  return version.split('.').map((n) => parseInt(n, 10));
}

/**
 * Compare two version strings
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const aParts = parseVersion(a);
  const bParts = parseVersion(b);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aVal = aParts[i] ?? 0;
    const bVal = bParts[i] ?? 0;

    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }

  return 0;
}

/**
 * Determine PHP versions compatible with a Shopware version
 * Based on Shopware 6 requirements
 */
function getPhpVersions(shopwareVersion: string): string[] {
  const parts = parseVersion(shopwareVersion);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;

  // Shopware 6.7+ requires PHP 8.2+
  if (major === 6 && minor >= 7) {
    return ['8.2', '8.3'];
  }

  // Shopware 6.6 supports PHP 8.1+
  if (major === 6 && minor >= 6) {
    return ['8.1', '8.2', '8.3'];
  }

  // Fallback
  return ['8.2', '8.3'];
}

/**
 * Generate download URL for a Shopware version
 */
function getDownloadUrl(version: string): string {
  // Use Shopware production template repository releases
  return `https://github.com/shopware/production/archive/refs/tags/v${version}.zip`;
}

/**
 * Fetch versions from Packagist
 */
async function fetchVersions(): Promise<ShopwareVersion[]> {
  console.log(chalk.blue('→ Fetching Shopware versions from Packagist...'));

  try {
    const response = await axios.get(PACKAGIST_API);
    const data = response.data;

    if (!data.packages?.['shopware/production']) {
      throw new Error('No shopware/production package found');
    }

    const packages = data.packages['shopware/production'];
    const versions: ShopwareVersion[] = [];

    // Packages is an array, iterate through it
    if (!Array.isArray(packages)) {
      throw new Error('Expected packages to be an array');
    }

    for (const packageData of packages) {
      const versionString = packageData.version as string;

      // Skip dev versions
      if (versionString.includes('dev') || versionString.includes('RC')) {
        continue;
      }

      // Extract version number (remove 'v' prefix if present)
      const version = versionString.replace(/^v/, '');

      // Validate version format (should be x.y.z.w)
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
        continue;
      }

      // Only include versions >= 6.7.0.0
      if (compareVersions(version, MIN_VERSION) < 0) {
        continue;
      }

      const phpVersions = getPhpVersions(version);
      versions.push({
        version,
        php: phpVersions,
        defaultPhp: phpVersions[phpVersions.length - 1] ?? '8.3',
        downloadUrl: getDownloadUrl(version),
        releaseDate: packageData.time as string,
      });
    }

    // Sort versions in descending order (newest first)
    versions.sort((a, b) => compareVersions(b.version, a.version));

    console.log(chalk.green(`✓ Found ${versions.length} versions >= ${MIN_VERSION}`));

    return versions;
  } catch (error) {
    console.error(chalk.red('Error fetching versions:'), error);
    throw error;
  }
}

/**
 * Generate versions.json
 */
async function generateVersionsJson(): Promise<void> {
  console.log(chalk.bold('\n📦 Shopware Version Fetcher\n'));

  const versions = await fetchVersions();

  const data: VersionsData = {
    lastUpdated: new Date().toISOString(),
    versions,
  };

  const outputPath = 'versions.json';
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

  console.log(chalk.green(`\n✓ Generated ${outputPath}`));
  console.log(chalk.gray(`  Latest version: ${versions[0]?.version}`));
  console.log(chalk.gray(`  Total versions: ${versions.length}`));
}

async function main(): Promise<void> {
  try {
    await generateVersionsJson();
  } catch (error) {
    console.error(chalk.red('\n❌ Failed to generate versions.json'));
    console.error(error);
    process.exit(1);
  }
}

main();
