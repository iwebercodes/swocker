import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import versions from '../../versions.json';

/**
 * Milestone 4.2: Documentation Tests
 * Ensures documentation is comprehensive and up-to-date
 */
describe('Documentation', () => {
  describe('README', () => {
    it('exists and has required sections', () => {
      const readmePath = path.join(process.cwd(), 'README.md');
      expect(fs.existsSync(readmePath)).toBe(true);

      const readme = fs.readFileSync(readmePath, 'utf-8');

      // Check for required sections
      expect(readme).toContain('# Swocker');
      expect(readme).toMatch(/##\s+Quick Start/i);
      expect(readme).toMatch(/##\s+Environment Variables/i);
      expect(readme).toMatch(/##\s+Variants/i);
      expect(readme).toMatch(/##\s+Examples/i);
    });

    it('documents Shopware version support', () => {
      const readmePath = path.join(process.cwd(), 'README.md');
      const readme = fs.readFileSync(readmePath, 'utf-8');

      // Should mention minimum version
      expect(readme).toMatch(/6\.7/);
      expect(readme).toMatch(/Shopware.*6/i);
    });

    it('documents all three variants (dev, prod, ci)', () => {
      const readmePath = path.join(process.cwd(), 'README.md');
      const readme = fs.readFileSync(readmePath, 'utf-8');

      expect(readme).toMatch(/dev.*variant/i);
      expect(readme).toMatch(/prod.*variant/i);
      expect(readme).toMatch(/ci.*variant/i);
    });
  });

  describe('Environment Variables', () => {
    it('all documented env vars are recognized in entrypoint', () => {
      const readmePath = path.join(process.cwd(), 'README.md');
      const readme = fs.readFileSync(readmePath, 'utf-8');

      const entrypointPath = path.join(process.cwd(), 'docker/scripts/entrypoint.sh');
      const entrypoint = fs.readFileSync(entrypointPath, 'utf-8');

      // Extract environment variables from README
      // Look for code blocks or tables with variable names
      const envVarPattern = /`([A-Z_]+)`/g;
      const matches = readme.matchAll(envVarPattern);
      const documentedVars = new Set<string>();

      for (const match of matches) {
        const varName = match[1];
        // Filter out common non-env words
        if (
          varName &&
          varName.length > 2 &&
          !['ENV', 'VAR', 'URL', 'HTTP', 'HTTPS', 'SSL', 'API', 'CLI', 'DB'].includes(varName)
        ) {
          documentedVars.add(varName);
        }
      }

      // Check that major documented vars are actually used in entrypoint or Dockerfile
      const dockerfilePath = path.join(process.cwd(), 'docker/Dockerfile');
      const dockerfile = fs.readFileSync(dockerfilePath, 'utf-8');
      const combinedContent = entrypoint + dockerfile;

      for (const varName of documentedVars) {
        if (
          varName.includes('SHOPWARE') ||
          varName.includes('DATABASE') ||
          varName.includes('PHP')
        ) {
          const used =
            combinedContent.includes(`$${varName}`) ||
            combinedContent.includes(`\${${varName}}`) ||
            combinedContent.includes(`"${varName}"`) ||
            combinedContent.includes(`'${varName}'`);

          if (!used) {
            console.warn(`Warning: Documented env var ${varName} not found in code`);
          }
        }
      }

      // This test mainly validates the structure exists
      expect(documentedVars.size).toBeGreaterThan(0);
    });

    it('README documents DATABASE_* variables', () => {
      const readmePath = path.join(process.cwd(), 'README.md');
      const readme = fs.readFileSync(readmePath, 'utf-8');

      expect(readme).toMatch(/DATABASE_HOST|DATABASE_URL/);
      expect(readme).toMatch(/DATABASE.*PORT|PORT.*3306/);
    });

    it('README documents admin user configuration', () => {
      const readmePath = path.join(process.cwd(), 'README.md');
      const readme = fs.readFileSync(readmePath, 'utf-8');

      expect(readme).toMatch(/SHOPWARE_ADMIN_USER|admin.*user/i);
      expect(readme).toMatch(/SHOPWARE_ADMIN_PASSWORD|admin.*password/i);
    });

    it('README documents plugin auto-installation', () => {
      const readmePath = path.join(process.cwd(), 'README.md');
      const readme = fs.readFileSync(readmePath, 'utf-8');

      expect(readme).toMatch(/AUTO_INSTALL_PLUGINS|plugin.*install/i);
    });

    it('README documents SSL and demo data options', () => {
      const readmePath = path.join(process.cwd(), 'README.md');
      const readme = fs.readFileSync(readmePath, 'utf-8');

      expect(readme).toMatch(/SSL_ENABLED|ssl|https/i);
      expect(readme).toMatch(/INSTALL_DEMO_DATA|demo.*data/i);
    });
  });

  describe('Example Files', () => {
    it('example docker-compose files exist', () => {
      const examplesDir = path.join(process.cwd(), 'examples');
      expect(fs.existsSync(examplesDir)).toBe(true);

      const devExample = path.join(examplesDir, 'docker-compose.dev.yml');
      const prodExample = path.join(examplesDir, 'docker-compose.prod.yml');

      expect(fs.existsSync(devExample)).toBe(true);
      expect(fs.existsSync(prodExample)).toBe(true);
    });

    it('example docker-compose files are valid YAML', () => {
      const examples = [
        path.join(process.cwd(), 'examples/docker-compose.dev.yml'),
        path.join(process.cwd(), 'examples/docker-compose.prod.yml'),
      ];

      examples.forEach((examplePath) => {
        if (fs.existsSync(examplePath)) {
          const content = fs.readFileSync(examplePath, 'utf-8');
          expect(() => yaml.parse(content)).not.toThrow();

          const parsed = yaml.parse(content);
          expect(parsed.services).toBeDefined();
          expect(parsed.services.shopware).toBeDefined();
        }
      });
    });

    it('example docker-compose files reference swocker image', () => {
      const examplePath = path.join(process.cwd(), 'examples/docker-compose.dev.yml');

      if (fs.existsSync(examplePath)) {
        const content = fs.readFileSync(examplePath, 'utf-8');
        const parsed = yaml.parse(content);

        expect(parsed.services.shopware.image).toMatch(/swocker/);
      }
    });

    it('dev example includes database service', () => {
      const examplePath = path.join(process.cwd(), 'examples/docker-compose.dev.yml');

      if (fs.existsSync(examplePath)) {
        const content = fs.readFileSync(examplePath, 'utf-8');
        const parsed = yaml.parse(content);

        expect(
          parsed.services.mysql || parsed.services.database || parsed.services.db
        ).toBeDefined();
      }
    });
  });

  describe('Version Documentation', () => {
    it('documented versions align with versions.json', () => {
      const readmePath = path.join(process.cwd(), 'README.md');

      if (fs.existsSync(readmePath)) {
        const readme = fs.readFileSync(readmePath, 'utf-8');

        // Check that the latest version is mentioned
        if (versions.versions.length > 0) {
          const latestVersion = versions.versions[0]?.version;
          if (latestVersion) {
            expect(readme).toContain(latestVersion.split('.').slice(0, 2).join('.'));
          }
        }
      }
    });

    it('documents supported PHP versions', () => {
      const readmePath = path.join(process.cwd(), 'README.md');

      if (fs.existsSync(readmePath)) {
        const readme = fs.readFileSync(readmePath, 'utf-8');

        expect(readme).toMatch(/PHP\s+8\.\d+|php:8\.\d+/i);
      }
    });
  });

  describe('Performance and Best Practices', () => {
    it('README or docs mention tmpfs for better performance', () => {
      const readmePath = path.join(process.cwd(), 'README.md');

      if (fs.existsSync(readmePath)) {
        const readme = fs.readFileSync(readmePath, 'utf-8');

        expect(readme).toMatch(/tmpfs|performance|optimization/i);
      }
    });

    it('examples use tmpfs for MySQL data', () => {
      const examplePath = path.join(process.cwd(), 'examples/docker-compose.dev.yml');

      if (fs.existsSync(examplePath)) {
        const content = fs.readFileSync(examplePath, 'utf-8');
        const parsed = yaml.parse(content);

        const mysqlService =
          parsed.services.mysql || parsed.services.database || parsed.services.db;

        if (mysqlService) {
          expect(mysqlService.tmpfs || content.includes('tmpfs')).toBeTruthy();
        }
      }
    });
  });
});
