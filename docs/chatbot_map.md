# Chatbot Behavior Map (Phase 3 · Step 3.1)

## 1. Entry Points

**Primary Entry Function**: `chatbot.handleMessage(phone, message, messageType = 'text', selectedId = null, senderName = null)`

**Input Flow from messageProcessor**:
- `messageProcessor.processInboundMessage()` normalizes Meta payload
- Extracts: `phone`, `text`, `messageType`, `selectedId`, `senderName`
- Calls `chatbot.handleMessage()` with these parameters
- Idempotency check handled in messageProcessor using `InboundMessage` collection

**Exported Functions**: Single `chatbot` object containing all methods as properties

## 2. Message Types & Routing

**Supported Message Types**:
- **text**: String messages, processed with `.toLowerCase().trim()`
- **location**: Object with `{ latitude, longitude, name, address }`
- **button**: Handled via `selectedId` parameter
- **list**: Handled via `selectedId` parameter

**Routing Priority Order**:
1. **Location messages** (`messageType === 'location'`)
2. **Website cart orders** (`isWebsiteCartOrderIntent()`)
3. **Website single item orders** (`isWebsiteOrderIntent()`)
4. **Cart commands** (clear before view)
5. **Menu intents** (`isShowMenuIntent()`)
6. **Order placement** (`place_order`, `order_now`)
7. **Order management** (cancel, refund, track, status)
8. **Add to cart intents** (`isAddToCartIntent()`)
9. **Checkout flows**
10. **State-based routing** (`currentStep` specific handlers)
11. **Number selection** (for paginated categories)
12. **Fallback/greeting**

## 3. Intent Resolution

**Intent Detection Functions**:
- `isCancelIntent()` - Multi-language cancel patterns
- `isRefundIntent()` - Multi-language refund patterns  
- `isCartIntent()` - Cart view with voice recognition alternatives
- `isClearCartIntent()` - Cart clearing with priority over view
- `isSimpleCartKeyword()` - Standalone "cart" keyword
- `isAddToCartIntent()` - "add X to cart" patterns
- `isWebsiteOrderIntent()` - Website single item format detection
- `isWebsiteCartOrderIntent()` - Website multi-item cart format
- `isShowMenuIntent()` - Menu browsing with food type detection
- `isTrackIntent()` - Order tracking patterns
- `isOrderStatusIntent()` - Status checking patterns

**Resolution Rules**:
- Text intents only checked when `!selectedId` (no button click)
- Priority ordering: cancel/refund > cart > menu > general
- Multi-language support (English, Hindi, Telugu, Tamil, Kannada, Malayalam, Bengali, Marathi, Gujarati)
- Voice recognition error handling (e.g., "card" → "cart")

## 4. State Management

**State Location**: `customer.conversationState` object

**State Read Points**:
- Entry: `const state = customer.conversationState || { currentStep: 'welcome' }`
- Throughout routing: `state.currentStep` checks
- Conditional flows: `state.selectedItem`, `state.foodTypePreference`, `state.paymentMethod`

**State Write Points**:
- After every significant action: `customer.conversationState = state; await customer.save()`
- State transitions: `state.currentStep = 'new_step'`
- Temporary data: `state.selectedItem`, `state.deliveryCharge`, `state.deliveryDistance`

**State Reset**:
- New customer creation: `{ currentStep: 'welcome' }`
- Cart clear: `customer.cart = []`
- Navigation: `home`/`back` buttons reset to `main_menu`

**Session Boundaries**: Per phone number, persistent in Customer document

## 5. Domain Logic Clusters

**Menu Browsing**:
- Food type filtering (`veg`, `egg`, `nonveg`, `both`)
- Category pagination with number selection
- Item search with AI-powered matching
- Availability filtering based on schedules

**Cart Management**:
- Add/remove items with quantity tracking
- Cart persistence across sessions
- Availability validation on checkout
- Website cart import functionality

**Order Placement**:
- Service type selection (delivery/pickup)
- Location handling with delivery radius validation
- Payment method selection (UPI/COD)
- Order confirmation and tracking setup

**Payment Handling**:
- Razorpay UPI integration
- COD processing
- Pickup payment at hotel
- Payment status tracking

**Delivery/Location**:
- GPS location processing
- Address geocoding
- Distance calculation (OSRM, OpenRouteService fallback)
- Delivery charge calculation based on radius

**Fallback/Help Flows**:
- Multi-language support
- Voice recognition error handling
- Holiday mode responses
- Help menu and order status

## 6. Side Effects

**WhatsApp Sends**:
- `whatsapp.sendMessage()` - Text messages
- `whatsapp.sendButtons()` - Interactive buttons
- `whatsapp.sendList()` - Interactive lists
- `whatsapp.sendImageWithButtons()` - Image + buttons
- `whatsapp.sendImageWithCtaUrl()` - Image + CTA

**Database Writes**:
- `customer.save()` - State and cart updates
- `Customer.create()` - New customer creation
- `Order.create()` - Order placement
- `InboundMessage.create()` - Idempotency (in messageProcessor)

**External API Calls**:
- `axios.get()` - OSRM routing API
- `axios.get()` - OpenRouteService API
- `axios.get()` - Nominatim geocoding
- `groqAi.translateToEnglish()` - Translation
- `groqAi.matchSearchToTags()` - AI matching
- `razorpayService.*` - Payment processing

**Background Operations**:
- `googleSheets.addOrUpdateCustomer()` - Customer sync
- `googleSheets.addOrder()` - Order sync
- `whatsappBroadcast.addContact()` - Contact management

## 7. Error Handling

**Caught Errors**:
- Distance API failures: Return null, fallback to straight-line calculation
- Geocoding failures: Return "Location shared"
- Translation failures: Fallback to transliteration
- Database errors: Propagated to global handler
- Payment failures: User notification with retry options

**Swallowed Failures**:
- Google Sheets sync errors (non-blocking)
- WhatsApp broadcast contact save errors (non-blocking)
- External API timeouts (fallback behavior)

**User-Visible Errors**:
- "Failed to process your order. Please try again."
- "Delivery Not Available" with radius information
- "Item not found" for search failures
- Payment failure notifications

**Silent Failures**:
- AI translation failures (fallback to basic)
- Background sync operations
- Non-critical API timeouts

## 8. Control Flow Observations

**Large Conditional Chains**:
- Primary routing chain in `handleMessage()` (50+ if/else branches)
- Intent detection functions with extensive pattern arrays
- Multi-language pattern matching

**Deeply Nested Logic**:
- Location handling → delivery validation → payment flow
- Menu browsing → category selection → item details → cart
- Website order detection → item matching → cart addition

**God Sections**:
- `handleMessage()` function (300+ lines) dominates entire flow
- Intent detection functions with extensive pattern arrays
- Distance calculation with multiple API fallbacks

**Control Flow Patterns**:
- Early returns for location and website orders
- State-based routing after initial intent detection
- Priority-based intent checking (specific before general)
- Fallback chains for external services
