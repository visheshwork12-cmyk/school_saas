// src/infrastructure/monitoring/user-behavior-analytics.js
import { logger } from "#utils/core/logger.js";
import { EventEmitter } from "events";

/**
 * User Behavior Analytics Platform
 * Comprehensive user behavior tracking and analysis for School ERP
 */
export class UserBehaviorAnalytics extends EventEmitter {
  constructor() {
    super();
    this.events = new Map();
    this.sessions = new Map();
    this.users = new Map();
    this.funnels = new Map();
    this.cohorts = new Map();
    this.segments = new Map();
    this.initializeAnalytics();
  }

  /**
   * Initialize behavior analytics
   */
  initializeAnalytics() {
    this.setupDefaultFunnels();
    this.setupDefaultSegments();
    this.setupEventProcessing();
  }

  /**
   * Setup default conversion funnels
   */
  setupDefaultFunnels() {
    // Student Onboarding Funnel
    this.createFunnel('STUDENT_ONBOARDING', {
      name: 'Student Onboarding',
      description: 'Student registration to first assignment completion',
      steps: [
        { name: 'Registration Started', event: 'student_registration_started' },
        { name: 'Profile Completed', event: 'student_profile_completed' },
        { name: 'First Login', event: 'user_login', conditions: { userType: 'student' } },
        { name: 'Course Enrolled', event: 'course_enrolled' },
        { name: 'First Assignment', event: 'assignment_submitted' }
      ],
      timeWindow: 7 * 24 * 60 * 60 * 1000, // 7 days
      conversionGoal: 0.8 // 80% conversion target
    });

    // Parent Engagement Funnel
    this.createFunnel('PARENT_ENGAGEMENT', {
      name: 'Parent Engagement',
      description: 'Parent registration to active engagement',
      steps: [
        { name: 'Registration', event: 'parent_registration_completed' },
        { name: 'First Login', event: 'user_login', conditions: { userType: 'parent' } },
        { name: 'Profile View', event: 'student_profile_viewed' },
        { name: 'Progress Check', event: 'student_progress_viewed' },
        { name: 'Teacher Communication', event: 'message_sent_to_teacher' }
      ],
      timeWindow: 14 * 24 * 60 * 60 * 1000, // 14 days
      conversionGoal: 0.6 // 60% conversion target
    });

    // Teacher Adoption Funnel
    this.createFunnel('TEACHER_ADOPTION', {
      name: 'Teacher Platform Adoption',
      description: 'Teacher onboarding to regular platform usage',
      steps: [
        { name: 'Account Created', event: 'teacher_account_created' },
        { name: 'First Login', event: 'user_login', conditions: { userType: 'teacher' } },
        { name: 'Class Setup', event: 'class_created' },
        { name: 'Assignment Created', event: 'assignment_created' },
        { name: 'Grade Entered', event: 'grades_entered' }
      ],
      timeWindow: 30 * 24 * 60 * 60 * 1000, // 30 days
      conversionGoal: 0.9 // 90% conversion target
    });
  }

  /**
   * Setup default user segments
   */
  setupDefaultSegments() {
    // Active Students Segment
    this.createSegment('ACTIVE_STUDENTS', {
      name: 'Active Students',
      description: 'Students who have logged in within the last 7 days',
      conditions: {
        userType: 'student',
        lastLogin: { within: 7 * 24 * 60 * 60 * 1000 },
        eventsCount: { min: 5 }
      }
    });

    // Engaged Parents Segment
    this.createSegment('ENGAGED_PARENTS', {
      name: 'Engaged Parents',
      description: 'Parents who regularly check their child\'s progress',
      conditions: {
        userType: 'parent',
        eventsCount: { min: 10, period: '30d' },
        eventTypes: ['student_progress_viewed', 'grades_viewed']
      }
    });

    // At-Risk Students Segment
    this.createSegment('AT_RISK_STUDENTS', {
      name: 'At-Risk Students',
      description: 'Students showing signs of disengagement',
      conditions: {
        userType: 'student',
        lastLogin: { olderThan: 7 * 24 * 60 * 60 * 1000 },
        assignmentSubmissionRate: { lessThan: 0.5 },
        gradeAverage: { lessThan: 70 }
      }
    });
  }

  /**
   * Setup event processing pipeline
   */
  setupEventProcessing() {
    // Process events in batches every 5 seconds
    setInterval(() => {
      this.processEventBatch();
    }, 5000);

    // Clean up old data daily
    setInterval(() => {
      this.cleanupOldData();
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Track user event
   */
  async trackEvent(eventData) {
    try {
      const event = this.enrichEvent(eventData);
      
      // Store event
      this.storeEvent(event);
      
      // Update session
      await this.updateSession(event);
      
      // Update user profile
      await this.updateUserProfile(event);
      
      // Process real-time analytics
      await this.processRealTimeAnalytics(event);
      
      // Emit event for real-time processing
      this.emit('eventTracked', event);
      
      logger.debug('Event tracked:', {
        eventType: event.eventType,
        userId: event.userId,
        timestamp: event.timestamp
      });

      return event;

    } catch (error) {
      logger.error('Failed to track event:', error);
      throw error;
    }
  }

  /**
   * Enrich event with additional context
   */
  enrichEvent(eventData) {
    const now = new Date();
    
    return {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      timestamp: now,
      eventType: eventData.eventType,
      userId: eventData.userId,
      sessionId: eventData.sessionId,
      tenantId: eventData.tenantId,
      
      // Event properties
      properties: {
        ...eventData.properties,
        page: eventData.page,
        referrer: eventData.referrer,
        userAgent: eventData.userAgent,
        ip: eventData.ip,
        country: eventData.country,
        device: eventData.device
      },
      
      // User context
      user: {
        type: eventData.userType,
        role: eventData.userRole,
        grade: eventData.userGrade,
        class: eventData.userClass,
        school: eventData.school
      },
      
      // Technical context
      technical: {
        platform: eventData.platform,
        browser: eventData.browser,
        browserVersion: eventData.browserVersion,
        screenResolution: eventData.screenResolution,
        viewport: eventData.viewport
      },
      
      // Derived properties
      derived: {
        hour: now.getHours(),
        dayOfWeek: now.getDay(),
        isWeekend: now.getDay() === 0 || now.getDay() === 6,
        isSchoolHours: this.isSchoolHours(now),
        timeZone: eventData.timeZone || 'UTC'
      }
    };
  }

  /**
   * Update user session
   */
  async updateSession(event) {
    const sessionId = event.sessionId;
    
    if (!this.sessions.has(sessionId)) {
      // Create new session
      this.sessions.set(sessionId, {
        id: sessionId,
        userId: event.userId,
        startTime: event.timestamp,
        lastActivity: event.timestamp,
        events: [],
        pages: new Set(),
        duration: 0,
        bounced: true,
        converted: false
      });
    }

    const session = this.sessions.get(sessionId);
    
    // Update session data
    session.lastActivity = event.timestamp;
    session.events.push(event.id);
    session.duration = event.timestamp - session.startTime;
    session.bounced = session.events.length === 1;
    
    if (event.properties.page) {
      session.pages.add(event.properties.page);
    }

    // Check for conversion events
    if (this.isConversionEvent(event)) {
      session.converted = true;
    }
  }

  /**
   * Update user profile with behavioral data
   */
  async updateUserProfile(event) {
    const userId = event.userId;
    
    if (!this.users.has(userId)) {
      // Create new user profile
      this.users.set(userId, {
        id: userId,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        totalEvents: 0,
        totalSessions: 0,
        totalPageviews: 0,
        averageSessionDuration: 0,
        bounceRate: 0,
        conversionRate: 0,
        
        // Behavioral patterns
        behavior: {
          mostActiveHour: null,
          mostActiveDayOfWeek: null,
          preferredDevice: null,
          engagementScore: 0,
          riskScore: 0
        },
        
        // Feature usage
        features: new Map(),
        
        // Academic data (for students)
        academic: {
          averageGrade: null,
          assignmentCompletionRate: null,
          attendanceRate: null,
          progressScore: null
        }
      });
    }

    const user = this.users.get(userId);
    
    // Update basic stats
    user.lastSeen = event.timestamp;
    user.totalEvents++;
    
    if (event.eventType === 'page_view') {
      user.totalPageviews++;
    }

    // Update behavioral patterns
    await this.updateBehavioralPatterns(user, event);
    
    // Update feature usage
    this.updateFeatureUsage(user, event);
    
    // Calculate engagement score
    user.behavior.engagementScore = this.calculateEngagementScore(user);
    
    // Calculate risk score
    user.behavior.riskScore = this.calculateRiskScore(user);
  }

  /**
   * Analyze user behavior patterns
   */
  async analyzeBehaviorPatterns(userId, timeRange = '30d') {
    try {
      const user = this.users.get(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      const cutoff = Date.now() - this.parseTimeRange(timeRange);
      const userEvents = this.getUserEvents(userId).filter(
        event => event.timestamp.getTime() > cutoff
      );

      const analysis = {
        userId,
        timeRange,
        generatedAt: new Date(),
        
        // Activity patterns
        activity: {
          totalEvents: userEvents.length,
          uniqueDays: this.getUniqueDays(userEvents),
          averageEventsPerDay: 0,
          mostActiveHour: this.getMostActiveHour(userEvents),
          mostActiveDay: this.getMostActiveDay(userEvents),
          activityDistribution: this.getActivityDistribution(userEvents)
        },
        
        // Navigation patterns
        navigation: {
          topPages: this.getTopPages(userEvents),
          entryPages: this.getEntryPages(userEvents),
          exitPages: this.getExitPages(userEvents),
          averagePageDepth: this.getAveragePageDepth(userEvents),
          navigationFlow: this.getNavigationFlow(userEvents)
        },
        
        // Engagement metrics
        engagement: {
          score: user.behavior.engagementScore,
          sessionDuration: user.averageSessionDuration,
          bounceRate: user.bounceRate,
          returnVisitor: this.isReturningUser(user),
          engagementTrend: this.getEngagementTrend(userEvents)
        },
        
        // Feature adoption
        features: {
          adopted: Array.from(user.features.keys()),
          mostUsed: this.getMostUsedFeatures(user),
          adoptionTimeline: this.getFeatureAdoptionTimeline(userEvents),
          stickiness: this.getFeatureStickiness(user)
        },
        
        // Risk assessment
        risk: {
          score: user.behavior.riskScore,
          factors: this.getRiskFactors(user, userEvents),
          recommendations: this.getRiskMitigationRecommendations(user)
        }
      };

      // Calculate derived metrics
      analysis.activity.averageEventsPerDay = analysis.activity.uniqueDays > 0 
        ? analysis.activity.totalEvents / analysis.activity.uniqueDays 
        : 0;

      return analysis;

    } catch (error) {
      logger.error(`Failed to analyze behavior patterns for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Analyze funnel performance
   */
  async analyzeFunnel(funnelId, timeRange = '30d') {
    try {
      const funnel = this.funnels.get(funnelId);
      if (!funnel) {
        throw new Error(`Funnel ${funnelId} not found`);
      }

      const cutoff = Date.now() - this.parseTimeRange(timeRange);
      const analysis = {
        funnelId,
        name: funnel.name,
        timeRange,
        generatedAt: new Date(),
        
        steps: [],
        overall: {
          totalUsers: 0,
          completed: 0,
          conversionRate: 0,
          averageTimeToConvert: 0,
          dropOffPoints: []
        },
        
        segments: {},
        trends: {}
      };

      // Get all users who started the funnel
      const startingUsers = this.getUsersWhoTriggeredEvent(
        funnel.steps[0].event, 
        funnel.steps[0].conditions, 
        cutoff
      );

      analysis.overall.totalUsers = startingUsers.length;

      // Analyze each step
      let previousStepUsers = startingUsers;
      
      for (let i = 0; i < funnel.steps.length; i++) {
        const step = funnel.steps[i];
        const stepUsers = this.getUsersWhoCompletedStep(
          previousStepUsers, 
          step, 
          funnel.timeWindow, 
          i === 0 ? cutoff : null
        );

        const stepAnalysis = {
          stepIndex: i,
          stepName: step.name,
          event: step.event,
          usersEntering: previousStepUsers.length,
          usersCompleting: stepUsers.length,
          conversionRate: previousStepUsers.length > 0 
            ? (stepUsers.length / previousStepUsers.length) * 100 
            : 0,
          dropOff: previousStepUsers.length - stepUsers.length,
          averageTimeToComplete: this.getAverageTimeToComplete(stepUsers, step, i === 0 ? cutoff : null)
        };

        analysis.steps.push(stepAnalysis);
        previousStepUsers = stepUsers;
      }

      // Calculate overall metrics
      analysis.overall.completed = previousStepUsers.length;
      analysis.overall.conversionRate = startingUsers.length > 0 
        ? (previousStepUsers.length / startingUsers.length) * 100 
        : 0;

      // Identify major drop-off points
      analysis.overall.dropOffPoints = analysis.steps
        .filter(step => step.conversionRate < 50)
        .map(step => ({
          step: step.stepName,
          conversionRate: step.conversionRate,
          usersLost: step.dropOff
        }));

      return analysis;

    } catch (error) {
      logger.error(`Failed to analyze funnel ${funnelId}:`, error);
      throw error;
    }
  }

  /**
   * Generate behavior insights and recommendations
   */
  async generateBehaviorInsights(options = {}) {
    try {
      const insights = {
        generatedAt: new Date(),
        timeRange: options.timeRange || '30d',
        
        // Overall metrics
        overview: {
          totalUsers: this.users.size,
          activeUsers: 0,
          newUsers: 0,
          returningUsers: 0,
          averageEngagementScore: 0,
          atRiskUsers: 0
        },
        
        // Top insights
        insights: [],
        
        // Recommendations
        recommendations: [],
        
        // Segments performance
        segments: {},
        
        // Feature adoption
        features: {
          mostAdopted: [],
          leastAdopted: [],
          stickiest: []
        }
      };

      const cutoff = Date.now() - this.parseTimeRange(insights.timeRange);
      
      // Calculate overview metrics
      let totalEngagementScore = 0;
      let activeUsersCount = 0;
      let newUsersCount = 0;
      let atRiskCount = 0;

      for (const [userId, user] of this.users) {
        if (user.lastSeen.getTime() > cutoff) {
          activeUsersCount++;
        }
        
        if (user.firstSeen.getTime() > cutoff) {
          newUsersCount++;
        }
        
        totalEngagementScore += user.behavior.engagementScore;
        
        if (user.behavior.riskScore > 70) {
          atRiskCount++;
        }
      }

      insights.overview.activeUsers = activeUsersCount;
      insights.overview.newUsers = newUsersCount;
      insights.overview.returningUsers = activeUsersCount - newUsersCount;
      insights.overview.averageEngagementScore = this.users.size > 0 
        ? totalEngagementScore / this.users.size 
        : 0;
      insights.overview.atRiskUsers = atRiskCount;

      // Generate top insights
      insights.insights = await this.generateTopInsights(insights.overview, cutoff);
      
      // Generate recommendations
      insights.recommendations = await this.generateBehaviorRecommendations(insights);

      return insights;

    } catch (error) {
      logger.error('Failed to generate behavior insights:', error);
      throw error;
    }
  }

  // Helper methods
  storeEvent(event) {
    if (!this.events.has(event.userId)) {
      this.events.set(event.userId, []);
    }
    
    const userEvents = this.events.get(event.userId);
    userEvents.push(event);

    // Keep only last 10000 events per user
    if (userEvents.length > 10000) {
      userEvents.splice(0, userEvents.length - 10000);
    }
  }

  createFunnel(funnelId, config) {
    this.funnels.set(funnelId, config);
    logger.debug(`Funnel created: ${funnelId}`);
  }

  createSegment(segmentId, config) {
    this.segments.set(segmentId, config);
    logger.debug(`Segment created: ${segmentId}`);
  }

  isSchoolHours(date) {
    const hour = date.getHours();
    const dayOfWeek = date.getDay();
    return dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 8 && hour <= 16; // Mon-Fri, 8AM-4PM
  }

  isConversionEvent(event) {
    const conversionEvents = [
      'assignment_submitted',
      'course_completed',
      'grade_improved',
      'parent_teacher_meeting_scheduled'
    ];
    return conversionEvents.includes(event.eventType);
  }

  calculateEngagementScore(user) {
    // Simplified engagement score calculation
    let score = 0;
    
    // Frequency score (0-30 points)
    const daysSinceFirstSeen = (Date.now() - user.firstSeen.getTime()) / (1000 * 60 * 60 * 24);
    const eventsPerDay = daysSinceFirstSeen > 0 ? user.totalEvents / daysSinceFirstSeen : 0;
    score += Math.min(eventsPerDay * 2, 30);
    
    // Recency score (0-25 points)
    const daysSinceLastSeen = (Date.now() - user.lastSeen.getTime()) / (1000 * 60 * 60 * 24);
    score += Math.max(25 - daysSinceLastSeen, 0);
    
    // Session quality score (0-25 points)
    score += Math.min((1 - user.bounceRate) * 25, 25);
    
    // Feature adoption score (0-20 points)
    score += Math.min(user.features.size * 2, 20);
    
    return Math.round(score);
  }

  calculateRiskScore(user) {
    // Risk factors that indicate potential churn
    let riskScore = 0;
    
    const daysSinceLastSeen = (Date.now() - user.lastSeen.getTime()) / (1000 * 60 * 60 * 24);
    
    // Inactivity risk
    if (daysSinceLastSeen > 7) riskScore += 30;
    else if (daysSinceLastSeen > 3) riskScore += 15;
    
    // Low engagement risk
    if (user.behavior.engagementScore < 30) riskScore += 25;
    else if (user.behavior.engagementScore < 50) riskScore += 15;
    
    // High bounce rate risk
    if (user.bounceRate > 0.8) riskScore += 20;
    else if (user.bounceRate > 0.6) riskScore += 10;
    
    // Academic performance risk (for students)
    if (user.academic.averageGrade && user.academic.averageGrade < 70) riskScore += 25;
    
    return Math.min(riskScore, 100);
  }

  getUserEvents(userId) {
    return this.events.get(userId) || [];
  }

  parseTimeRange(timeRange) {
    const units = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
    const match = timeRange.match(/^(\d+)([dhms])$/);
    return match ? parseInt(match[1]) * units[match[2]] : 86400000;
  }

  async processEventBatch() {
    // Process any pending analytics calculations
    // This would handle batch processing of events for performance
  }

  async cleanupOldData() {
    const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000); // 90 days
    
    // Clean up old events
    for (const [userId, userEvents] of this.events) {
      const filteredEvents = userEvents.filter(event => event.timestamp.getTime() > cutoff);
      if (filteredEvents.length < userEvents.length) {
        this.events.set(userId, filteredEvents);
      }
    }
    
    // Clean up old sessions
    for (const [sessionId, session] of this.sessions) {
      if (session.lastActivity.getTime() < cutoff) {
        this.sessions.delete(sessionId);
      }
    }

    logger.debug('Old analytics data cleaned up');
  }

  // Additional helper methods for analysis
  getUniqueDays(events) {
    const days = new Set();
    events.forEach(event => {
      const day = new Date(event.timestamp).toDateString();
      days.add(day);
    });
    return days.size;
  }

  getMostActiveHour(events) {
    const hourCounts = {};
    events.forEach(event => {
      const hour = event.timestamp.getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    
    return Object.entries(hourCounts).reduce((max, [hour, count]) => 
      count > max.count ? { hour: parseInt(hour), count } : max, 
      { hour: 0, count: 0 }
    ).hour;
  }

  getMostActiveDay(events) {
    const dayCounts = {};
    events.forEach(event => {
      const day = event.timestamp.getDay();
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });
    
    return Object.entries(dayCounts).reduce((max, [day, count]) => 
      count > max.count ? { day: parseInt(day), count } : max, 
      { day: 0, count: 0 }
    ).day;
  }

  getUsersWhoTriggeredEvent(eventType, conditions, since) {
    const users = [];
    
    for (const [userId, userEvents] of this.events) {
      const matchingEvents = userEvents.filter(event => 
        event.eventType === eventType && 
        event.timestamp.getTime() > since &&
        this.matchesConditions(event, conditions)
      );
      
      if (matchingEvents.length > 0) {
        users.push(userId);
      }
    }
    
    return users;
  }

  getUsersWhoCompletedStep(users, step, timeWindow, since) {
    return users.filter(userId => {
      const userEvents = this.getUserEvents(userId);
      return userEvents.some(event => 
        event.eventType === step.event &&
        (!since || event.timestamp.getTime() > since) &&
        this.matchesConditions(event, step.conditions)
      );
    });
  }

  matchesConditions(event, conditions) {
    if (!conditions) return true;
    
    for (const [key, value] of Object.entries(conditions)) {
      if (event.user[key] !== value && event.properties[key] !== value) {
        return false;
      }
    }
    
    return true;
  }

  async generateTopInsights(overview, cutoff) {
    const insights = [];
    
    // New user growth insight
    if (overview.newUsers > 0) {
      const growthRate = (overview.newUsers / overview.totalUsers) * 100;
      insights.push({
        type: 'USER_GROWTH',
        title: 'New User Growth',
        description: `${overview.newUsers} new users joined (${growthRate.toFixed(1)}% of total users)`,
        impact: growthRate > 20 ? 'HIGH' : growthRate > 10 ? 'MEDIUM' : 'LOW',
        trend: 'POSITIVE'
      });
    }
    
    // At-risk users insight
    if (overview.atRiskUsers > 0) {
      const riskRate = (overview.atRiskUsers / overview.totalUsers) * 100;
      insights.push({
        type: 'AT_RISK_USERS',
        title: 'Users at Risk',
        description: `${overview.atRiskUsers} users are at risk of churning (${riskRate.toFixed(1)}% of total)`,
        impact: riskRate > 15 ? 'HIGH' : riskRate > 5 ? 'MEDIUM' : 'LOW',
        trend: 'NEGATIVE'
      });
    }
    
    return insights;
  }

  async generateBehaviorRecommendations(insights) {
    const recommendations = [];
    
    // At-risk users recommendation
    if (insights.overview.atRiskUsers > 0) {
      recommendations.push({
        type: 'REDUCE_CHURN',
        priority: 'HIGH',
        title: 'Engage At-Risk Users',
        description: `${insights.overview.atRiskUsers} users are at risk of churning`,
        actions: [
          'Send personalized re-engagement emails',
          'Offer additional support or tutorials',
          'Provide incentives to increase engagement'
        ]
      });
    }
    
    // Low engagement recommendation
    if (insights.overview.averageEngagementScore < 50) {
      recommendations.push({
        type: 'IMPROVE_ENGAGEMENT',
        priority: 'MEDIUM',
        title: 'Improve Overall Engagement',
        description: `Average engagement score is ${insights.overview.averageEngagementScore.toFixed(1)}`,
        actions: [
          'Implement gamification features',
          'Improve onboarding process',
          'Add more interactive elements'
        ]
      });
    }
    
    return recommendations;
  }
}

// Export singleton instance
export const userBehaviorAnalytics = new UserBehaviorAnalytics();
