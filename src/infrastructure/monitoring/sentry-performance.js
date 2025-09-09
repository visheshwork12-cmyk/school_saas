import * as Sentry from '@sentry/node';
import { logger } from '#utils/core/logger.js';

/**
 * Performance monitoring for database operations
 */
export class SentryDatabaseMonitor {
  static wrapRepository(repository, repositoryName) {
    const originalMethods = {};
    
    ['find', 'findById', 'create', 'update', 'delete', 'aggregate'].forEach(method => {
      if (typeof repository[method] === 'function') {
        originalMethods[method] = repository[method].bind(repository);
        
        repository[method] = async (...args) => {
          return await Sentry.startSpan({
            name: `${repositoryName}.${method}`,
            op: 'db.query',
            data: {
              'db.system': 'mongodb',
              'db.operation': method,
              'db.collection.name': repositoryName,
            }
          }, async () => {
            try {
              const result = await originalMethods[method](...args);
              return result;
            } catch (error) {
              Sentry.captureException(error, {
                tags: {
                  'db.operation': method,
                  'db.collection': repositoryName,
                }
              });
              throw error;
            }
          });
        };
      }
    });
    
    return repository;
  }
}

/**
 * Performance monitoring for service layer
 */
export class SentryServiceMonitor {
  static wrapService(service, serviceName) {
    const prototype = Object.getPrototypeOf(service);
    const methods = Object.getOwnPropertyNames(prototype)
      .filter(name => name !== 'constructor' && typeof service[name] === 'function');
    
    methods.forEach(method => {
      const originalMethod = service[method].bind(service);
      
      service[method] = async (...args) => {
        return await Sentry.startSpan({
          name: `${serviceName}.${method}`,
          op: 'service.method',
          data: {
            'service.name': serviceName,
            'service.method': method,
          }
        }, async () => {
          try {
            const result = await originalMethod(...args);
            return result;
          } catch (error) {
            Sentry.captureException(error, {
              tags: {
                'service.name': serviceName,
                'service.method': method,
              }
            });
            throw error;
          }
        });
      };
    });
    
    return service;
  }
}

/**
 * Cache performance monitoring
 */
export function wrapCacheOperations(cacheService) {
  const originalGet = cacheService.get.bind(cacheService);
  const originalSet = cacheService.set.bind(cacheService);
  const originalDel = cacheService.del.bind(cacheService);

  cacheService.get = async (key) => {
    return await Sentry.startSpan({
      name: 'cache.get',
      op: 'cache.get',
      data: { 'cache.key': key }
    }, async () => {
      const result = await originalGet(key);
      Sentry.addBreadcrumb({
        category: 'cache',
        message: `Cache ${result ? 'hit' : 'miss'} for key: ${key}`,
        level: 'info',
        data: { key, hit: !!result }
      });
      return result;
    });
  };

  cacheService.set = async (key, value, ttl) => {
    return await Sentry.startSpan({
      name: 'cache.set',
      op: 'cache.set',
      data: { 'cache.key': key, 'cache.ttl': ttl }
    }, async () => {
      return await originalSet(key, value, ttl);
    });
  };

  cacheService.del = async (key) => {
    return await Sentry.startSpan({
      name: 'cache.delete',
      op: 'cache.delete',
      data: { 'cache.key': key }
    }, async () => {
      return await originalDel(key);
    });
  };

  return cacheService;
}
