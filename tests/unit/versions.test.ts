import { describe, it, expect } from 'vitest';
import versions from '../../versions.json';
import type { VersionsData } from '../../scripts/types.js';

const versionsData = versions as VersionsData;

describe('Version Management', () => {
  it('versions.json exists and is valid JSON', () => {
    expect(versionsData).toBeDefined();
    expect(versionsData.versions).toBeInstanceOf(Array);
    expect(versionsData.lastUpdated).toBeDefined();
  });

  it('all versions are >= 6.7.0.0', () => {
    versionsData.versions.forEach((v) => {
      const parts = v.version.split('.').map(Number);
      const [major, minor] = parts;

      expect(major).toBe(6);
      expect(minor).toBeGreaterThanOrEqual(7);
    });
  });

  it('all versions have required fields', () => {
    versionsData.versions.forEach((v) => {
      expect(v.version).toBeDefined();
      expect(typeof v.version).toBe('string');

      expect(v.php).toBeInstanceOf(Array);
      expect(v.php.length).toBeGreaterThan(0);

      expect(v.downloadUrl).toBeDefined();
      expect(typeof v.downloadUrl).toBe('string');
      expect(v.downloadUrl).toMatch(/^https?:\/\//);
    });
  });

  it('PHP versions are valid', () => {
    versionsData.versions.forEach((v) => {
      v.php.forEach((php) => {
        expect(php).toMatch(/^8\.\d+$/);
        const phpVersion = parseFloat(php);
        expect(phpVersion).toBeGreaterThanOrEqual(8.1);
        expect(phpVersion).toBeLessThan(9.0);
      });
    });
  });

  it('versions follow semantic versioning format', () => {
    versionsData.versions.forEach((v) => {
      expect(v.version).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    });
  });

  it('download URLs follow expected pattern', () => {
    versionsData.versions.forEach((v) => {
      expect(v.downloadUrl).toContain(v.version);
      expect(v.downloadUrl).toMatch(
        /^https:\/\/github\.com\/shopware\/production\/archive\/refs\/tags\/v\d+\.\d+\.\d+\.\d+\.zip$/
      );
    });
  });

  it('versions are sorted in descending order', () => {
    for (let i = 0; i < versionsData.versions.length - 1; i++) {
      const current = versionsData.versions[i];
      const next = versionsData.versions[i + 1];

      if (!current || !next) continue;

      const currentParts = current.version.split('.').map(Number);
      const nextParts = next.version.split('.').map(Number);

      // Compare versions - current should be >= next
      let isGreaterOrEqual = false;
      for (let j = 0; j < 4; j++) {
        if ((currentParts[j] ?? 0) > (nextParts[j] ?? 0)) {
          isGreaterOrEqual = true;
          break;
        }
        if ((currentParts[j] ?? 0) < (nextParts[j] ?? 0)) {
          break;
        }
      }

      expect(isGreaterOrEqual).toBe(true);
    }
  });

  it('has at least one version', () => {
    expect(versionsData.versions.length).toBeGreaterThan(0);
  });

  it('lastUpdated is a valid ISO date', () => {
    expect(versionsData.lastUpdated).toBeDefined();
    const date = new Date(versionsData.lastUpdated);
    expect(date.toString()).not.toBe('Invalid Date');
    expect(versionsData.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('all versions have unique version strings', () => {
    const versionStrings = versionsData.versions.map((v) => v.version);
    const uniqueVersions = new Set(versionStrings);
    expect(uniqueVersions.size).toBe(versionStrings.length);
  });

  it('all versions have defaultPhp field', () => {
    versionsData.versions.forEach((v) => {
      expect(v.defaultPhp).toBeDefined();
      expect(typeof v.defaultPhp).toBe('string');
      expect(v.php).toContain(v.defaultPhp);
    });
  });

  it('defaultPhp is a valid version format', () => {
    versionsData.versions.forEach((v) => {
      expect(v.defaultPhp).toMatch(/^8\.\d+$/);
      const phpVersion = parseFloat(v.defaultPhp);
      expect(phpVersion).toBeGreaterThanOrEqual(8.1);
      expect(phpVersion).toBeLessThan(9.0);
    });
  });

  it('defaultPhp is in the list of supported PHP versions', () => {
    versionsData.versions.forEach((v) => {
      expect(v.php).toContain(v.defaultPhp);
    });
  });
});
