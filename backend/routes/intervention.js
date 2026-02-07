/**
 * Intervention Routes
 * Phase 6.2: INTERVENTION AUTHORITY FRAMEWORK
 * 
 * Admin-only endpoints for requesting and executing interventions.
 */

const express = require('express');
const router = express.Router();
const { assertInterventionAllowed, recordInterventionAttempt } = require('../security/interventionRegistry');
const { assertScopeAllowed } = require('../security/scopeRegistry');
const { assertAbuseAllowed } = require('../security/abuseGuard');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { adminLimiter } = require('../middleware/rateLimit');
const Intervention = require('../models/Intervention');
const { repairState } = require('../services/conversationState');
const { replayOutboundMessage } = require('../services/messageReplay');
const Logger = require('../services/logger');

const logger = new Logger('interventionRoutes');

/**
 * POST /api/admin/interventions/request
 * Request an intervention (does not execute)
 */
router.post('/request', 
  authenticate,
  authorize(['admin']),
  adminLimiter,
  async (req, res) => {
    const { type, correlationId, justification, context = {} } = req.body;
    const actor = 'admin';

    try {
      // Validate required fields
      if (!type || !correlationId || !justification) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Missing required fields: type, correlationId, justification'
          }
        });
      }

      // Assert intervention is allowed (validates type, actor, correlationId, justification)
      assertInterventionAllowed({
        type,
        actor,
        correlationId,
        justification,
        context: { ...context, endpoint: 'request' }
      });

      // Check if intervention would exceed cap
      const wouldExceed = await Intervention.wouldExceedCap(correlationId, type, 1);
      if (wouldExceed) {
        recordInterventionAttempt({
          type,
          actor,
          correlationId,
          justification,
          status: 'denied',
          context: { ...context, reason: 'CAP_EXCEEDED' }
        });

        return res.status(429).json({
          success: false,
          error: {
            message: `Intervention cap exceeded for ${type} on ${correlationId}`
          }
        });
      }

      // Create intervention record
      const intervention = new Intervention({
        type,
        correlationId,
        actor,
        justification,
        status: 'requested',
        metadata: { ...context, endpoint: 'request' }
      });

      await intervention.save();

      // Record audit event
      recordInterventionAttempt({
        type,
        actor,
        correlationId,
        justification,
        status: 'requested',
        context
      });

      res.status(201).json({
        success: true,
        data: {
          interventionId: intervention._id,
          type,
          correlationId,
          status: 'requested',
          createdAt: intervention.createdAt
        }
      });

    } catch (error) {
      logger.error('Intervention request failed', {
        error: error.message,
        code: error.code,
        type,
        correlationId,
        actor
      });

      // Record denial if due to validation
      if (error.code && error.code.startsWith('INTERVENTION_') || 
          error.code && error.code.startsWith('ACTOR_') ||
          error.code && error.code.startsWith('CORRELATION_') ||
          error.code && error.code.startsWith('JUSTIFICATION_')) {
        recordInterventionAttempt({
          type,
          actor,
          correlationId,
          justification,
          status: 'denied',
          context: { ...context, reason: error.code }
        });
      }

      res.status(400).json({
        success: false,
        error: {
          message: error.message,
          code: error.code
        }
      });
    }
  }
);

/**
 * POST /api/admin/interventions/execute
 * Execute an intervention (performs the actual intervention)
 */
router.post('/execute',
  authenticate,
  authorize(['admin']),
  adminLimiter,
  async (req, res) => {
    const { type, correlationId, justification, context = {} } = req.body;
    const actor = 'admin';

    try {
      // Validate required fields
      if (!type || !correlationId || !justification) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Missing required fields: type, correlationId, justification'
          }
        });
      }

      // Assert scope for intervention execution
      assertScopeAllowed({
        actionName: 'ADMIN_INTERVENTION_EXECUTE',
        actor,
        correlationId,
        context: { ...context, interventionType: type }
      });

      // Enforce abuse limits for intervention execution
      await assertAbuseAllowed({
        rule: 'interventions_per_correlation',
        key: correlationId,
        correlationId,
        actor,
        context: { ...context, interventionType: type }
      });

      // Assert intervention is allowed
      assertInterventionAllowed({
        type,
        actor,
        correlationId,
        justification,
        context: { ...context, endpoint: 'execute' }
      });

      // Find existing requested intervention or create new one
      let intervention = await Intervention.findOne({
        type,
        correlationId,
        status: 'requested'
      });

      if (!intervention) {
        // Check if we can create a new one (within caps)
        const wouldExceed = await Intervention.wouldExceedCap(correlationId, type, 1);
        if (wouldExceed) {
          recordInterventionAttempt({
            type,
            actor,
            correlationId,
            justification,
            status: 'denied',
            context: { ...context, reason: 'CAP_EXCEEDED' }
          });

          return res.status(429).json({
            success: false,
            error: {
              message: `Intervention cap exceeded for ${type} on ${correlationId}`
            }
          });
        }

        // Create new intervention record
        intervention = new Intervention({
          type,
          correlationId,
          actor,
          justification,
          status: 'executed',
          metadata: { ...context, endpoint: 'execute' }
        });
      } else {
        // Update existing intervention to executed
        intervention.status = 'executed';
        intervention.metadata = { ...intervention.metadata, ...context, endpoint: 'execute' };
      }

      // Perform the actual intervention based on type
      const result = await performIntervention({ type, correlationId, context });

      // Save the intervention record
      await intervention.save();

      // Record audit event
      recordInterventionAttempt({
        type,
        actor,
        correlationId,
        justification,
        status: 'executed',
        context: { ...context, result }
      });

      res.json({
        success: true,
        data: {
          interventionId: intervention._id,
          type,
          correlationId,
          status: 'executed',
          result,
          executedAt: intervention.updatedAt
        }
      });

    } catch (error) {
      logger.error('Intervention execution failed', {
        error: error.message,
        code: error.code,
        type,
        correlationId,
        actor
      });

      // Record denial if due to validation
      if (error.code && error.code.startsWith('INTERVENTION_') || 
          error.code && error.code.startsWith('ACTOR_') ||
          error.code && error.code.startsWith('CORRELATION_') ||
          error.code && error.code.startsWith('JUSTIFICATION_')) {
        recordInterventionAttempt({
          type,
          actor,
          correlationId,
          justification,
          status: 'denied',
          context: { ...context, reason: error.code }
        });
      }

      res.status(400).json({
        success: false,
        error: {
          message: error.message,
          code: error.code
        }
      });
    }
  }
);

/**
 * Perform the actual intervention based on type
 * @param {Object} params - Intervention parameters
 * @param {string} params.type - Intervention type
 * @param {string} params.correlationId - Correlation ID
 * @param {Object} params.context - Additional context
 * @returns {Object} Result of the intervention
 */
async function performIntervention({ type, correlationId, context }) {
  switch (type) {
    case 'RETRY_OVERRIDE':
      // Set a flag in Redis/context that allows one extra retry
      // This will be checked in the retry policy
      return { action: 'retry_override_granted', extraRetries: 1 };
    
    case 'STATE_REPAIR':
      // Perform state repair via intervention
      const { toState, phone } = context;
      if (!toState || !phone) {
        throw new Error('STATE_REPAIR requires toState and phone in context');
      }
      
      const Customer = require('../models/Customer');
      const customer = await Customer.findOne({ phone });
      if (!customer) {
        throw new Error('Customer not found for STATE_REPAIR');
      }
      
      const repairResult = await repairState({
        customer,
        toState,
        correlationId,
        actor: 'admin',
        justification: context.justification || 'Intervention state repair'
      });
      
      return { 
        action: 'state_repair_executed', 
        fromState: customer.conversationState?.currentStep || 'unknown',
        toState,
        phone 
      };
    
    case 'MESSAGE_REPLAY':
      // Perform message replay via intervention
      const replayResult = await replayOutboundMessage({
        correlationId,
        actor: 'admin',
        justification: context.justification || 'Intervention message replay'
      });
      
      return replayResult;
    
    default:
      throw new Error(`Unknown intervention type: ${type}`);
  }
}

module.exports = router;
