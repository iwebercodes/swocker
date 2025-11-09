import { describe, it, expect } from 'vitest';
import { generateBuildMatrix } from '../../scripts/generate-matrix.js';
import versions from '../../versions.json';

describe('Build Matrix Generation', () => {
  it('generates valid matrix', () => {
    const matrix = generateBuildMatrix();

    expect(matrix).toBeDefined();
    expect(matrix.include).toBeInstanceOf(Array);
    expect(matrix.include.length).toBeGreaterThan(0);
  });

  it('includes all Shopware versions', () => {
    const matrix = generateBuildMatrix();
    const shopwareVersions = [...new Set(matrix.include.map((m) => m.shopware))];

    versions.versions.forEach((v) => {
      expect(shopwareVersions).toContain(v.version);
    });
  });

  it('includes default PHP version for each Shopware version', () => {
    const matrix = generateBuildMatrix();

    matrix.include.forEach((entry) => {
      const version = versions.versions.find((v) => v.version === entry.shopware);
      expect(entry.defaultPhp).toBe(version?.defaultPhp);
    });
  });

  it('includes all variants', () => {
    const matrix = generateBuildMatrix();
    const variants = [...new Set(matrix.include.map((m) => m.variant))];

    expect(variants).toContain('dev');
    expect(variants).toContain('prod');
    expect(variants).toContain('ci');
    expect(variants).toContain('dev-nginx');
    expect(variants).toContain('prod-nginx');
  });

  it('generates valid tags', () => {
    const matrix = generateBuildMatrix();

    matrix.include.forEach((entry) => {
      // Tag format: version-variant (e.g., 6.7.4.0-dev, 6.7.4.0-dev-nginx)
      expect(entry.tag).toMatch(/^\d+\.\d+\.\d+\.\d+-[\w-]+$/);
    });
  });

  it('matrix is GitHub Actions compatible', () => {
    const matrix = generateBuildMatrix();
    const json = JSON.stringify(matrix);

    // Should be valid JSON
    expect(() => JSON.parse(json)).not.toThrow();

    // Should have expected structure
    const parsed = JSON.parse(json);
    expect(parsed.include).toBeDefined();
  });

  it('generates expected number of combinations', () => {
    const matrix = generateBuildMatrix();

    // Each Shopware version should have 5 variants (dev, prod, ci, dev-nginx, prod-nginx)
    // Images include all supported PHP versions, selectable at runtime
    const expectedPerVersion = 5; // 5 variants
    const expectedTotal = versions.versions.length * expectedPerVersion;

    expect(matrix.include.length).toBe(expectedTotal);
  });

  it('each matrix entry has all required fields', () => {
    const matrix = generateBuildMatrix();

    matrix.include.forEach((entry) => {
      expect(entry.shopware).toBeDefined();
      expect(entry.defaultPhp).toBeDefined();
      expect(entry.variant).toBeDefined();
      expect(entry.tag).toBeDefined();
      expect(entry.isLatest).toBeDefined();

      expect(typeof entry.shopware).toBe('string');
      expect(typeof entry.defaultPhp).toBe('string');
      expect(typeof entry.variant).toBe('string');
      expect(typeof entry.tag).toBe('string');
      expect(typeof entry.isLatest).toBe('boolean');
    });
  });

  it('tags are unique', () => {
    const matrix = generateBuildMatrix();
    const tags = matrix.include.map((m) => m.tag);
    const uniqueTags = new Set(tags);

    expect(uniqueTags.size).toBe(tags.length);
  });

  it('marks latest Shopware version correctly', () => {
    const matrix = generateBuildMatrix();
    const latestVersion = versions.versions[0]?.version;

    expect(latestVersion).toBeDefined();

    matrix.include.forEach((entry) => {
      if (entry.shopware === latestVersion) {
        expect(entry.isLatest).toBe(true);
      } else {
        expect(entry.isLatest).toBe(false);
      }
    });
  });
});
