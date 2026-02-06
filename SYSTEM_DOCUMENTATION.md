# WhatsApp Restaurant Bot System Documentation

## 1. SYSTEM OVERVIEW

### Problem Solved
This system provides automated restaurant ordering through WhatsApp, enabling customers to browse menus, place orders, make payments, and receive status updates entirely within WhatsApp messaging. It eliminates the need for separate mobile apps or phone calls while providing restaurants with a complete order management system.

### Target Users
- **Primary**: Individual restaurants requiring their own WhatsApp automation system
- **Secondary**: Restaurant staff managing orders through admin dashboard
- **Tertiary**: End customers ordering via WhatsApp

### High-Level Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   WhatsApp      │    │   React Admin   │    │   Mobile App    │
│   Customers     │    │   Dashboard     │    │   (Optional)    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │     Express Backend      │
                    │   (Node.js + MongoDB)    │
                    └─────────────┬─────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
    ┌─────┴─────┐        ┌─────┴─────┐        ┌─────┴─────┐
    │   Meta    │        │  Razorpay │        │   Google  │
    │  WhatsApp │        │  Payment  │        │   Sheets  │
    │    API    │        │   Gateway │        │    API    │
    └───────────┘        └───────────┘        └───────────┘
```

### Single-Tenant Model
Each restaurant operates its own independent instance with:
- Dedicated WhatsApp Business API number
- Separate Meta Business account
- Individual payment gateway integration
- Isolated database and analytics
- Custom menu and branding

## 2. CORE FLOWS

### Customer-Initiated WhatsApp Order Flow

1. **Initial Contact**
   - Customer sends message to restaurant WhatsApp number
   - System receives webhook from Meta Cloud API
   - Conversation state initialized for phone number

2. **Menu Browsing**
   - AI-powered chatbot interprets customer intent
   - Menu categories presented via interactive WhatsApp messages
   - Customer selects items through button/list responses

3. **Cart Management**
   - Selected items added to customer's cart in database
   - Cart persists across conversation sessions
   - Quantity modifications and item removals supported

4. **Order Placement**
   - Service type selection (delivery/pickup/dine-in)
   - Address collection for delivery orders
   - Order confirmation with total amount

5. **Payment Processing**
   - Razorpay payment link generation for UPI orders
   - Cash on delivery option available
   - Payment status tracking via webhooks

6. **Order Confirmation**
   - Order ID generation and assignment
   - Kitchen notification via admin dashboard
   - Customer confirmation message with estimated time

### Order Status Updates
- **Preparing**: Kitchen starts order preparation
- **Ready**: Order ready for pickup/delivery dispatch
- **Out for Delivery**: Delivery partner assigned
- **Delivered**: Order completion confirmation
- **Cancelled**: Order cancellation with reason

### Failure & Retry Handling (High-Level)
- Transient failures (network, API timeouts) retry up to 2 times
- Policy failures (invalid numbers, content violations) never retry
- Exponential backoff: 10s (attempt 2), 60s (attempt 3)
- Failed jobs logged with correlation IDs for debugging

## 3. WHATSAPP MESSAGING MODEL

### Session Messages vs Template Messages
- **Session Messages**: Customer-initiated conversations, free-form responses
- **Template Messages**: Business-initiated, pre-approved templates only
- **24-Hour Window**: Session messages allowed within 24 hours of customer contact

### Customer-Initiated Messages
- Menu browsing requests
- Order placement and modifications
- Status inquiries
- Customer service interactions
- Payment confirmations

### Business-Initiated Messages
- Order status updates (preparing, ready, delivered)
- Payment reminders
- Delivery notifications
- Promotional broadcasts (template-based only)

### Cost Implications
- Session messages: Included in WhatsApp Business API conversation charges
- Template messages: Additional per-message costs
- Conversations billed by category (utility, authentication, marketing)

### Safety by Default
- All outbound messages logged with correlation IDs
- Rate limiting prevents API abuse
- Content validation ensures compliance
- Automatic fallback to template messages when session window expires

## 4. PHASE & SAFETY MODEL

### Phase 1: Stabilization (COMPLETED)
**Locked Elements:**
- Core business logic and chatbot behavior
- Authentication and authorization systems
- Database schema and relationships
- WhatsApp webhook processing
- Error handling and logging infrastructure

### Phase 3: Isolation & Orchestration (COMPLETED)
**Guarantees:**
- Job queue isolation between different message types
- Async processing for all outbound communications
- Correlation ID tracking across all operations
- Failure categorization and handling

### Phase 4.3: Deadletters & Retry Semantics (COMPLETED)
**Ensures:**
- Transient failures retry up to 2 times with exponential backoff
- Policy failures never retry to prevent API violations
- Deadletter queue for manual inspection and recovery
- Comprehensive retry logging for observability

### Phase 4.4: Throttling Scaffolds & Activation Gates (COMPLETED)
**Adds:**
- Broadcast throttling infrastructure (environment-gated)
- Transactional message pacing controls (soft-activated)
- Burst guardrails for high-volume scenarios
- Environment-driven activation controls

### Dormant Features (Environment-Gated)
- **Broadcast Throttling**: `THROTTLE_BROADCAST_ENABLED=true`
- **Transactional Throttling**: `THROTTLE_TRANSACTIONAL_ENABLED=true`
- **Burst Guardrails**: `THROTTLE_BURST_ENABLED=true`

## 5. OPERATING LIMITS (CURRENT)

### Concurrent Customer Chats
- **Safe Range**: 50-100 simultaneous conversations
- **Recommended**: 75 concurrent chats per restaurant instance
- **Limiting Factor**: WhatsApp API rate limits and processing capacity

### Orders Per Day
- **Safe Range**: 200-500 orders per day
- **Recommended**: 350 orders for optimal performance
- **Burst Capacity**: Up to 1000 orders with throttling activation

### Broadcast Constraints
- **Manual Broadcasts**: Up to 1000 recipients per batch
- **Automated Triggers**: Limited to order-related notifications
- **Template Requirements**: All promotional messages must use approved templates

### Prohibited Operations
- Mass marketing campaigns without template approval
- Bulk message imports without proper opt-in consent
- Sharing of customer data between restaurant instances
- Modification of core business logic without proper testing

## 6. DEPLOYMENT & ONBOARDING (PER RESTAURANT)

### Why Separate WhatsApp/Meta Setup
- **Compliance**: WhatsApp requires individual business verification
- **Phone Numbers**: Each restaurant needs dedicated WhatsApp Business number
- **Liability**: Separation prevents cross-contamination of messaging reputation
- **Customization**: Allows restaurant-specific branding and templates

### Required Documents
1. **Business Registration**: MSME/Udyam certificate or equivalent
2. **Address Proof**: Utility bill or rental agreement
3. **Identity Proof**: Owner's government-issued ID
4. **Bank Account**: For payment gateway settlement
5. **Email Domain**: Professional email address (recommended)

### Managed vs Restaurant-Owned
**System Manager Handles:**
- Backend deployment and maintenance
- Database management and backups
- Payment gateway integration
- Analytics dashboard setup
- Technical support and monitoring

**Restaurant Owns:**
- Meta Business account and verification
- WhatsApp Business API number
- Payment gateway account
- Menu content and pricing
- Customer data and relationships

### High-Level Onboarding Steps
1. **Business Verification**: Complete Meta Business verification process
2. **WhatsApp Setup**: Configure WhatsApp Business API with dedicated number
3. **Payment Integration**: Set up Razorpay or equivalent payment gateway
4. **Menu Configuration**: Upload menu items, categories, and pricing
5. **Testing**: Conduct end-to-end testing with sample orders
6. **Training**: Staff training for admin dashboard and order management

## 7. FAILURE MODES & EXPECTED BEHAVIOR

### Temporary Failures
**Network/API Timeouts:**
- Automatic retry with exponential backoff
- Customer sees delayed but eventual response
- Order processing continues in background
- Logged with correlation ID for debugging

**Payment Gateway Issues:**
- Payment link regeneration on failure
- Order remains in pending status
- Customer notified of payment issues
- Manual payment processing available

### Terminal Failures
**Invalid WhatsApp Numbers:**
- Immediate failure without retry
- Customer not contacted via WhatsApp
- Alternative notification via email if available
- Order marked for manual follow-up

**Policy Violations:**
- Message content rejected by WhatsApp
- No retry attempts to prevent account suspension
- Template message fallback where possible
- Manual review required for content adjustment

### Deadletter Usage
- Failed jobs moved to deadletter queue after retry exhaustion
- Manual inspection through admin interface
- Replay capability for recoverable failures
- Automatic cleanup after 30 days

### Customer vs Operator Experience
**Customer Sees:**
- Seamless order processing with minimal delays
- Clear error messages for recoverable issues
- Alternative contact methods for critical failures
- Order status updates throughout resolution

**Operator Sees:**
- Detailed failure logs with correlation IDs
- Deadletter queue for manual intervention
- Performance metrics and alerting
- Recovery tools and replay capabilities

## 8. WHAT THIS SYSTEM IS NOT

### Not a Mass Broadcast Engine
- Designed for transactional messaging, not marketing campaigns
- No built-in segmentation or targeting features
- Template approval required for any bulk messaging
- Rate limits prevent spam-like behavior

### Not a Shared Multi-Tenant SaaS
- Each restaurant runs isolated instance
- No data sharing between customers
- Separate WhatsApp numbers required
- Individual billing and compliance management

### Not a Zero-Setup DIY Tool
- Requires technical onboarding and configuration
- Business verification process mandatory
- Payment gateway integration needed
- Menu setup and testing required

### Not an AI Free-for-All Chatbot
- Structured conversation flows with defined states
- Limited to restaurant ordering domain
- No general-purpose AI capabilities
- Human oversight required for complex interactions

## 9. CURRENT STATUS SUMMARY

### Production-Ready Today
- **Core Ordering Flow**: Complete WhatsApp ordering from menu to payment
- **Payment Processing**: Razorpay integration with UPI and COD support
- **Order Management**: Full admin dashboard with real-time updates
- **Analytics**: Google Sheets integration and basic reporting
- **Reliability**: Retry logic, error handling, and observability
- **Compliance**: WhatsApp Business API adherence and template usage

### Intentionally Deferred to Later Phases
- **Advanced Analytics**: Enhanced business intelligence and reporting
- **Multi-Location Support**: Chain restaurant management capabilities
- **Advanced AI**: Natural language understanding improvements
- **Mobile Applications**: Customer and delivery partner mobile apps
- **Third-Party Integrations**: Food delivery platform aggregators
- **Advanced Features**: Loyalty programs, promotions engine

### Phase 5 Justification Conditions
- **Scale Requirements**: Consistent >1000 orders/day per restaurant
- **Multi-Location Demand**: Chain restaurant deployment needs
- **Feature Requests**: Customer-driven advanced feature requirements
- **Performance Bottlenecks**: Current architecture reaching limits
- **Competitive Pressure**: Market requirements for additional capabilities

---

**Document Version**: 1.0  
**Last Updated**: Production System Documentation  
**Scope**: Current production capabilities and limitations  
**Next Review**: Upon Phase 5 initiation planning
