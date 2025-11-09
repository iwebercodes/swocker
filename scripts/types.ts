/**
 * Type definitions for Swocker version management
 */

/**
 * A single Shopware version with metadata
 */
export interface ShopwareVersion {
  /** Version number (e.g., "6.7.0.0") */
  version: string;

  /** Compatible PHP versions (e.g., ["8.2", "8.3"]) */
  php: string[];

  /** Default PHP version for this Shopware version (e.g., "8.3") */
  defaultPhp: string;

  /** Download URL for this Shopware version */
  downloadUrl: string;

  /** Release date (ISO 8601 format) */
  releaseDate?: string;

  /** Whether this is an LTS version */
  lts?: boolean;

  /** Additional notes about this version */
  notes?: string;
}

/**
 * Collection of all Shopware versions
 */
export interface VersionsData {
  /** Last updated timestamp */
  lastUpdated: string;

  /** Array of Shopware versions */
  versions: ShopwareVersion[];
}

/**
 * Build variant type
 */
export type BuildVariant = 'dev' | 'prod' | 'ci' | 'dev-nginx' | 'prod-nginx';

/**
 * Web server type
 */
export type WebServer = 'apache' | 'nginx';

/**
 * Build matrix entry for CI/CD
 */
export interface BuildMatrixEntry {
  /** Shopware version */
  shopware: string;

  /** PHP version */
  php: string;

  /** Default PHP version for this build */
  defaultPhp: string;

  /** Build variant */
  variant: BuildVariant;

  /** Web server */
  webServer: WebServer;

  /** Generated image tag */
  tag: string;
}

/**
 * Complete build matrix
 */
export interface BuildMatrix {
  /** Array of build configurations */
  include: BuildMatrixEntry[];
}
