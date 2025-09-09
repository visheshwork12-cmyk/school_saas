// Add this to your existing deployment script
import { SentryReleaseManager } from './sentry-release.js';

// Before deployment
const sentryRelease = new SentryReleaseManager();
await sentryRelease.createRelease();

// After successful deployment
await sentryRelease.deployRelease();
await sentryRelease.finalizeRelease();
