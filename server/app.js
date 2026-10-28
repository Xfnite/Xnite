import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { rateLimit } from "express-rate-limit";
import { prisma } from "./db/prisma.js";
import { redis, isRedisReady } from "./db/redis.js";
import { verifyJwt } from "./utils/jwt.js";
import { getPeriodKey } from "./utils/questPeriod.js";
import {
  isTorchEligible,
  getTorchRank,
  getTorchQuota,
  TORCH_DAILY_CAP,
} from "./utils/torchRank.js";
import {
  DJ_TARGET_MINUTES,
  createDjSession,
  creditPing,
  refundMinutes,
  djProgressPayload,
} from "./utils/djListening.js";
import { extractR2Key, deleteR2Objects } from "./utils/r2.js";
import { isGenuineQuestion, classifyFaq } from "./utils/faqClassifier.js";

dotenv.config();

const app = express();
app.set("trust proxy", 1); // Trust first proxy (e.g. Traefik/Nginx in Dokploy)
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  "http://localhost:3000",
  "https://app.xfnite.cloud",
  "https://xfinite.iaynomrah.cloud"
];

// Enable CORS and JSON parsing
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));

// HTTP Route Rate Limiter (max 100 requests per 15 mins per IP)
const httpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: "Too many requests from this IP, please try again later." }
});

// Apply rate limiting to all HTTP routes (except static files handled above)
app.use(httpLimiter);

// Input sanitization helper function to prevent XSS
function sanitizeText(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}



app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date() });
});

// Judgers and admins must never be deactivated (blacklist or inactivity job)
const NEVER_DEACTIVATED_ROLES = ["judger", "admin"];
function isNeverDeactivatedRole(role) {
  return NEVER_DEACTIVATED_ROLES.includes(String(role || "").trim().toLowerCase());
}

// Admin Blacklist User Endpoint secured by a custom JWT secret
app.post("/api/admin/blacklist", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing token" });
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.BLACKLIST_JWT_SECRET;

    // Verify custom admin JWT signature manually
    const parts = token.split(".");
    if (parts.length !== 3) {
      return res.status(401).json({ error: "Unauthorized: Invalid token format" });
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    if (signature !== expectedSignature) {
      return res.status(401).json({ error: "Unauthorized: Invalid token signature" });
    }

    // Parse token payload to check expiration
    let payload;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, "base64url").toString("utf8")
      );
    } catch (err) {
      return res.status(401).json({ error: "Unauthorized: Invalid payload encoding" });
    }

    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return res.status(401).json({ error: "Unauthorized: Token expired" });
    }

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Bad Request: Email is required" });
    }

    const targetEmail = email.toLowerCase().trim();

    // Check if user exists by primary email
    let user = await prisma.user.findUnique({
      where: { email: targetEmail }
    });

    // Fallback to gingerEmail if not found by primary email
    if (!user) {
      user = await prisma.user.findUnique({
        where: { gingerEmail: targetEmail }
      });
    }

    if (!user) {
      return res.status(404).json({ error: "Not Found: User not found" });
    }

    if (isNeverDeactivatedRole(user.role)) {
      return res.status(403).json({ error: `Forbidden: ${user.role} accounts cannot be deactivated` });
    }

    const primaryEmail = user.email;

    // Perform deactivation and wallet zeroing in a transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { email: primaryEmail },
        data: { status: "Deactivated" }
      }),
      prisma.currentIncome.upsert({
        where: { email: primaryEmail },
        update: { estimatedAmount: 0 },
        create: {
          email: primaryEmail,
          estimatedAmount: 0,
          status: "Accumulating"
        }
      })
    ]);

    return res.json({ success: true, message: `User ${primaryEmail} has been blacklisted and their wallet has been zeroed.` });
  } catch (err) {
    console.error("Blacklist endpoint error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

const httpServer = createServer(app);

// Setup Socket.io
const io = new Server(httpServer, {
  maxHttpBufferSize: 1e7, // 10MB to allow large bulk message payloads
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// Authentication middleware for Socket.io
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error("Authentication error: Session token is required"));
  }

  const payload = verifyJwt(token);
  if (!payload || !payload.email) {
    return next(new Error("Authentication error: Invalid or expired session token"));
  }

  const lowerEmail = payload.email.toLowerCase();
  let user = null;

  if (isRedisReady()) {
    try {
      const cachedUser = await redis.get(`user_session:${lowerEmail}`);
      if (cachedUser) {
        user = JSON.parse(cachedUser);
      }
    } catch (err) {
      console.error("Socket authentication Redis cache fetch error:", err);
    }
  }

  try {
    if (!user) {
      user = await prisma.user.findUnique({
        where: { email: lowerEmail }
      });

      if (!user) {
        return next(new Error("Authentication error: User not found"));
      }

      if (isRedisReady()) {
        try {
          await redis.set(`user_session:${lowerEmail}`, JSON.stringify(user), "EX", 300); // cache for 5 minutes
        } catch (err) {
          console.error("Socket authentication Redis cache set error:", err);
        }
      }
    }

    // Attach verified user info to the socket
    socket.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      group_id: user.group_id,
      team_id: user.team_id,
      allowed_group_ids: null, // populated below for judgers
    };

    // For judgers: preload the list of allowed group IDs once at connection.
    // This avoids a DB query on every single message they send.
    if (user.role?.toLowerCase() === "judger" && user.team_id) {
      try {
        const subGroups = await prisma.group.findMany({
          where: {
            parentGroupId: user.team_id,
            status: "active"
          },
          select: { groupId: true }
        });
        socket.user.allowed_group_ids = new Set(subGroups.map(g => g.groupId));
      } catch (err) {
        console.error("Failed to preload judger group IDs:", err);
        socket.user.allowed_group_ids = new Set();
      }
    }

    next();
  } catch (err) {
    console.error("Socket authentication DB error:", err);
    next(new Error("Authentication error: Database error"));
  }
});

const ALLOWED_DOMAINS_REGEX = /((?:https?:\/\/)?(?:www\.)?(?:facebook\.com|messenger\.com|m\.me|fb\.com|fb\.me|app\.xfnite\.cloud|bucket\.xfnite\.cloud|cdn\.xfnite\.cloud|r2\.dev|r2\.cloudflarestorage\.com|discord\.com|discord\.gg|t\.me|telegram\.org|wa\.me|whatsapp\.com|zoom\.us|skype\.com|meet\.google\.com|viber\.com|teams\.microsoft\.com|localhost)(?:\/[^\s]*)?)/gi;

// Matches anything that looks like a URL/domain (not just the whitelisted ones),
// so we can silently drop messages linking to domains that aren't allowed.
const URL_LIKE_REGEX = /\b(?:https?:\/\/|www\.)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?\b/gi;

function hasDisallowedDomain(text) {
  const matches = text.match(URL_LIKE_REGEX);
  if (!matches) return false;

  return matches.some((m) => {
    ALLOWED_DOMAINS_REGEX.lastIndex = 0;
    const allowedMatch = m.match(ALLOWED_DOMAINS_REGEX);
    return !allowedMatch || allowedMatch[0].length !== m.length;
  });
}

const VALID_CHAT_TYPES = ["applicants", "passers", "old", "checker", "judger", "inner-council"];

function isValidChatType(chatType) {
  if (VALID_CHAT_TYPES.includes(chatType)) return true;
  if (typeof chatType === "string") {
    if (chatType.startsWith("group-")) {
      const id = chatType.substring(6);
      return /^\d+$/.test(id);
    }
    if (chatType.startsWith("team-")) {
      const id = chatType.substring(5);
      return /^\d+$/.test(id);
    }
  }
  return false;
}

// Single source of truth for room access, used by both join_room and
// send_message so a client can't bypass the lock by skipping join_room.
async function canAccessRoom(socket, chatType) {
  if (chatType === "applicants") return true;

  const role = socket.user.role?.trim()?.toLowerCase() || "";
  const isOldLabeler = role === "old-labeler" || role === "old-laber" || role === "old labeler";
  const isStaff = !!role && role !== "labeler" && role !== "applicant" && !isOldLabeler;

  if (chatType === "passers") {
    if (isOldLabeler) return false;
    const isPassed = socket.handshake.auth?.isStandardBuildingPassed === true;
    return isStaff || (role === "labeler" && isPassed);
  }

  if (chatType === "old") {
    return isOldLabeler || isStaff;
  }

  if (chatType === "checker") {
    return role === "checker" || role === "judger" || role === "admin";
  }

  if (chatType === "judger") {
    return role === "judger" || role === "admin";
  }

  if (chatType === "inner-council") {
    return role === "checker" || role === "recruiter" || role === "judger" || role === "admin";
  }

  if (chatType.startsWith("group-")) {
    const groupId = parseInt(chatType.substring(6), 10);
    if (role === "admin") return true;
    if (role === "judger") {
      // allowed_group_ids is pre-populated at connection time — O(1) lookup, no DB hit
      return socket.user.allowed_group_ids?.has(groupId) ?? false;
    }
    const isCheckerOrBelow = role !== "judger";
    return isCheckerOrBelow && socket.user.group_id === groupId;
  }

  if (chatType.startsWith("team-")) {
    const teamId = parseInt(chatType.substring(5), 10);
    if (role === "admin") return true;
    if (role === "judger") {
      return socket.user.team_id === teamId;
    }
    if (role === "checker") {
      return socket.user.team_id === teamId;
    }
    return false;
  }

  return false;
}

// --- Jukebox State ---
let jukeboxQueue = [];
let jukeboxCurrentSong = null;
let jukeboxSkipVotes = new Set();
let jukeboxEndedLock = false;
let jukeboxListeners = new Set(); // tracks socket IDs actively listening
const jukeboxLastAddedTimes = new Map();
const activeConnections = new Map(); // tracks unique users by email
const activeChatWidgetConnections = new Map(); // tracks unique users by email with chat open

function getFakeCount(realCount, type) {
  if (realCount === 0) return 0;
  if (["checker", "judger", "innerCouncil"].includes(type)) {
    return realCount;
  }
  return Math.ceil(realCount * 1.5);
}

// Each page opens up to three sockets (header, chat widget, jukebox), and each says
// which one it is in auth.client. Broadcasts go only to the sockets that listen for
// them. A socket without auth.client (a page loaded before this change) is treated
// as all three, so it keeps getting everything it used to.
const PRESENCE_TIMEOUT_MS = 10000; // online counts are cosmetic; churn made 2s costly
function wantsFeature(socket, client) {
  const c = socket.handshake.auth?.client;
  return !c || c === client;
}

// Last broadcast values, handed to each new connection so a freshly loaded page
// shows the counts at once instead of waiting for the next broadcast.
let lastOnlineCount = null;
let lastChatWidgetCounts = null;

let onlineCountTimeout = null;
function broadcastOnlineCount(ioInstance) {
  if (onlineCountTimeout) return;
  onlineCountTimeout = setTimeout(() => {
    const realCount = new Set(activeConnections.values()).size;
    lastOnlineCount = getFakeCount(realCount, "general");
    ioInstance.to("listen:header").emit("online_users_count", lastOnlineCount);
    onlineCountTimeout = null;
  }, PRESENCE_TIMEOUT_MS);
}

let chatWidgetCountTimeout = null;
function broadcastChatWidgetCount(ioInstance) {
  if (chatWidgetCountTimeout) return;
  chatWidgetCountTimeout = setTimeout(() => {
    const counts = { applicants: 0, passers: 0, old: 0, checker: 0, judger: 0, innerCouncil: 0 };
    const uniquePerRole = { applicants: new Set(), passers: new Set(), old: new Set(), checker: new Set(), judger: new Set(), innerCouncil: new Set() };

    for (const socket of ioInstance.sockets.sockets.values()) {
      if (socket.user && socket.user.email) {
        const cleanRole = socket.user.role?.trim()?.toLowerCase() || "";
        if (cleanRole === "applicant") {
          uniquePerRole.applicants.add(socket.user.email);
        } else if (cleanRole === "labeler") {
          uniquePerRole.passers.add(socket.user.email);
        } else if (["old-labeler", "old-laber", "old labeler"].includes(cleanRole)) {
          uniquePerRole.old.add(socket.user.email);
        } else if (cleanRole === "checker") {
          uniquePerRole.checker.add(socket.user.email);
        } else if (cleanRole === "judger") {
          uniquePerRole.judger.add(socket.user.email);
        }

        // inner-council includes checkers, recruiters, judgers, admins
        if (["checker", "recruiter", "judger", "admin"].includes(cleanRole)) {
          uniquePerRole.innerCouncil.add(socket.user.email);
        }
      }
    }

    counts.applicants = getFakeCount(uniquePerRole.applicants.size, "applicants");
    counts.passers = getFakeCount(uniquePerRole.passers.size, "passers");
    counts.old = getFakeCount(uniquePerRole.old.size, "old");
    counts.checker = getFakeCount(uniquePerRole.checker.size, "checker");
    counts.judger = getFakeCount(uniquePerRole.judger.size, "judger");
    counts.innerCouncil = getFakeCount(uniquePerRole.innerCouncil.size, "innerCouncil");

    lastChatWidgetCounts = counts;
    ioInstance.to("listen:chat").emit("chat_widget_online_count", counts);
    chatWidgetCountTimeout = null;
  }, PRESENCE_TIMEOUT_MS);
}

let jukeboxBroadcastTimeout = null;
function broadcastJukeboxState(target = io) {
  if (target !== io) {
    target.emit("jukebox_state_update", {
      queue: jukeboxQueue,
      currentSong: jukeboxCurrentSong,
      skipVotesCount: jukeboxSkipVotes.size,
      votesNeeded: 10,
      serverTime: Date.now(),
      listenerCount: jukeboxListeners.size
    });
  } else {
    if (jukeboxBroadcastTimeout) return;
    jukeboxBroadcastTimeout = setTimeout(() => {
      io.to("listen:jukebox").emit("jukebox_state_update", {
        queue: jukeboxQueue,
        currentSong: jukeboxCurrentSong,
        skipVotesCount: jukeboxSkipVotes.size,
        votesNeeded: 10,
        serverTime: Date.now(),
        listenerCount: jukeboxListeners.size
      });
      jukeboxBroadcastTimeout = null;
    }, 1000); // 1-second debounce for global jukebox broadcasts
  }
}

let jukeboxClearTimeout = null;

function clearJukebox() {
  console.log("[Jukebox] No listeners remaining. Clearing queue and current song.");
  jukeboxQueue = [];
  jukeboxCurrentSong = null;
  jukeboxSkipVotes.clear();
  jukeboxEndedLock = false;
  broadcastJukeboxState();
}

function scheduleClearJukebox() {
  if (jukeboxClearTimeout) clearTimeout(jukeboxClearTimeout);
  // Give a 30-second grace period for page reloads/reconnections before clearing
  jukeboxClearTimeout = setTimeout(() => {
    if (jukeboxListeners.size === 0) {
      clearJukebox();
    }
  }, 30000);
}

function cancelClearJukebox() {
  if (jukeboxClearTimeout) {
    clearTimeout(jukeboxClearTimeout);
    jukeboxClearTimeout = null;
  }
}

function playNextSong() {
  if (jukeboxQueue.length > 0) {
    jukeboxCurrentSong = jukeboxQueue.shift();
    jukeboxCurrentSong.startedAt = Date.now();
  } else {
    jukeboxCurrentSong = null;
  }
  jukeboxSkipVotes.clear();
  broadcastJukeboxState();
}

// ─── "The 60-Minute Harmony" ────────────────────────────────────────────────
// The listening clock lives in utils/djListening.js; here we only keep one
// session per user (keyed by lowercased email, NOT by socket id, so reloads and
// extra tabs neither reset nor double-count it) and bank whole minutes as they
// come due. The LXP is granted when the user claims the finished card
// (completeQuest), so nothing here touches UserLoyalty.
const DJ_SESSION_TTL_MS = 60 * 60 * 1000;

// email -> session from createDjSession()
const djSessions = new Map();

async function getDjSession(email) {
  const periodKey = getPeriodKey();
  const cached = djSessions.get(email);
  if (cached && cached.periodKey === periodKey) return cached;

  // First ping of the session (or the first one after a period rollover): pick
  // the banked total back up from the DB so the counter continues where it left off.
  const row = await prisma.jukeboxListening.findUnique({
    where: { userEmail_periodKey: { userEmail: email, periodKey } },
    select: { minutes: true },
  });

  const session = createDjSession(periodKey, row?.minutes ?? 0);
  djSessions.set(email, session);
  return session;
}

// Drop sessions nobody has pinged for an hour so the map can't grow forever.
setInterval(() => {
  const cutoff = Date.now() - DJ_SESSION_TTL_MS;
  for (const [email, session] of djSessions) {
    if (!session.lastPingAt || session.lastPingAt < cutoff) djSessions.delete(email);
  }
}, DJ_SESSION_TTL_MS);
// ---------------------

io.on("connection", (socket) => {
  const forHeader = wantsFeature(socket, "header");
  const forChat = wantsFeature(socket, "chat");
  const forJukebox = wantsFeature(socket, "jukebox");
  if (forHeader) socket.join("listen:header");
  if (forChat) socket.join("listen:chat");
  if (forJukebox) socket.join("listen:jukebox");
  if (forHeader && lastOnlineCount !== null) socket.emit("online_users_count", lastOnlineCount);
  if (forChat && lastChatWidgetCounts) socket.emit("chat_widget_online_count", lastChatWidgetCounts);

  if (socket.user.email) {
    activeConnections.set(socket.id, socket.user.email);
    broadcastOnlineCount(io);
    broadcastChatWidgetCount(io);
  }

  // On connect, send current Jukebox state to the user
  if (forJukebox) broadcastJukeboxState(socket);

  // Join personal room (both raw and lowercase for casing tolerance)
  if (socket.user.email) {
    socket.join(`user:${socket.user.email}`);
    socket.join(`user:${socket.user.email.toLowerCase()}`);

    // Prime "The 60-Minute Harmony" so the quest card shows today's real total
    // straight away instead of waiting for the first banked minute.
    if (forJukebox) {
      getDjSession(socket.user.email.toLowerCase())
        .then((session) => socket.emit("dj_minutes", djProgressPayload(session)))
        .catch((err) => console.error("[Jukebox] initial dj_minutes failed:", err));
    }
  }

  // Fetch and send unread direct messages (non-blocking). Only the header and the
  // chat widget show them.
  if (forHeader || forChat) prisma.directMessage.findMany({
    where: { toEmail: socket.user.email.toLowerCase(), isRead: false },
    orderBy: { createdAt: "asc" }
  }).then((unreadMessages) => {
    if (unreadMessages.length > 0) {
      unreadMessages.forEach((msg) => {
        socket.emit("receive_direct_message", msg);
      });
    }
  }).catch(console.error);

  // Fetch and send unread broadcast messages
  if (forHeader || forChat) prisma.messageRecipient.findMany({
    where: { toEmail: socket.user.email.toLowerCase(), isRead: false },
    include: { message: true }
  }).then((unreadBroadcasts) => {
    const validBroadcasts = unreadBroadcasts.filter(r => r.message);
    if (validBroadcasts.length > 0) {
      validBroadcasts.forEach((recipient) => {
        const mappedMsg = {
          id: recipient.id,
          toEmail: recipient.toEmail,
          fromName: recipient.message.fromName,
          subject: recipient.message.subject,
          message: recipient.message.message,
          imageUrls: recipient.message.imageUrls,
          isRead: recipient.isRead,
          createdAt: recipient.message.createdAt,
          isBroadcast: true,
          isAnnouncement: recipient.message.subject === "Payout Update"
        };
        socket.emit("receive_direct_message", mappedMsg);
      });
    }
  }).catch((e) => {
    console.error("Connection broadcast error:", e);
  });

  // Fetch Message History
  socket.on("fetch_message_history", async () => {
    try {
      const [directMessages, broadcastMessages] = await Promise.all([
        prisma.directMessage.findMany({
          where: { toEmail: socket.user.email.toLowerCase() },
          orderBy: { createdAt: "desc" },
          take: 30
        }),
        prisma.messageRecipient.findMany({
          where: { toEmail: socket.user.email.toLowerCase() },
          include: { message: true },
          take: 30
        })
      ]);

      const mappedBroadcasts = broadcastMessages
        .filter(r => r.message)
        .map(r => ({
          id: r.id,
          toEmail: r.toEmail,
          fromName: r.message.fromName,
          subject: r.message.subject,
          message: r.message.message,
          imageUrls: r.message.imageUrls,
          isRead: r.isRead,
          createdAt: r.message.createdAt,
          isBroadcast: true,
          isAnnouncement: r.message.subject === "Payout Update"
        }));

      const allMessages = [...directMessages, ...mappedBroadcasts]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 30);

      socket.emit("message_history", allMessages);
    } catch (e) {
      console.error("Fetch message history error:", e);
    }
  });

  // Handle direct message acknowledgement
  socket.on("acknowledge_direct_message", async ({ messageId, isBroadcast }) => {
    if (!messageId) return;
    try {
      if (isBroadcast === true) {
        await prisma.messageRecipient.update({
          where: { id: messageId },
          data: { isRead: true }
        });
      } else if (isBroadcast === false) {
        await prisma.directMessage.update({
          where: { id: messageId },
          data: { isRead: true }
        });
      } else {
        try {
          await prisma.directMessage.update({
            where: { id: messageId },
            data: { isRead: true }
          });
        } catch (e) {
          await prisma.messageRecipient.update({
            where: { id: messageId },
            data: { isRead: true }
          });
        }
      }
    } catch (err) {
      console.error("Acknowledge direct message error:", err);
    }
  });

  // Send Direct Message logic
  socket.on("send_direct_message", async ({ toEmail, subject, message, imageUrls }) => {
    try {
      // Fetch latest role from DB to avoid stale socket/Redis cache after promotion
      const dbUser = await prisma.user.findUnique({
        where: { email: socket.user.email.toLowerCase() },
        select: { role: true }
      });
      const currentRole = dbUser?.role || socket.user.role || "";

      const cleanRole = currentRole.trim().toLowerCase();
      const allowedRoles = ["admin", "judger", "checker", "manager"];
      if (!allowedRoles.includes(cleanRole)) {
        console.warn(`[DM] Permission denied for ${socket.user.email} — current role: "${currentRole}", cached role: "${socket.user.role}"`);
        return socket.emit("error_message", "You do not have permission to send direct messages.");
      }

      if (!toEmail || !subject || !message) {
        return socket.emit("error_message", "Missing required fields");
      }

      const newMsg = await prisma.directMessage.create({
        data: {
          toEmail: toEmail.toLowerCase(),
          fromName: socket.user.name || "Admin",
          subject: subject,
          message: message,
          imageUrls: imageUrls || null
        }
      });

      io.to(`user:${toEmail.toLowerCase()}`).emit("receive_direct_message", newMsg);
      socket.emit("direct_message_sent", { success: true });
    } catch (err) {
      console.error("Direct message error:", err);
      socket.emit("error_message", "Failed to send direct message");
    }
  });

  // Bulk Message logic (Normalized Architecture)
  const bulkMessageRateLimits = new Map();

  socket.on("send_bulk_message", async ({ toEmails, subject, message, imageUrls }) => {
    try {
      // Fetch latest role from DB to avoid stale socket/Redis cache after promotion
      const dbUser = await prisma.user.findUnique({
        where: { email: socket.user.email.toLowerCase() },
        select: { role: true }
      });
      const currentRole = dbUser?.role || socket.user.role || "";

      const cleanRole = currentRole.trim().toLowerCase();
      const allowedRoles = ["admin", "judger", "checker", "manager"];
      if (!allowedRoles.includes(cleanRole)) {
        console.warn(`[Bulk DM] Permission denied for ${socket.user.email} — current role: "${currentRole}", cached role: "${socket.user.role}"`);
        return socket.emit("error_message", "You do not have permission to send direct messages.");
      }

      // Rate limiting: 1 minute cooldown per admin
      const adminId = socket.user.id;
      const now = Date.now();
      const lastSent = bulkMessageRateLimits.get(adminId) || 0;
      if (now - lastSent < 60000) {
        return socket.emit("error_message", "Please wait a minute before sending another bulk message to prevent spamming.");
      }
      bulkMessageRateLimits.set(adminId, now);

      if (!toEmails || !Array.isArray(toEmails) || toEmails.length === 0 || !subject || !message) {
        return socket.emit("error_message", "Missing required fields");
      }

      const broadcastMsg = await prisma.broadcastMessage.create({
        data: {
          fromName: socket.user.name || "Admin",
          subject: subject,
          message: message,
          imageUrls: imageUrls || null
        }
      });

      // Background processing to avoid blocking the event loop and timing out
      (async () => {
        try {
          const total = toEmails.length;
          const chunkSize = 500;
          let current = 0;

          for (let i = 0; i < total; i += chunkSize) {
            const chunk = toEmails.slice(i, i + chunkSize);

            const cryptoLib = await import("crypto");
            const recipientsToInsert = chunk.map(email => ({
              id: cryptoLib.randomUUID(),
              broadcastMessageId: broadcastMsg.id,
              toEmail: String(email).toLowerCase(),
              isRead: false
            }));

            await prisma.messageRecipient.createMany({
              data: recipientsToInsert,
              skipDuplicates: true
            });

            recipientsToInsert.forEach(recipient => {
              const mappedMsg = {
                id: recipient.id,
                toEmail: recipient.toEmail,
                fromName: broadcastMsg.fromName,
                subject: broadcastMsg.subject,
                message: broadcastMsg.message,
                imageUrls: broadcastMsg.imageUrls,
                isRead: false,
                createdAt: broadcastMsg.createdAt,
                isBroadcast: true
              };
              io.to(`user:${recipient.toEmail}`).emit("receive_direct_message", mappedMsg);
            });

            current += chunk.length;
            // Add a delay to yield the event loop and throttle outgoing WebSocket traffic to prevent bandwidth spikes
            await new Promise(res => setTimeout(res, 250));
            socket.emit("bulk_message_progress", { current, total });
          }

          socket.emit("bulk_message_sent", { success: true, count: total });
        } catch (err) {
          console.error("Background bulk message error:", err);
          socket.emit("error_message", "Failed to complete bulk message delivery.");
        }
      })();
    } catch (err) {
      console.error("Bulk message start error:", err);
      socket.emit("error_message", "Failed to start bulk message");
    }
  });

  // Handle salary toggle event (Admin broadcasts to all users)
  // Every open page reloads its wallet data on this broadcast, so only admins (the
  // restrict page) may trigger it; only the chat widget listens for it.
  socket.on("salaries_toggled", ({ disabled }) => {
    if (socket.user.role?.trim()?.toLowerCase() !== "admin") return;
    io.to("listen:chat").emit("salaries_updated", { disabled });
  });

  // Send Payout Announcement (Admin-only, role-filtered, DB-persisted)
  const announcementRateLimits = new Map();
  socket.on("send_payout_announcement", async ({ targetRoles }) => {
    try {
      const cleanRole = socket.user.role?.trim()?.toLowerCase() || "";
      if (cleanRole !== "admin") {
        return socket.emit("error_message", "You do not have permission to send announcements.");
      }

      // Rate limiting: 30s cooldown per admin
      const adminId = socket.user.id;
      const now = Date.now();
      const lastSent = announcementRateLimits.get(adminId) || 0;
      if (now - lastSent < 30000) {
        return socket.emit("error_message", "Please wait 30 seconds before sending another announcement.");
      }
      announcementRateLimits.set(adminId, now);

      const ANNOUNCEMENT_SUBJECT = "Payout Update";
      const ANNOUNCEMENT_MESSAGE = "Payout rates have been updated. Please check your wallet for the latest payout information.";

      // Normalize target roles (expand "judger & admin" display label)
      const resolvedRoles = [];
      if (!targetRoles || !Array.isArray(targetRoles) || targetRoles.length === 0) {
        // Send to all (no filter)
      } else {
        targetRoles.forEach(r => {
          if (r === "judger & admin") {
            resolvedRoles.push("judger", "admin");
          } else {
            resolvedRoles.push(r);
          }
        });
      }

      // Query matching users from DB
      const whereClause = resolvedRoles.length > 0
        ? {
          role: { in: resolvedRoles },
          currentIncome: {
            estimatedAmount: { gte: 1500 }
          }
        }
        : {
          currentIncome: {
            estimatedAmount: { gte: 1500 }
          }
        };

      const users = await prisma.user.findMany({
        where: whereClause,
        select: { email: true }
      });

      if (users.length === 0) {
        return socket.emit("announcement_sent", { success: false, message: "No users found for the selected roles." });
      }

      const emails = users.map(u => u.email.toLowerCase());

      // Create BroadcastMessage record
      const broadcastMsg = await prisma.broadcastMessage.create({
        data: {
          fromName: socket.user.name || "Admin",
          subject: ANNOUNCEMENT_SUBJECT,
          message: ANNOUNCEMENT_MESSAGE,
          imageUrls: null
        }
      });

      // Background: create recipients & push to online sockets
      (async () => {
        try {
          socket.emit("announcement_sent", { success: true, count: emails.length });
          console.log(`[Announcement] Payout announcement background job started for ${emails.length} users by ${socket.user.email}`);

          const cryptoLib = await import("crypto");
          const chunkSize = 500;
          for (let i = 0; i < emails.length; i += chunkSize) {
            const chunk = emails.slice(i, i + chunkSize);
            const recipientsToInsert = chunk.map(email => ({
              id: cryptoLib.randomUUID(),
              broadcastMessageId: broadcastMsg.id,
              toEmail: email,
              isRead: false
            }));

            await prisma.messageRecipient.createMany({
              data: recipientsToInsert,
              skipDuplicates: true
            });

            // Push live to online users
            recipientsToInsert.forEach(recipient => {
              const mappedMsg = {
                id: recipient.id,
                toEmail: recipient.toEmail,
                fromName: broadcastMsg.fromName,
                subject: broadcastMsg.subject,
                message: broadcastMsg.message,
                imageUrls: broadcastMsg.imageUrls,
                isRead: false,
                createdAt: broadcastMsg.createdAt,
                isBroadcast: true,
                isAnnouncement: true
              };
              io.to(`user:${recipient.toEmail}`).emit("receive_direct_message", mappedMsg);
            });

            await new Promise(res => setTimeout(res, 200));
          }

          console.log(`[Announcement] Payout announcement sent to ${emails.length} users by ${socket.user.email}`);
        } catch (err) {
          console.error("Payout announcement background error:", err);
          socket.emit("error_message", "Failed to complete announcement delivery.");
        }
      })();
    } catch (err) {
      console.error("Payout announcement error:", err);
      socket.emit("error_message", "Failed to send announcement.");
    }
  });

  // --- Jukebox Socket Listeners ---
  socket.on("jukebox_add_song", async ({ url, title }, callback) => {
    const ack = typeof callback === "function" ? callback : () => { };
    if (!url) return ack({ success: false, error: "Missing URL." });

    const now = Date.now();
    const lastTime = jukeboxLastAddedTimes.get(socket.user.email) || 0;
    if (now - lastTime < 10000) {
      const error = "Please wait 10 seconds before adding another song.";
      socket.emit("error_message", error);
      return ack({ success: false, error });
    }
    jukeboxLastAddedTimes.set(socket.user.email, now);

    let fetchedTitle = title || "Unknown Song";
    let thumbnail = null;

    try {
      if (url.includes("youtube.com") || url.includes("youtu.be")) {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const res = await fetch(oembedUrl);
        if (res.ok) {
          const data = await res.json();
          fetchedTitle = data.title || fetchedTitle;
          thumbnail = data.thumbnail_url || null;
        }
      }
    } catch (e) {
      console.error("[Jukebox] Failed to fetch oembed:", e);
    }

    const newSong = {
      id: Math.random().toString(36).substring(2, 11),
      url: url,
      title: fetchedTitle,
      thumbnail: thumbnail,
      requestedBy: socket.user.name || "Anonymous",
      requestedByEmail: socket.user.email
    };

    jukeboxQueue.push(newSong);

    if (!jukeboxCurrentSong) {
      playNextSong();
    } else {
      broadcastJukeboxState();
    }

    // Server-side quest tracking for "The Bards Ballad" (daily_q3)
    if (socket.user && socket.user.email) {
      try {
        const today = getPeriodStart();
        const email = socket.user.email;
        let loyalty = await prisma.userLoyalty.findUnique({ where: { email } });
        if (!loyalty) {
          loyalty = await prisma.userLoyalty.create({
            data: { email, completionsDate: today, completedQuests: [], questProgress: {}, updatedAt: new Date() }
          });
        }
        if (isNewPeriod(loyalty.completionsDate)) {
          loyalty = await prisma.userLoyalty.update({
            where: { id: loyalty.id },
            data: { completionsDate: today, completedQuests: [], questProgress: {} }
          });
        }

        const prevProgress = (loyalty.questProgress && typeof loyalty.questProgress === 'object') ? loyalty.questProgress : {};
        const completedQuests = Array.isArray(loyalty.completedQuests) ? loyalty.completedQuests : [];
        const currentSongCount = (prevProgress["daily_q3"] || 0) + 1;
        const updatedProgress = { ...prevProgress, daily_q3: currentSongCount };

        await prisma.userLoyalty.update({
          where: { id: loyalty.id },
          data: { questProgress: updatedProgress }
        });
        // Only the requester's own quest list changed — don't make every
        // connected client refetch their loyalty data.
        io.to(`user:${email.toLowerCase()}`).emit("refresh_quests");
      } catch (err) {
        console.error("[Jukebox] Bards Ballad quest tracking failed:", err);
      }
    }

    ack({ success: true, song: newSong });
  });

  socket.on("jukebox_vote_skip", () => {
    if (!jukeboxCurrentSong) return;

    jukeboxSkipVotes.add(socket.user.email);

    if (jukeboxSkipVotes.size >= 10) {
      playNextSong();
    } else {
      broadcastJukeboxState();
    }
  });

  socket.on("jukebox_remove_skip", () => {
    if (!jukeboxCurrentSong) return;

    if (jukeboxSkipVotes.has(socket.user.email)) {
      jukeboxSkipVotes.delete(socket.user.email);
      broadcastJukeboxState();
    }
  });

  socket.on("jukebox_song_ended", ({ songId }) => {
    // Only accept if it matches the current song, prevent spamming with a lock
    if (jukeboxCurrentSong && jukeboxCurrentSong.id === songId) {
      // Server-side guard: ignore 'ended' events if the song started less than 10 seconds ago.
      // This protects against old or background clients with autoplay-blockers instantly skipping the song for everyone.
      const elapsedSeconds = (Date.now() - jukeboxCurrentSong.startedAt) / 1000;
      if (elapsedSeconds < 10) {
        return;
      }

      if (!jukeboxEndedLock) {
        jukeboxEndedLock = true;
        playNextSong();
        setTimeout(() => { jukeboxEndedLock = false; }, 2000); // 2 second lock
      }
    }
  });

  socket.on("jukebox_join", () => {
    cancelClearJukebox();
    jukeboxListeners.add(socket.id);
    broadcastJukeboxState();
  });

  // Leaving simply stops the pings — the banked minutes and the partial minute
  // stay put, so closing the booth mid-minute doesn't throw that time away.
  socket.on("jukebox_leave", () => {
    jukeboxListeners.delete(socket.id);
    if (jukeboxListeners.size === 0) {
      scheduleClearJukebox();
    }
    broadcastJukeboxState();
  });

  // "The 60-Minute Harmony" heartbeat: credit the gap since this listener's
  // previous ping, bank every whole minute, and echo the running total back on
  // every ping so a single dropped event can't leave the card stuck on 0/60.
  socket.on("jukebox_heartbeat", async () => {
    const email = socket.user?.email?.toLowerCase();
    if (!email || !jukeboxCurrentSong) return;

    let session;
    try {
      session = await getDjSession(email);
    } catch (err) {
      console.error(`[Jukebox] could not read listening total for ${email}:`, err);
      return;
    }

    const wholeMinutes = creditPing(session);

    if (wholeMinutes > 0 && session.minutes < DJ_TARGET_MINUTES) {
      const before = session.minutes;

      try {
        const row = await prisma.jukeboxListening.upsert({
          where: { userEmail_periodKey: { userEmail: email, periodKey: session.periodKey } },
          create: { userEmail: email, periodKey: session.periodKey, minutes: wholeMinutes },
          update: { minutes: { increment: wholeMinutes } },
        });
        session.minutes = row.minutes;

        // Only on the crossing: pull the whole card down so it flips to claimable.
        if (before < DJ_TARGET_MINUTES && session.minutes >= DJ_TARGET_MINUTES) {
          io.to(`user:${email}`).emit("refresh_quests");
        }
      } catch (err) {
        // Hand the minute back so a transient DB error doesn't silently eat it.
        refundMinutes(session, wholeMinutes);
        console.error(`[Jukebox] minute accrual failed for ${email}:`, err);
      }
    }
    // Past the goal the minutes are simply dropped — the quest is done, so
    // there's nothing left to write for the rest of the day.

    io.to(`user:${email}`).emit("dj_minutes", djProgressPayload(session));
  });
  // --------------------------------

  // Handle joining room
  socket.on("join_room", async ({ chatType }) => {
    if (!isValidChatType(chatType)) {
      return socket.emit("error_message", "Invalid room name");
    }

    if (!(await canAccessRoom(socket, chatType))) {
      const message = chatType === "passers"
        ? "Passers Lounge is locked. Complete Standard Building training to unlock."
        : "Old Lounge is locked.";
      return socket.emit("error_message", message);
    }

    const roomName = `room:${chatType}`;

    // Leave previous room of the same type if any (a client is typically in one active tab)
    // For simplicity, just join the room
    socket.join(roomName);
  });

  // Handle fetching room history on-demand
  socket.on("get_room_history", async ({ chatType }) => {
    if (!isValidChatType(chatType) || !(await canAccessRoom(socket, chatType))) {
      return socket.emit("error_message", "You do not have access to this chat room history.");
    }
    const messages = await getChatMessages(chatType);
    socket.emit("initial_messages", { chatType, messages });
  });

  // Handle getting unread counts for rooms
  socket.on("get_unread_counts", async (lastSeenData) => {
    if (!lastSeenData || typeof lastSeenData !== "object") {
      return;
    }
    const counts = {};
    try {
      for (const [chatType, lastSeenId] of Object.entries(lastSeenData)) {
        if (!isValidChatType(chatType) || !(await canAccessRoom(socket, chatType))) {
          continue;
        }

        let count = 0;
        if (lastSeenId) {
          let foundInCache = false;
          if (isRedisReady()) {
            const cacheKey = `chat_messages:${chatType}`;
            const cachedRaw = await redis.lrange(cacheKey, 0, -1);
            if (cachedRaw && cachedRaw.length > 0) {
              const cached = cachedRaw.map(item => JSON.parse(item));
              const lastSeenIndex = cached.findIndex(m => m.id === lastSeenId);
              if (lastSeenIndex !== -1) {
                count = cached.length - 1 - lastSeenIndex;
                foundInCache = true;
              }
            }
          }

          if (!foundInCache) {
            const lastMsg = await prisma.chatMessage.findUnique({
              where: { id: lastSeenId },
              select: { createdAt: true }
            });
            if (lastMsg) {
              count = await prisma.chatMessage.count({
                where: {
                  chatType,
                  createdAt: { gt: lastMsg.createdAt }
                }
              });
            }
          }
        }
        counts[chatType] = count;
      }
      socket.emit("unread_counts_response", counts);
    } catch (err) {
      console.error("Error in get_unread_counts socket handler:", err);
    }
  });

  socket.on("send_message", async ({ chatType, text, imageUrl, replyToId, replyToSender, replyToText }) => {
    const hasText = typeof text === "string" && text.trim().length > 0;
    const hasImage = typeof imageUrl === "string" && imageUrl.trim().length > 0;

    if (!hasText && !hasImage) return;

    const cleanRole = socket.user.role?.trim()?.toLowerCase() || "";
    const isJudgerOrAdmin = cleanRole === "admin" || cleanRole === "judger";

    const isImageAllowedRole = ["admin", "judger", "checker", "recruiter"].includes(cleanRole);

    if (hasImage) {
      if (!isImageAllowedRole) {
        return socket.emit("error_message", "You do not have permission to send images.");
      }
    }

    if (hasText) {
      const BANNED_WORDS = ["bitmappro", "ryu", "glimmertech", "glim", "zybryx"];
      if (BANNED_WORDS.some(word => text.toLowerCase().includes(word))) {
        return;
      }

      if (hasDisallowedDomain(text) && !isJudgerOrAdmin) {
        return;
      }
    }

    if (!isValidChatType(chatType) || !(await canAccessRoom(socket, chatType))) {
      return socket.emit("error_message", "You do not have access to this chat room.");
    }

    // Rate Limiting: max 4 messages per 5 seconds
    const now = Date.now();
    if (!socket.rateLimitReset) {
      socket.rateLimitReset = now + 5000;
      socket.rateLimitCount = 0;
    }

    if (now > socket.rateLimitReset) {
      socket.rateLimitReset = now + 5000;
      socket.rateLimitCount = 0;
    }

    socket.rateLimitCount++;

    if (socket.rateLimitCount > 4) {
      return socket.emit("error_message", "Slow down! You are sending messages too fast.");
    }

    try {
      const senderRole = cleanRole === "admin" ? "admin" :
        cleanRole === "judger" ? "judger" :
          cleanRole === "checker" ? "checker" :
            cleanRole === "recruiter" ? "recruiter" :
              ["old-labeler", "old-laber", "old labeler"].includes(cleanRole) ? "old" :
                cleanRole === "labeler" ? "labeler" :
                  cleanRole === "applicant" ? "applicant" : "member";

      // Look up the replied-to message server-side so the quoted sender/text
      // can't be spoofed by a client sending fabricated replyToSender/replyToText.
      let replyData = {};
      if (replyToId) {
        const original = await prisma.chatMessage.findUnique({ where: { id: String(replyToId) } });
        if (original && original.chatType === chatType) {
          replyData = {
            replyToId: original.id,
            replyToSender: original.sender,
            replyToText: original.text
          };
        } else {
          replyData = {
            replyToId: replyToId ? String(replyToId) : null,
            replyToSender: replyToSender ? String(replyToSender) : null,
            replyToText: replyToText ? String(replyToText) : null
          };
        }
      }

      // Save to Database
      const message = await prisma.chatMessage.create({
        data: {
          chatType,
          sender: socket.user.name || socket.user.email,
          senderEmail: socket.user.email || null,
          senderRole,
          text: sanitizeText(text || ""),
          imageUrl: (hasImage && isImageAllowedRole) ? imageUrl.trim() : null,
          ...replyData
        }
      });

      const messageWithNames = {
        ...message,
        senderFirstName: socket.user.firstName || null,
        senderLastName: socket.user.lastName || null
      };

      // Cache in Redis
      if (isRedisReady()) {
        const cacheKey = `chat_messages:${chatType}`;
        try {
          await redis.rpush(cacheKey, JSON.stringify(messageWithNames));
          await redis.ltrim(cacheKey, -50, -1);
          await redis.del(`${cacheKey}:empty`);
        } catch (err) {
          console.error("Redis cache push error:", err);
        }
      }

      // Broadcast to all sockets in the room
      io.to(`room:${chatType}`).emit("new_message", { chatType, message: messageWithNames });

      // Pass the Torch: award LXP for helping a lower-role player via reply.
      // Fire-and-forget so it never blocks or fails the message send.
      if (replyToId) {
        awardTorchPoint(socket, io, replyToId, message.id).catch((err) =>
          console.error("Torch award error:", err)
        );
      }

      // Permanent FAQ Collection: Archive questions & replies exempt from 30-day deletion
      archiveFaqMessage(message, replyToId).catch((err) =>
        console.error("FAQ archive error:", err)
      );
    } catch (err) {
      console.error("Send message error:", err);
      socket.emit("error_message", "Failed to send message");
    }
  });

  // Handle editing a message
  socket.on("edit_message", async ({ chatType, messageId, newText }) => {
    if (!newText || !newText.trim()) return;

    const BANNED_WORDS = ["bitmappro", "ryu", "glimmertech", "glim"];
    if (BANNED_WORDS.some(word => newText.toLowerCase().includes(word))) {
      return;
    }

    if (hasDisallowedDomain(newText)) {
      return;
    }

    try {
      const message = await prisma.chatMessage.findUnique({
        where: { id: messageId }
      });

      if (!message) {
        return socket.emit("error_message", "Message not found");
      }

      const isAdmin = socket.user.role?.toLowerCase() === "admin";
      const isOwner = message.sender === socket.user.name || message.sender === socket.user.email;

      if (!isOwner && !isAdmin) {
        return socket.emit("error_message", "Unauthorized to edit this message");
      }

      // Update Database
      const updatedMessage = await prisma.chatMessage.update({
        where: { id: messageId },
        data: {
          text: sanitizeText(newText),
          isEdited: true
        }
      });

      const messageWithNames = {
        ...updatedMessage,
        senderFirstName: socket.user.firstName || null,
        senderLastName: socket.user.lastName || null
      };

      // Update Redis Cache
      if (isRedisReady()) {
        const cacheKey = `chat_messages:${chatType}`;
        try {
          const cached = await redis.lrange(cacheKey, 0, -1);
          if (cached && cached.length > 0) {
            const index = cached.findIndex((item) => {
              try {
                const parsed = JSON.parse(item);
                return parsed.id === messageId;
              } catch {
                return false;
              }
            });

            if (index !== -1) {
              await redis.lset(cacheKey, index, JSON.stringify(messageWithNames));
            }
          }
        } catch (err) {
          console.error("Redis cache update error:", err);
        }
      }

      // Broadcast update
      io.to(`room:${chatType}`).emit("message_edited", { chatType, message: messageWithNames });
    } catch (err) {
      console.error("Edit message error:", err);
      socket.emit("error_message", "Failed to edit message");
    }
  });

  // Handle deleting/unsending a message
  socket.on("delete_message", async ({ chatType, messageId, forceDelete }) => {
    try {
      const message = await prisma.chatMessage.findUnique({
        where: { id: messageId }
      });

      if (!message) {
        return socket.emit("error_message", "Message not found");
      }

      const cleanRole = socket.user.role?.trim()?.toLowerCase() || "";
      const isAdminOrJudger = cleanRole === "admin" || cleanRole === "judger";
      const isOwner = message.sender === socket.user.name || message.sender === socket.user.email;

      if (!isOwner && !isAdminOrJudger) {
        return socket.emit("error_message", "Unauthorized to delete this message");
      }

      if (forceDelete && isAdminOrJudger) {
        // Delete completely from database!
        await prisma.chatMessage.delete({
          where: { id: messageId }
        });

        // Invalidate Redis Cache completely
        if (isRedisReady()) {
          const cacheKey = `chat_messages:${chatType}`;
          try {
            await redis.del(cacheKey);
            await redis.del(`${cacheKey}:empty`);
          } catch (err) {
            console.error("Redis cache delete error:", err);
          }
        }

        // Broadcast removal
        io.to(`room:${chatType}`).emit("message_removed", { chatType, messageId });
      } else {
        // Update Database to "Message unsent"
        const updatedMessage = await prisma.chatMessage.update({
          where: { id: messageId },
          data: {
            text: "Message unsent"
          }
        });

        const messageWithNames = {
          ...updatedMessage,
          senderFirstName: socket.user.firstName || null,
          senderLastName: socket.user.lastName || null
        };

        // Update Redis Cache
        if (isRedisReady()) {
          const cacheKey = `chat_messages:${chatType}`;
          try {
            const cached = await redis.lrange(cacheKey, 0, -1);
            if (cached && cached.length > 0) {
              const index = cached.findIndex((item) => {
                try {
                  const parsed = JSON.parse(item);
                  return parsed.id === messageId;
                } catch {
                  return false;
                }
              });

              if (index !== -1) {
                await redis.lset(cacheKey, index, JSON.stringify(messageWithNames));
              }
            }
          } catch (err) {
            console.error("Redis cache delete error:", err);
          }
        }

        // Broadcast update
        io.to(`room:${chatType}`).emit("message_deleted", { chatType, message: messageWithNames });
      }
    } catch (err) {
      console.error("Delete message error:", err);
      socket.emit("error_message", "Failed to delete message");
    }
  });

  socket.on("chat_widget_status", ({ isOpen, activeTab }) => {
    if (socket.user.email) {
      if (isOpen) {
        activeChatWidgetConnections.set(socket.id, { email: socket.user.email, activeTab });
      } else {
        activeChatWidgetConnections.delete(socket.id);
      }
      broadcastChatWidgetCount(io);
    }
  });

  socket.on("disconnect", () => {
    if (socket.user.email) {
      activeConnections.delete(socket.id);
      activeChatWidgetConnections.delete(socket.id);
      broadcastOnlineCount(io);
      broadcastChatWidgetCount(io);
    }

    // Remove from jukebox listeners if they were listening
    if (jukeboxListeners.has(socket.id)) {
      jukeboxListeners.delete(socket.id);
      if (jukeboxListeners.size === 0) {
        scheduleClearJukebox();
      }
      broadcastJukeboxState();
    }
  });
});

// ─── Pass the Torch progress ─────────────────────────────────────────────────
// Called on every reply. Records ONE unit of progress when the sender helps a
// strictly-lower-role player (or a same-rank peer, if the sender is the lowest
// rank). All checks are server-authoritative; the client can't influence the
// outcome. No LXP is paid here — the reward is granted only when the user
// manually claims the completed card (frontend completeQuest).
//
// Anti-spam is enforced at the database level: TorchHelp is UNIQUE on
// (helpedEmail, periodKey), so each helped player yields a point to exactly ONE
// helper per day — whoever replies first claims them; later repliers get a P2002
// and earn nothing. The daily cap is the helper's own LXP-rank target (higher
// LXP ranks ask for more unique players — see getTorchQuota), not a flat number.
async function awardTorchPoint(socket, ioInstance, replyToId, messageId) {
  const helperEmail = socket.user?.email;
  if (!helperEmail) return;

  // Resolve who is being helped from the parent message (authoritative source).
  const parent = await prisma.chatMessage.findUnique({
    where: { id: String(replyToId) },
    select: { senderEmail: true, sender: true, senderRole: true },
  });
  if (!parent) return;

  // Always resolve the helped user from the User table, so the ladder check uses
  // their true role. senderEmail is the reliable key, but almost every existing
  // message predates that column and stores only a display name — so fall back to
  // matching on name. When the name is shared by several users (common here), use
  // the role recorded on the message to pick the one whose rank matches; if that
  // still isn't exactly one, skip rather than guess — a wrong match would both
  // mis-credit and corrupt the per-player dedup.
  let helpedUser = null;
  if (parent.senderEmail) {
    helpedUser = await prisma.user.findUnique({
      where: { email: parent.senderEmail },
      select: { email: true, role: true },
    });
  } else if (parent.sender) {
    const matches = await prisma.user.findMany({
      where: { OR: [{ email: parent.sender }, { name: parent.sender }] },
      select: { email: true, role: true },
      take: 10,
    });
    if (matches.length === 1) {
      helpedUser = matches[0];
    } else if (matches.length > 1) {
      const wantRank = getTorchRank(parent.senderRole);
      if (wantRank > 0) {
        const byRank = matches.filter((m) => getTorchRank(m.role) === wantRank);
        if (byRank.length === 1) helpedUser = byRank[0];
      }
    }
  }
  if (!helpedUser?.email) return;

  const helpedEmail = helpedUser.email;
  if (helpedEmail === helperEmail) return; // self-reply

  if (!isTorchEligible(socket.user?.role, helpedUser.role)) return;

  const periodKey = getPeriodKey();

  // "No more, no less": a helper stops earning progress once they've claimed
  // their rank's daily target. Checked before the insert so a maxed-out helper
  // doesn't consume (globally claim) an extra player for no benefit.
  // Rank-scaled targets are unreleased — admin-only until they go public. Must
  // match isGamificationPreviewVisible() in frontend/src/config/permissions.ts.
  const isGamificationPreview = socket.user?.role?.trim()?.toLowerCase() === "admin";
  const { torchTarget } = isGamificationPreview
    ? await getTorchQuota(prisma, helperEmail, socket.user?.role)
    : { torchTarget: TORCH_DAILY_CAP };
  const claimedSoFar = await prisma.torchHelp.count({
    where: { helperEmail, periodKey },
  });
  if (claimedSoFar >= torchTarget) return;

  // Claim this player for today. UNIQUE(helpedEmail, periodKey) means the first
  // helper to reply wins them; any later reply to the same player throws P2002.
  try {
    await prisma.torchHelp.create({
      data: { helperEmail, helpedEmail, periodKey, messageId: messageId || null },
    });
  } catch (err) {
    if (err?.code === "P2002") return; // this player was already claimed today
    throw err;
  }

  // Progress changed — nudge the helper's own clients to refetch the quest card
  // (0/20 -> 1/20 -> …). Both casings cover rooms joined under either form.
  ioInstance
    .to(`user:${helperEmail}`)
    .to(`user:${helperEmail.toLowerCase()}`)
    .emit("refresh_quests");
}

// Permanent FAQ Question Archive: Stores authentic questions & linked replies without 30-day auto-delete
async function archiveFaqMessage(message, replyToId) {
  try {
    if (isGenuineQuestion(message.text)) {
      const { category, intent } = classifyFaq(message.text);
      await prisma.faqQuestionArchive.create({
        data: {
          originalMsgId: String(message.id),
          chatType: message.chatType,
          category,
          intent,
          question: message.text,
          askedBy: message.sender,
          askedByEmail: message.senderEmail || null,
          askedByRole: message.senderRole || null,
          createdAt: message.createdAt,
        },
      });
    }

    if (replyToId) {
      const parentArchive = await prisma.faqQuestionArchive.findFirst({
        where: { originalMsgId: String(replyToId) },
      });

      if (parentArchive) {
        await prisma.faqQuestionArchive.update({
          where: { id: parentArchive.id },
          data: {
            answer: message.text,
            answeredBy: message.sender,
            answeredByRole: message.senderRole || null,
            answeredAt: message.createdAt,
          },
        });
      }
    }
  } catch (err) {
    console.error("[FAQ Archive] Error archiving question/reply:", err);
  }
}

// In-flight DB fetches keyed by chatType, so concurrent cache-miss joins
// (e.g. a mass-reconnect right after a deploy) share one query instead of
// each triggering its own Postgres round trip.
const pendingChatFetches = new Map();

// Helper function to fetch messages (matches frontend chat action logic)
async function getChatMessages(chatType) {
  const cacheKey = `chat_messages:${chatType}`;

  // 1. Try Redis cache
  if (isRedisReady()) {
    try {
      const emptyMarker = await redis.get(`${cacheKey}:empty`);
      if (emptyMarker === "true") {
        return [];
      }

      const cached = await redis.lrange(cacheKey, 0, -1);
      if (cached && cached.length > 0) {
        return cached.map((item) => JSON.parse(item));
      }
    } catch (err) {
      console.error("Redis fetch error:", err);
    }
  }

  // 2. Fetch from database, single-flighted per chatType
  if (pendingChatFetches.has(chatType)) {
    return pendingChatFetches.get(chatType);
  }

  const fetchPromise = fetchChatMessagesFromDb(chatType).finally(() => {
    pendingChatFetches.delete(chatType);
  });
  pendingChatFetches.set(chatType, fetchPromise);
  return fetchPromise;
}

async function fetchChatMessagesFromDb(chatType) {
  const cacheKey = `chat_messages:${chatType}`;

  try {
    const dbMessagesRaw = await prisma.chatMessage.findMany({
      where: { chatType },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    const dbMessages = dbMessagesRaw.reverse();

    if (dbMessages.length === 0) {
      if (isRedisReady()) {
        try {
          await redis.set(`${cacheKey}:empty`, "true", "EX", 10);
        } catch (err) {
          console.error("Redis set empty error:", err);
        }
      }
      return [];
    }

    // Fetch sender profiles to get firstName and lastName
    const senders = Array.from(new Set(dbMessages.map(m => m.sender)));
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: { in: senders } },
          { name: { in: senders } }
        ]
      },
      select: {
        email: true,
        name: true,
        firstName: true,
        lastName: true
      }
    });

    const messagesWithNames = dbMessages.map((msg) => {
      const user = users.find(u => u.email === msg.sender || u.name === msg.sender);
      return {
        ...msg,
        senderFirstName: user?.firstName || null,
        senderLastName: user?.lastName || null
      };
    });

    // Write to Redis cache
    if (isRedisReady() && messagesWithNames.length > 0) {
      try {
        await redis.del(cacheKey);
        await redis.del(`${cacheKey}:empty`);
        await redis.rpush(cacheKey, ...messagesWithNames.map((msg) => JSON.stringify(msg)));
        await redis.expire(cacheKey, 86400);
      } catch (err) {
        console.error("Redis cache write error:", err);
      }
    }

    return messagesWithNames;
  } catch (err) {
    console.error("Database fetch error:", err);
    return [];
  }
}

// Database & Storage Pruning Job: Deletes chat messages and their R2 images older than 30 days (1 month) every hour
setInterval(async () => {
  try {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // 1. Find all expired messages with images
    const expiredMessagesWithImages = await prisma.chatMessage.findMany({
      where: {
        createdAt: { lt: oneMonthAgo },
        imageUrl: { not: null },
      },
      select: { imageUrl: true },
    });

    if (expiredMessagesWithImages.length > 0) {
      const rawImageUrls = Array.from(
        new Set(
          expiredMessagesWithImages
            .map((m) => m.imageUrl?.trim())
            .filter((url) => Boolean(url))
        )
      );

      // Check which images are NOT referenced by any active/newer messages (< 30 days)
      const keysToDelete = [];
      for (const url of rawImageUrls) {
        const stillInUse = await prisma.chatMessage.findFirst({
          where: {
            imageUrl: url,
            createdAt: { gte: oneMonthAgo },
          },
          select: { id: true },
        });

        if (!stillInUse) {
          const r2Key = extractR2Key(url);
          if (r2Key) {
            keysToDelete.push(r2Key);
          }
        }
      }

      if (keysToDelete.length > 0) {
        const deletedR2Count = await deleteR2Objects(keysToDelete);
        if (deletedR2Count > 0) {
          console.log(`[Cleanup] Deleted ${deletedR2Count} expired image(s) from Cloudflare R2.`);
        }
      }
    }

    // 2. Delete database records older than 30 days
    const deleted = await prisma.chatMessage.deleteMany({
      where: {
        createdAt: {
          lt: oneMonthAgo,
        },
      },
    });

    if (deleted.count > 0) {
      console.log(`[Cleanup] Deleted ${deleted.count} chat messages older than 30 days from database.`);
    }
  } catch (err) {
    console.error("[Cleanup] Database pruning error:", err);
  }
}, 3600 * 1000); // Run hourly

// Account Deactivation Job: Deactivates users who have not logged in for 30 days, or registered and never logged in for 30 days
async function runAccountDeactivationJob() {
  try {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Find all active users who are eligible for deactivation.
    // A user is skipped if their record was updated within the last 30 days
    // (e.g., manually reactivated by an admin), even if their lastLogin is stale.
    const usersToDeactivate = await prisma.user.findMany({
      where: {
        status: "Active",
        updatedAt: {
          lt: oneMonthAgo,
        },
        OR: [
          {
            lastLogin: {
              lt: oneMonthAgo,
            },
          },
          {
            lastLogin: null,
            createdAt: {
              lt: oneMonthAgo,
            },
          },
        ],
      },
      select: { email: true, role: true }
    });

    // Judgers and admins are never auto-deactivated
    const emails = usersToDeactivate
      .filter(u => !isNeverDeactivatedRole(u.role))
      .map(u => u.email);

    if (emails.length > 0) {
      await prisma.$transaction([
        prisma.user.updateMany({
          where: { email: { in: emails } },
          data: { status: "Deactivated" },
        }),
        prisma.currentIncome.updateMany({
          where: { email: { in: emails } },
          data: { estimatedAmount: 0 },
        })
      ]);
      console.log(`[Deactivation] Deactivated ${emails.length} inactive users and zeroed their wallets.`);
    }
  } catch (err) {
    console.error("[Deactivation] Account deactivation error:", err);
  }
}

// Run account deactivation job once on boot
runAccountDeactivationJob();

// Run daily
setInterval(runAccountDeactivationJob, 24 * 3600 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// AUTOMATED CHAT MESSAGES
// ─────────────────────────────────────────────────────────────────────────────

// Map of automatedMessage.id → NodeJS interval handle
const automatedIntervals = new Map();

/**
 * Fires a single automated message into the correct chat room.
 * Skips if outside the startTime/endTime window.
 */
async function fireAutomatedMessage(record) {
  try {
    const now = new Date();

    // Honour optional time-window restrictions
    if (record.startTime && now < new Date(record.startTime)) return;
    if (record.endTime && now > new Date(record.endTime)) return;

    // Validate chatType
    if (!VALID_CHAT_TYPES.includes(record.chatType)) return;

    // Persist to ChatMessage so it appears in the scrollback just like a real message
    const saved = await prisma.chatMessage.create({
      data: {
        chatType: record.chatType,
        sender: record.senderName || "System",
        senderRole: record.senderRole || "moderator",
        text: record.message,
      }
    });

    const broadcast = {
      ...saved,
      senderFirstName: null,
      senderLastName: null,
      isAutomated: true,
    };

    // Push into Redis cache
    if (isRedisReady()) {
      const cacheKey = `chat_messages:${record.chatType}`;
      try {
        await redis.rpush(cacheKey, JSON.stringify(broadcast));
        await redis.ltrim(cacheKey, -50, -1);
        await redis.del(`${cacheKey}:empty`);
      } catch (err) {
        console.error("[AutoChat] Redis push error:", err);
      }
    }

    // Broadcast to all clients in the room
    io.to(`room:${record.chatType}`).emit("new_message", {
      chatType: record.chatType,
      message: broadcast,
    });

    // Update lastSentAt
    await prisma.automatedChatMessage.update({
      where: { id: record.id },
      data: { lastSentAt: now },
    });

    console.log(`[AutoChat] Fired message "${record.id}" → ${record.chatType}`);
  } catch (err) {
    console.error(`[AutoChat] Error firing message "${record.id}":`, err);
  }
}

/**
 * Register or re-register a single automated message interval.
 * Clears any existing interval for this id first.
 */
function scheduleAutomatedMessage(record) {
  // Clear old interval if already running
  if (automatedIntervals.has(record.id)) {
    clearInterval(automatedIntervals.get(record.id));
    automatedIntervals.delete(record.id);
  }

  if (!record.isActive) return; // Deactivated — don't schedule

  const ms = record.frequency * 60 * 1000; // frequency is in minutes
  if (!ms || ms <= 0) return;

  const handle = setInterval(() => fireAutomatedMessage(record), ms);
  automatedIntervals.set(record.id, handle);
  console.log(`[AutoChat] Scheduled "${record.id}" every ${record.frequency} min → ${record.chatType}`);
}

/** Load all active records from the database and schedule them. */
async function initAutomatedMessages() {
  try {
    if (!prisma.automatedChatMessage) return;
    const records = await prisma.automatedChatMessage.findMany({
      where: { isActive: true },
    });
    records.forEach(scheduleAutomatedMessage);
    console.log(`[AutoChat] Initialised ${records.length} automated message(s).`);
  } catch (err) {
    console.error("[AutoChat] Init error:", err);
  }
}

// Boot the scheduler once the server is ready
initAutomatedMessages();

// Poll the DB every 60 s to pick up records added/changed/removed directly in PostgreSQL
setInterval(async () => {
  try {
    if (!prisma.automatedChatMessage) return;
    const records = await prisma.automatedChatMessage.findMany({
      where: { isActive: true },
    });

    const activeIds = new Set(records.map(r => r.id));

    // Stop intervals for records that are now gone or deactivated
    for (const [id, handle] of automatedIntervals) {
      if (!activeIds.has(id)) {
        clearInterval(handle);
        automatedIntervals.delete(id);
        console.log(`[AutoChat] Removed schedule for "${id}" (deleted or deactivated)`);
      }
    }

    // Add or refresh intervals for active records
    records.forEach(record => {
      // Re-schedule if not yet running or frequency changed
      const alreadyRunning = automatedIntervals.has(record.id);
      if (!alreadyRunning) {
        scheduleAutomatedMessage(record);
      }
    });
  } catch (err) {
    console.error("[AutoChat] Polling sync error:", err);
  }
}, 60 * 1000); // every 60 seconds


// Start HTTP server
httpServer.listen(PORT, () => {
  console.log(`[Server] Chat WebSocket Server is running on port ${PORT}`);
});