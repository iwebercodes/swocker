import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as yaml from 'yaml';

interface WorkflowStep {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  steps?: WorkflowStep[];
}

describe('CI Configuration', () => {
  it('GitHub Actions release workflow is valid YAML', () => {
    const workflow = '.github/workflows/release.yml';

    expect(fs.existsSync(workflow)).toBe(true);
    const content = fs.readFileSync(workflow, 'utf-8');
    expect(() => yaml.parse(content)).not.toThrow();
  });

  it('release workflow has all required test jobs', () => {
    const workflow = yaml.parse(fs.readFileSync('.github/workflows/release.yml', 'utf-8'));

    expect(workflow.jobs).toBeDefined();
    expect(workflow.jobs.lint).toBeDefined();
    expect(workflow.jobs['unit-tests']).toBeDefined();
    expect(workflow.jobs['integration-tests']).toBeDefined();
    expect(workflow.jobs['e2e-tests']).toBeDefined();
  });

  it('release workflow runs integration tests in matrix', () => {
    const workflow = yaml.parse(fs.readFileSync('.github/workflows/release.yml', 'utf-8'));

    const integrationTests = workflow.jobs['integration-tests'];
    expect(integrationTests.strategy.matrix).toBeDefined();
    expect(integrationTests.strategy.matrix.test).toBeInstanceOf(Array);
    expect(integrationTests.strategy.matrix.test.length).toBeGreaterThan(0);
  });

  it('release workflow runs e2e tests in matrix', () => {
    const workflow = yaml.parse(fs.readFileSync('.github/workflows/release.yml', 'utf-8'));

    const e2eTests = workflow.jobs['e2e-tests'];
    expect(e2eTests.strategy.matrix).toBeDefined();
    expect(e2eTests.strategy.matrix.test).toBeInstanceOf(Array);
    expect(e2eTests.strategy.matrix.test.length).toBeGreaterThan(0);
  });

  it('release workflow uses build matrix', () => {
    const workflow = yaml.parse(fs.readFileSync('.github/workflows/release.yml', 'utf-8'));

    expect(workflow.jobs['generate-matrix']).toBeDefined();
    expect(workflow.jobs.publish).toBeDefined();
    expect(workflow.jobs.publish.needs).toContain('generate-matrix');
    expect(workflow.jobs.publish.strategy).toBeDefined();
  });

  it('release workflow generates matrix after all tests pass', () => {
    const workflow = yaml.parse(fs.readFileSync('.github/workflows/release.yml', 'utf-8'));

    const matrixJob = workflow.jobs['generate-matrix'];
    expect(matrixJob.needs).toBeDefined();
    expect(matrixJob.needs).toContain('lint');
    expect(matrixJob.needs).toContain('unit-tests');
    expect(matrixJob.needs).toContain('integration-tests');
    expect(matrixJob.needs).toContain('e2e-tests');
  });

  it('release workflow builds all variants', () => {
    const workflow = yaml.parse(fs.readFileSync('.github/workflows/release.yml', 'utf-8'));

    const publishJob = workflow.jobs.publish;
    expect(publishJob.strategy.matrix).toBeDefined();

    // Build step should use build-push-action
    const buildStep = publishJob.steps.find((s: { uses?: string }) =>
      s.uses?.includes('docker/build-push-action')
    );
    expect(buildStep).toBeDefined();
    expect(buildStep.with['build-args']).toContain('SHOPWARE_VERSION');
    expect(buildStep.with['build-args']).toContain('DEFAULT_PHP_VERSION');
  });

  it('release workflow pushes to Docker Hub', () => {
    const workflow = yaml.parse(fs.readFileSync('.github/workflows/release.yml', 'utf-8'));

    expect(workflow.jobs.publish).toBeDefined();

    const steps = workflow.jobs.publish.steps;

    // Should have login step
    const loginStep = steps.find((s: { uses?: string }) => s.uses?.includes('docker/login-action'));
    expect(loginStep).toBeDefined();

    // Should have build-push step with push: true
    const buildStep = steps.find((s: { uses?: string }) =>
      s.uses?.includes('docker/build-push-action')
    );
    expect(buildStep).toBeDefined();
    expect(buildStep.with.push).toBe(true);
  });

  it('release workflow uses matrix generation', () => {
    const workflow = yaml.parse(fs.readFileSync('.github/workflows/release.yml', 'utf-8'));

    expect(workflow.jobs['generate-matrix']).toBeDefined();
    expect(workflow.jobs.publish).toBeDefined();
    expect(workflow.jobs.publish.needs).toContain('generate-matrix');
  });

  it('release workflow triggers on version tags', () => {
    const releaseWorkflow = yaml.parse(fs.readFileSync('.github/workflows/release.yml', 'utf-8'));

    // Release workflow should run on version tags
    expect(releaseWorkflow.on.push).toBeDefined();
    expect(releaseWorkflow.on.push.tags).toBeDefined();
    expect(releaseWorkflow.on.push.tags).toContain('v*.*.*');
  });

  it('release workflow uses cache for dependencies', () => {
    const workflow = yaml.parse(fs.readFileSync('.github/workflows/release.yml', 'utf-8'));

    // Find jobs that install npm dependencies
    Object.values(workflow.jobs as Record<string, WorkflowJob>).forEach((job) => {
      const npmInstallStep = job.steps?.find((s) => s.run?.includes('npm ci'));

      if (npmInstallStep) {
        // Should have a setup-node step with cache before it
        const setupNodeStep = job.steps?.find((s) => s.uses?.includes('actions/setup-node'));
        expect(setupNodeStep).toBeDefined();
        expect(setupNodeStep?.with?.cache).toBe('npm');
      }
    });
  });

  it('release workflow uses Docker caching', () => {
    const workflow = yaml.parse(fs.readFileSync('.github/workflows/release.yml', 'utf-8'));

    // Find build-push-action steps
    Object.values(workflow.jobs as Record<string, WorkflowJob>).forEach((job) => {
      const buildStep = job.steps?.find((s) => s.uses?.includes('docker/build-push-action'));

      if (buildStep) {
        expect(buildStep.with?.['cache-from']).toBeDefined();
        expect(buildStep.with?.['cache-to']).toBeDefined();
      }
    });
  });
});
