import * as Sentry from '@sentry/node';
import { execSync } from 'child_process';
import { logger } from '../../src/utils/core/logger.js';
import { config } from '../../src/shared/config/index.js';

/**
 * Create and manage Sentry releases
 */
export class SentryReleaseManager {
  constructor() {
    this.release = process.env.SENTRY_RELEASE || this.generateReleaseVersion();
    this.environment = process.env.SENTRY_ENVIRONMENT || config.env;
  }

  generateReleaseVersion() {
    try {
      const gitSha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
      const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
      return `${gitBranch}-${gitSha.substring(0, 8)}`;
    } catch (error) {
      logger.warn('Could not generate git-based release version:', error.message);
      return `manual-${Date.now()}`;
    }
  }

  async createRelease() {
    try {
      logger.info(`Creating Sentry release: ${this.release}`);

      // Create release
      const release = await Sentry.createRelease({
        version: this.release,
        projects: [process.env.SENTRY_PROJECT],
      });

      // Set release commits
      try {
        const commits = this.getCommitsSinceLastRelease();
        if (commits.length > 0) {
          await Sentry.setReleaseCommits(this.release, {
            commits: commits.map(commit => ({
              id: commit.sha,
              message: commit.message,
              author_email: commit.author_email,
              author_name: commit.author_name,
              timestamp: commit.timestamp,
            }))
          });
        }
      } catch (error) {
        logger.warn('Could not set release commits:', error.message);
      }

      logger.info(`Sentry release ${this.release} created successfully`);
      return release;
    } catch (error) {
      logger.error('Failed to create Sentry release:', error);
      throw error;
    }
  }

  async deployRelease() {
    try {
      logger.info(`Deploying Sentry release ${this.release} to ${this.environment}`);

      await Sentry.createDeploy({
        release: this.release,
        environment: this.environment,
        started_at: new Date().toISOString(),
      });

      logger.info(`Sentry release ${this.release} deployed to ${this.environment}`);
    } catch (error) {
      logger.error('Failed to deploy Sentry release:', error);
      throw error;
    }
  }

  async finalizeRelease() {
    try {
      logger.info(`Finalizing Sentry release: ${this.release}`);

      await Sentry.finalizeRelease(this.release);

      logger.info(`Sentry release ${this.release} finalized`);
    } catch (error) {
      logger.error('Failed to finalize Sentry release:', error);
      throw error;
    }
  }

  getCommitsSinceLastRelease() {
    try {
      const lastRelease = execSync(
        'git describe --tags --abbrev=0 HEAD~1', 
        { encoding: 'utf-8' }
      ).trim();
      
      const commitLog = execSync(
        `git log ${lastRelease}..HEAD --pretty=format:"%H|%s|%ae|%an|%ai"`,
        { encoding: 'utf-8' }
      );

      return commitLog.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [sha, message, author_email, author_name, timestamp] = line.split('|');
          return { sha, message, author_email, author_name, timestamp };
        });
    } catch (error) {
      logger.warn('Could not get commits since last release:', error.message);
      return [];
    }
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv}`) {
  const manager = new SentryReleaseManager();
  
  const command = process.argv;
  
  switch (command) {
    case 'create':
      await manager.createRelease();
      break;
    case 'deploy':
      await manager.deployRelease();
      break;
    case 'finalize':
      await manager.finalizeRelease();
      break;
    case 'full':
      await manager.createRelease();
      await manager.deployRelease();
      await manager.finalizeRelease();
      break;
    default:
      console.log('Usage: node sentry-release.js [create|deploy|finalize|full]');
  }
}
