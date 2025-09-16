// Jaeger tracing integration for School ERP SaaS
import { initTracer } from 'jaeger-client';
import opentracing from 'opentracing';

// Initialize Jaeger tracer
const config = {
  serviceName: 'school-erp-api',
  sampler: {
    type: 'const',
    param: process.env.NODE_ENV === 'production' ? 0.1 : 1,
  },
  reporter: {
    agentHost: process.env.JAEGER_AGENT_HOST || 'jaeger-agent.monitoring.svc.cluster.local',
    agentPort: process.env.JAEGER_AGENT_PORT || 6832,
    logSpans: process.env.NODE_ENV === 'development',
  },
};

const tracer = initTracer(config);
opentracing.initGlobalTracer(tracer);

export const tracingMiddleware = (req, res, next) => {
  const span = tracer.startSpan(`${req.method} ${req.path}`);
  
  // Add metadata
  span.setTag('http.method', req.method);
  span.setTag('http.url', req.url);
  span.setTag('tenant.id', req.tenant?.id || 'unknown');
  span.setTag('user.id', req.user?.id || 'anonymous');
  
  // Store span in request context
  req.span = span;
  
  // End span when response finishes
  res.on('finish', () => {
    span.setTag('http.status_code', res.statusCode);
    if (res.statusCode >= 400) {
      span.setTag('error', true);
    }
    span.finish();
  });
  
  next();
};
