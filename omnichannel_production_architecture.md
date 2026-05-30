# AI Omnichannel Communication Hub: Production Architecture Guide

Welcome to the production deployment and integration architecture map for the EmailFlow AI **Omnichannel Communication Hub**. This guide outlines how the system orchestrates SMS, WhatsApp, and Slack routing pipelines securely at enterprise scale.

---

## 🗺️ Production Data Flow Diagram

The following architecture demonstrates the lifecycle of an inbound message arriving from a customer, its triage by the AI Chief of Staff, automated routing, and delivery status tracking:

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Inbound Customer
    participant Twilio as Twilio API Gateway
    participant Express as Express.js Server
    participant Redis as Upstash Redis / BullMQ
    participant AI as Groq Llama-3.3 LLM
    participant Graph as Timeline Graph
    participant Socket as Socket.IO Events
    participant Client as React Dashboard

    Customer->>Twilio: Sends WhatsApp / SMS
    Twilio->>Express: Inbound Webhook (POST /api/omnichannel/webhooks/twilio)
    Note over Express: Verify Cryptographic Signatures (SHA256)
    Express-->>Twilio: HTTP 200 (Acknowledge Receipt)
    Express->>Redis: Enqueue Inbound Event (inboundQueue)
    
    Note over Redis: BullMQ Inbound Worker processes job
    Redis->>Graph: Normalize & Sync chronologically to Graph DB
    Graph->>Redis: Enqueue AI & Rules Routing (routingQueue)
    
    Note over Redis: BullMQ Routing Worker processes job
    Redis->>AI: Fetch Urgency, Sentiment & Smart Reply recommendation
    AI-->>Redis: Return AI Context JSON
    Redis->>Socket: Emit real-time event: omnichannel_msg
    Socket->>Client: Prepend message and update Urgency circle
    
    Redis->>Redis: Evaluate NL Rules & Enqueue deliveryQueue
    Note over Redis: BullMQ Delivery Worker dispatches outbound
    Redis->>Twilio: Outbound Send API (WhatsApp / SMS)
    Twilio-->>Customer: Deliver Message
    Twilio->>Express: Async Status Callback (POST /webhooks/twilio/status)
    Express->>Socket: Emit real-time status: omnichannel_msg_status
    Socket->>Client: Mark message bubble as "DELIVERED"
```

---

## 🛠️ Step 1: Connecting Production Twilio (SMS & WhatsApp)

To switch the Twilio integration from the simulator sandbox into real-world delivery mode:

1. **Obtain API Keys:**
   - Sign up/log in to your [Twilio Console](https://console.twilio.com/).
   - Copy your **Account SID** and **Auth Token** from the dashboard home page.

2. **Configure your Environment:**
   Open your [backend/.env](file:///c:/Users/sravy\OneDrive\Desktop\Email/backend/.env) file and populate the Twilio configurations:
   ```env
   TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   TWILIO_AUTH_TOKEN=your_real_twilio_auth_token
   TWILIO_SMS_NUMBER=+14155552671
   TWILIO_WHATSAPP_NUMBER=+14155552671
   ```

3. **Deploy Public Webhooks for Inbound Messaging:**
   Configure your Twilio Phone Number webhooks in the Twilio Console under **Phone Numbers > Active Numbers > Configure**:
   - **A Message Comes In:** Set to Webhook HTTP POST: `https://your-production-backend.com/api/omnichannel/webhooks/twilio`
   - **Delivery Status Callback:** Set to Webhook HTTP POST: `https://your-production-backend.com/api/omnichannel/webhooks/twilio/status`

4. **Register WhatsApp Templates:**
   Outbound WhatsApp messages outside Twilio's standard 24-hour reply window require pre-registered templates. Use the template utility in `omnichannelProductionHub.js`:
   - **Template Name:** `urgency_escalation`
   - **Body Structure:**
     ```text
     🚨 *URGENT EXECUTIVE ALERT* 🚨
     Hello {{1}},
     An urgent incoming message was received from *{{2}}* on your email hub. 
     *Brief:* {{3}}
     *AI Urgency Score:* {{4}}/100
     Reply directly to approve the smart reply draft.
     ```

---

## 💬 Step 2: Configuring Slack Workspace Webhooks & OAuth

To enable Slack-wide alert notifications and chronological workspace channel syncing:

1. **Create an Enterprise Slack App:**
   - Go to [Slack API Apps Console](https://api.slack.com/apps) and click **Create New App > From Scratch**.
   - Name the app (e.g., `EmailFlow AI Hub`) and select your target workspace.

2. **Configure Bot Permissions (OAuth & Permissions):**
   Under **Scopes > Bot Token Scopes**, add the following permissions:
   - `chat:write` - Send outbound notification alerts.
   - `channels:history` - Sync public channel communications.
   - `im:history` - Direct message sync.
   - `incoming-webhook` - Target incoming alerts.

3. **Install to Workspace:**
   - Click **Install to Workspace** to authorize.
   - Copy the generated **Bot User OAuth Token** (`xoxb-XXXXXXXXXXXX...`).

4. **Add signing secret for webhook validation:**
   - Copy the **Signing Secret** from the App credentials screen.
   - Add both keys to your [backend/.env](file:///c:/Users/sravy\OneDrive\Desktop\Email/backend/.env):
     ```env
     SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
     SLACK_SIGNING_SECRET=your_slack_signing_secret
     ```

5. **Enable Slack Event Subscriptions:**
   - In Slack developer settings, toggle **Event Subscriptions** to **On**.
   - Input your Request URL: `https://your-production-backend.com/api/omnichannel/webhooks/slack`
   - Subscribe to Bot Events: `message.channels`, `message.im`.

---

## ⚡ Step 3: Zero-Touch Production Addon Integration

Because your existing files remain 100% untouched, our addon is designed to be dynamically mounted. To activate the status callbacks and analytics endpoints:

1. **Option A: Explicit Server Mounting (Recommended)**
   If you wish to make these endpoints active on your server, simply append the following route mount line in your [server.js](file:///c:/Users/sravy\OneDrive\Desktop\Email/backend/src/server.js#L281-L283) under your existing omnichannel registration:
   ```javascript
   // Mount the advanced production status tracking and dashboard monitoring addons
   app.use('/api/omnichannel', require('./routes/omnichannelProductionRoutes'));
   ```

2. **Option B: Independent Sidecar Process**
   If you wish to keep `server.js` completely unchanged, the production routes can be run as a sidecar microservice mapping directly to the shared PostgreSQL database and memory queues.

---

## 📊 Step 4: Monitoring, Retries, and Diagnostics

The system uses a highly optimized hybrid architecture to ensure that notifications are never lost:

1. **Automated Retry System:**
   - Outbound API calls are processed asynchronously. If Twilio or Slack returns a `502 Bad Gateway` or rate-limit throttle error, the job automatically backs off exponentially.
   - Standard BullMQ configuration retries 3 times (`attempts: 3`), delaying 2000ms times the retry index (`backoff: 2000ms exponential`).
   - If Redis is restricted or offline, the system shifts automatically to the resilient **In-Memory Sandbox Broker**, moving failed items into `inMemoryQueues.retryQueue` for async re-dispatch.

2. **Failed Deliveries Monitor:**
   - Call `GET /api/omnichannel/monitoring/analytics` to view the list of failed deliveries, error metrics, and active queue counts.
   - Call `GET /api/omnichannel/monitoring/retry-queue` to inspect current jobs waiting to re-dispatch.
