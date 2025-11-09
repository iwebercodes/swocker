#!/usr/bin/env tsx

import versions from '../versions.json';

interface MatrixEntry {
  shopware: string;
  defaultPhp: string;
  variant: string;
  tag: string;
  isLatest: boolean;
}

interface BuildMatrix {
  include: MatrixEntry[];
}

/**
 * Generates a build matrix for all combinations of:
 * - Shopware versions
 * - Build variants (dev, prod, ci, dev-nginx, prod-nginx)
 *
 * Images include all supported PHP versions (selectable at runtime via env var)
 */
export function generateBuildMatrix(): BuildMatrix {
  const variants = ['dev', 'prod', 'ci', 'dev-nginx', 'prod-nginx'];
  const include: MatrixEntry[] = [];

  // Find latest Shopware version
  const latestShopware = versions.versions[0]?.version;

  if (!latestShopware) {
    throw new Error('No Shopware versions available');
  }

  for (const version of versions.versions) {
    for (const variant of variants) {
      include.push({
        shopware: version.version,
        defaultPhp: version.defaultPhp,
        variant: variant,
        tag: `${version.version}-${variant}`,
        isLatest: version.version === latestShopware,
      });
    }
  }

  return { include };
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const matrix = generateBuildMatrix();
  // Output as single-line JSON for GitHub Actions
  console.log(JSON.stringify(matrix));
}
