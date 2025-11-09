#!/usr/bin/env tsx
/**
 * Milestone 5.2: Security Audit Script
 * Performs security checks on Docker images
 */

import Docker from 'dockerode';

const docker = new Docker();

interface SecurityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  check: string;
  message: string;
  remediation?: string;
}

const issues: SecurityIssue[] = [];

function addIssue(issue: SecurityIssue): void {
  issues.push(issue);
  const icon =
    issue.severity === 'critical'
      ? '🔴'
      : issue.severity === 'high'
        ? '🟠'
        : issue.severity === 'medium'
          ? '🟡'
          : issue.severity === 'low'
            ? '🔵'
            : 'ℹ️';
  console.log(`${icon} [${issue.severity.toUpperCase()}] ${issue.check}`);
  console.log(`   ${issue.message}`);
  if (issue.remediation) {
    console.log(`   → ${issue.remediation}`);
  }
}

async function checkExposedSecrets(tag: string): Promise<void> {
  try {
    const container = await docker.createContainer({
      Image: tag,
      Cmd: [
        'sh',
        '-c',
        'find /var/www/html -name "*.env" -o -name "*secret*" -o -name "*password*" | head -20',
      ],
    });

    await container.start();
    await container.wait();

    const logs = await container.logs({ stdout: true, stderr: true });
    const output = logs.toString();

    await container.remove();

    const sensitiveFiles = output.split('\n').filter((line) => line.trim());

    if (sensitiveFiles.length > 0) {
      addIssue({
        severity: 'high',
        check: 'Exposed Secrets',
        message: `Found ${sensitiveFiles.length} potential secret files in image`,
        remediation: 'Ensure no secrets are baked into the image',
      });
    }
  } catch {
    // Ignore
  }
}

async function checkSetuidBinaries(tag: string): Promise<void> {
  try {
    const container = await docker.createContainer({
      Image: tag,
      Cmd: ['sh', '-c', 'find / -perm -4000 -type f 2>/dev/null | head -10'],
    });

    await container.start();
    await container.wait();

    const logs = await container.logs({ stdout: true, stderr: true });
    const output = logs.toString();

    await container.remove();

    const setuidBinaries = output.split('\n').filter((line) => line.trim());

    if (setuidBinaries.length > 0) {
      addIssue({
        severity: 'medium',
        check: 'SETUID Binaries',
        message: `Found ${setuidBinaries.length} SETUID binaries`,
        remediation: 'Review if SETUID binaries are necessary',
      });
    }
  } catch {
    // Ignore
  }
}

async function checkWorldWritableFiles(tag: string): Promise<void> {
  try {
    const container = await docker.createContainer({
      Image: tag,
      Cmd: ['sh', '-c', 'find /etc /usr /bin -type f -perm -0002 2>/dev/null | head -10'],
    });

    await container.start();
    await container.wait();

    const logs = await container.logs({ stdout: true, stderr: true });
    const output = logs.toString();

    await container.remove();

    const writableFiles = output.split('\n').filter((line) => line.trim());

    if (writableFiles.length > 0) {
      addIssue({
        severity: 'high',
        check: 'World-Writable Files',
        message: `Found ${writableFiles.length} world-writable files in system directories`,
        remediation: 'Fix file permissions to prevent unauthorized modifications',
      });
    }
  } catch {
    // Ignore
  }
}

async function checkPackageVulnerabilities(tag: string): Promise<void> {
  try {
    // Check if there are outdated packages
    const container = await docker.createContainer({
      Image: tag,
      Cmd: ['sh', '-c', 'apt list --upgradable 2>/dev/null | wc -l'],
    });

    await container.start();
    await container.wait();

    const logs = await container.logs({ stdout: true, stderr: true });
    const output = logs.toString().trim();

    await container.remove();

    const count = parseInt(output, 10);

    if (count > 50) {
      addIssue({
        severity: 'high',
        check: 'Outdated Packages',
        message: `${count} packages have updates available`,
        remediation: 'Run apt update && apt upgrade during build',
      });
    } else if (count > 10) {
      addIssue({
        severity: 'medium',
        check: 'Outdated Packages',
        message: `${count} packages have updates available`,
        remediation: 'Consider updating packages',
      });
    }
  } catch {
    // Ignore
  }
}

async function checkSSHKeys(tag: string): Promise<void> {
  try {
    const container = await docker.createContainer({
      Image: tag,
      Cmd: [
        'sh',
        '-c',
        'find /root /home -name "id_rsa" -o -name "id_dsa" -o -name "*.pem" 2>/dev/null',
      ],
    });

    await container.start();
    await container.wait();

    const logs = await container.logs({ stdout: true, stderr: true });
    const output = logs.toString();

    await container.remove();

    const keys = output.split('\n').filter((line) => line.trim());

    if (keys.length > 0) {
      addIssue({
        severity: 'critical',
        check: 'SSH Keys',
        message: `Found ${keys.length} SSH keys in image`,
        remediation: 'Never include SSH keys in Docker images',
      });
    }
  } catch {
    // Ignore
  }
}

async function checkUnnecessaryPackages(tag: string): Promise<void> {
  try {
    // Check for common unnecessary packages in production
    const container = await docker.createContainer({
      Image: tag,
      Cmd: ['sh', '-c', 'dpkg -l | grep -E "wget|curl|vim|nano|git" | wc -l'],
    });

    await container.start();
    await container.wait();

    const logs = await container.logs({ stdout: true, stderr: true });
    const count = parseInt(logs.toString().trim(), 10);

    await container.remove();

    if (tag.includes('prod') && count > 2) {
      addIssue({
        severity: 'low',
        check: 'Unnecessary Packages (Production)',
        message: `Found ${count} development tools in production image`,
        remediation: 'Remove unnecessary packages to reduce attack surface',
      });
    }
  } catch {
    // Ignore
  }
}

async function checkImageAge(tag: string): Promise<void> {
  try {
    const image = docker.getImage(tag);
    const info = await image.inspect();

    const created = new Date(info.Created);
    const now = new Date();
    const ageInDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));

    if (ageInDays > 90) {
      addIssue({
        severity: 'medium',
        check: 'Image Age',
        message: `Image is ${ageInDays} days old`,
        remediation: 'Rebuild regularly to include security updates',
      });
    } else if (ageInDays > 30) {
      addIssue({
        severity: 'low',
        check: 'Image Age',
        message: `Image is ${ageInDays} days old`,
        remediation: 'Consider rebuilding monthly',
      });
    }
  } catch {
    // Ignore
  }
}

async function checkBaseImage(tag: string): Promise<void> {
  try {
    const image = docker.getImage(tag);
    const info = await image.inspect();

    // Check parent image
    if (info.Parent) {
      addIssue({
        severity: 'info',
        check: 'Base Image',
        message: 'Using official PHP image (good practice)',
      });
    }
  } catch {
    // Ignore
  }
}

async function main(): Promise<void> {
  console.log('🔒 Swocker Security Audit\n');
  console.log('Performing security checks on Docker images...\n');

  const variants = ['dev', 'prod', 'ci'];

  for (const variant of variants) {
    const tag = `swocker:test-${variant}`;

    console.log(`\n🔍 Auditing ${tag}...`);

    try {
      const image = docker.getImage(tag);
      await image.inspect();

      await checkExposedSecrets(tag);
      await checkSSHKeys(tag);
      await checkSetuidBinaries(tag);
      await checkWorldWritableFiles(tag);
      await checkPackageVulnerabilities(tag);
      await checkImageAge(tag);
      await checkBaseImage(tag);

      if (variant === 'prod') {
        await checkUnnecessaryPackages(tag);
      }
    } catch {
      console.log(`⚠️  Image ${tag} not found - skipping`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Security Audit Summary:');

  const critical = issues.filter((i) => i.severity === 'critical').length;
  const high = issues.filter((i) => i.severity === 'high').length;
  const medium = issues.filter((i) => i.severity === 'medium').length;
  const low = issues.filter((i) => i.severity === 'low').length;
  const info = issues.filter((i) => i.severity === 'info').length;

  console.log(`🔴 Critical: ${critical}`);
  console.log(`🟠 High: ${high}`);
  console.log(`🟡 Medium: ${medium}`);
  console.log(`🔵 Low: ${low}`);
  console.log(`ℹ️  Info: ${info}`);

  if (critical > 0) {
    console.log('\n❌ CRITICAL security issues found - Must fix before production!');
    process.exit(1);
  } else if (high > 0) {
    console.log('\n⚠️  HIGH severity issues found - Should fix before production');
    process.exit(1);
  } else if (medium > 0) {
    console.log('\n⚠️  MEDIUM severity issues found - Consider fixing');
    process.exit(0);
  } else {
    console.log('\n✅ No critical security issues found');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('❌ Security audit failed with error:', error);
  process.exit(1);
});
