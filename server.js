require('dotenv').config();

const crypto = require('crypto');
const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const { Server } = require('socket.io');
const products = require('./data/products');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH']
  }
});
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
const VISITS_FILE = path.join(DATA_DIR, 'visits.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const DISCLAIMER = 'This is an independent service request and information portal. We are not affiliated with Microsoft Corporation.';
const SITE_URL = (process.env.SITE_URL || 'https://printeronlines.shop').replace(/\/+$/, '');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin@123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'local-development-secret-change-me';
const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 30;
const allowedStatuses = ['New', 'Open', 'Pending', 'In Progress', 'Closed'];
const productBySlug = new Map(products.map((product) => [product.slug, product]));
const slugAliases = new Map([
  ['edge', 'microsoft-edge'],
  ['microsoft-copilot', 'copilot'],
  ['defender', 'windows-defender'],
  ['microsoft-defender', 'windows-defender'],
  ['store', 'microsoft-store'],
  ['hp', 'hp-printer'],
  ['canon', 'canon-printer'],
  ['epson', 'epson-printer'],
  ['brother', 'brother-printer'],
  ['printer-offline', 'printer']
]);
const writeQueues = new Map();

class JsonSessionStore extends session.Store {
  constructor(file) {
    super();
    this.file = file;
    fsSync.mkdirSync(path.dirname(file), { recursive: true });
  }

  async readStore() {
    try {
      const text = await fs.readFile(this.file, 'utf8');
      return text.trim() ? JSON.parse(text) : {};
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
  }

  async writeStore(sessions) {
    const now = Date.now();
    const activeSessions = Object.fromEntries(Object.entries(sessions).filter(([, value]) => {
      const expires = value?.cookie?.expires ? new Date(value.cookie.expires).getTime() : now + SESSION_MAX_AGE;
      return Number.isNaN(expires) || expires > now;
    }));
    await fs.writeFile(this.file, JSON.stringify(activeSessions, null, 2), 'utf8');
  }

  get(sid, callback) {
    this.readStore()
      .then((sessions) => callback(null, sessions[sid] || null))
      .catch(callback);
  }

  set(sid, sess, callback = () => {}) {
    this.readStore()
      .then(async (sessions) => {
        sessions[sid] = sess;
        await this.writeStore(sessions);
        callback(null);
      })
      .catch(callback);
  }

  destroy(sid, callback = () => {}) {
    this.readStore()
      .then(async (sessions) => {
        delete sessions[sid];
        await this.writeStore(sessions);
        callback(null);
      })
      .catch(callback);
  }

  touch(sid, sess, callback = () => {}) {
    this.set(sid, sess, callback);
  }
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 2000,
  message: 'Too many requests. Please wait a moment, then refresh the page.',
  standardHeaders: true,
  legacyHeaders: false
}));

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 40,
  message: 'Too many submissions from this connection. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: 'Too many login attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

app.use(express.urlencoded({ extended: false, limit: '25kb' }));
app.use(express.json({ limit: '25kb' }));
app.use(session({
  name: 'portal.sid',
  store: new JsonSessionStore(SESSIONS_FILE),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE
  }
}));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true
}));

function cleanText(value, maxLength = 500) {
  return String(value ?? '')
    .replace(/\0/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/[\r\n]{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function cleanSlug(value) {
  return cleanText(value, 80).toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function clientIp(req) {
  return cleanText(req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown', 120);
}

function userAgent(req) {
  return cleanText(req.get('user-agent') || 'unknown', 300);
}

function dateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function isoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localDateFromIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return isoDate(date);
}

function isToday(value) {
  return localDateFromIso(value) === isoDate();
}

function createTicketToken() {
  const suffix = crypto.randomBytes(4).toString('hex').slice(0, 5).toUpperCase();
  return `MSR-${dateStamp()}-${suffix}`;
}

function createChatId() {
  return `CHAT-${dateStamp()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function createMessage(sender, text) {
  return {
    id: crypto.randomUUID(),
    sender,
    text: cleanText(text, 1500),
    createdAt: new Date().toISOString()
  };
}

function messageTime(message) {
  return message.createdAt || message.at || new Date().toISOString();
}

function messageSender(sender) {
  return sender === 'customer' ? 'visitor' : sender;
}

function normalizeStatus(status, fallback = 'Open') {
  const raw = cleanText(status, 40).toLowerCase();
  const map = {
    new: 'New',
    open: 'Open',
    pending: 'Pending',
    'in-progress': 'In Progress',
    'in progress': 'In Progress',
    closed: 'Closed'
  };
  return map[raw] || fallback;
}

function selectedProductFrom(value) {
  const rawSlug = cleanSlug(value);
  const slug = slugAliases.get(rawSlug) || rawSlug;
  return productBySlug.get(slug) || products[0];
}

function isPrinterProductSlug(slug) {
  const product = productBySlug.get(cleanSlug(slug));
  return Boolean(product && (product.slug.includes('printer') || product.iconClass.includes('printer')));
}

function printerProducts() {
  return products.filter((product) => isPrinterProductSlug(product.slug));
}

function publicMicrosoftProducts() {
  return products.filter((product) => !isPrinterProductSlug(product.slug));
}

function withProductMeta(chat) {
  const productMeta = selectedProductFrom(chat.productSlug);
  return {
    ...chat,
    productIconText: productMeta.iconText,
    productIconClass: productMeta.iconClass
  };
}

function categoryTitle(category) {
  return typeof category === 'string' ? category : category.title;
}

function categorySlug(category) {
  return typeof category === 'string' ? cleanSlug(category) : category.slug;
}

function chatIssueOptionsFor(product) {
  const commonWindows = [
    'Windows freeze or not responding',
    'Windows error message',
    'Windows update not working',
    'Computer running slow',
    'Pop-up causing Windows to freeze',
    'Internet or Wi-Fi not working',
    'Blue screen after pop-up or system error'
  ];
  const microsoftIssues = [
    'Windows freeze or error',
    'Windows update not working',
    'Pop-up causing Windows to freeze',
    'Blue screen after pop-up or system error',
    'Excel file or formula issue',
    'Word document issue',
    'Outlook email setup issue',
    'OneDrive sync or storage issue',
    'Teams meeting audio/video issue'
  ];
  const printerIssues = [
    'Printer offline',
    'Wireless printer setup',
    'Driver installation',
    'Print queue stuck',
    'Paper jam guidance',
    'Ink or toner question',
    'Scanner setup',
    'Cartridge guidance'
  ];
  if (product?.slug === 'microsoft') return microsoftIssues;
  if (product?.slug === 'windows') return commonWindows;
  if (product?.slug && product.slug.includes('printer')) return printerIssues;
  return (product?.categories || []).map(categoryTitle);
}

function guideAssistantReplies(productSlug, issueCategory) {
  const issue = cleanText(issueCategory, 160).toLowerCase();
  const isMicrosoft = cleanSlug(productSlug) === 'microsoft';
  const safetyReply = 'Please do not share passwords, OTPs, recovery codes, product keys, payment details, or remote access information.';
  const contactReply = 'Your request is now in the queue. A product guide representative will review it and contact you shortly.';
  const microsoftMap = [
    ['windows freeze or error', 'Your Windows freeze or error question has been received. Please share what appears on screen.'],
    ['windows update not working', 'Your Windows update question has been received. Please tell if it is stuck or failed.'],
    ['pop-up causing windows to freeze', 'Your pop-up and Windows freeze question has been received. Please share what appears on screen.'],
    ['blue screen after pop-up or system error', 'Your blue screen or system error question has been received. Please share what appears on screen.'],
    ['excel file or formula issue', 'Your Excel question has been received. Please share the file or formula issue.'],
    ['word document issue', 'Your Word document question has been received. Please tell what is not working.'],
    ['outlook email setup issue', 'Your Outlook setup question has been received. Please share what step is causing trouble.'],
    ['onedrive sync or storage issue', 'Your OneDrive question has been received. Please tell if sync or storage is the issue.'],
    ['teams meeting audio/video issue', 'Your Teams meeting question has been received. Please tell if audio, video, or joining is the issue.']
  ];
  const generalMap = [
    ['windows freeze or not responding', 'Your Windows freeze question has been received. Please tell when it freezes.'],
    ['windows error message', 'Your Windows error question has been received. Please share the error text or code.'],
    ['windows update not working', 'Your Windows update question has been received. Please tell if it is stuck or failed.'],
    ['computer running slow', 'Your slow performance question has been received. Please tell when it becomes slow.'],
    ['pop-up causing windows to freeze', 'Your pop-up and Windows freeze question has been received. Please share what appears on screen.'],
    ['app or software not opening', 'Your app opening question has been received. Please share the app name.'],
    ['internet or wi-fi not working', 'Your internet or Wi-Fi question has been received. Please tell what is not working.'],
    ['blue screen after pop-up or system error', 'Your blue screen or system error question has been received. Please share what appears on screen.'],
    ['blue screen or startup problem', 'Your blue screen or startup question has been received. Please share what appears on screen.']
  ];
  const printerMap = [
    ['printer offline', 'Your printer offline question has been received. Please share whether the printer is connected by Wi-Fi, USB, or network.'],
    ['wireless printer setup', 'Your wireless printer setup question has been received. Please share your printer model and connection type.'],
    ['driver installation', 'Your printer driver installation question has been received. Please share your printer model and device type.'],
    ['print queue stuck', 'Your print queue question has been received. Please tell if print jobs are stuck, paused, or failing.'],
    ['paper jam guidance', 'Your paper jam guidance question has been received. Please share where the paper appears stuck.'],
    ['ink or toner question', 'Your ink or toner question has been received. Please share the supply message shown on the printer or device.'],
    ['scanner setup', 'Your scanner setup question has been received. Please tell if you are scanning from the printer panel or computer.'],
    ['cartridge guidance', 'Your cartridge guidance question has been received. Please share the cartridge or supply message shown.']
  ];
  const isPrinter = cleanSlug(productSlug).includes('printer');
  const matched = (isMicrosoft ? microsoftMap : isPrinter ? printerMap : generalMap).find(([key]) => issue.includes(key));
  const guideReply = matched
    ? matched[1]
    : 'Your product question has been received. Please share a few more details so our guide assistant can review it.';
  return [guideReply, contactReply, safetyReply];
}

function absoluteUrl(pathname = '/') {
  const pathPart = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${SITE_URL}${pathPart}`;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeJsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function seoForProduct(product) {
  return product.seo || {
    title: `${product.pageTitle || `${product.name} Help Guide`} | Independent Product Help Portal`,
    description: `Independent ${product.name} guide for ${product.categories.slice(0, 4).map(categoryTitle).join(', ').toLowerCase()} and service request guidance. Not affiliated with Microsoft Corporation.`,
    keywords: [`${product.name} help guide`, `${product.name} setup guidance`, `${product.name} service request`]
  };
}

function relatedProductsFor(product) {
  const relatedMap = {
    excel: ['word', 'powerpoint', 'microsoft-365', 'onedrive'],
    word: ['excel', 'powerpoint', 'microsoft-365', 'onedrive'],
    powerpoint: ['excel', 'word', 'microsoft-365', 'teams'],
    outlook: ['microsoft-365', 'teams', 'onedrive', 'microsoft-edge'],
    windows: ['windows-11', 'windows-10', 'windows-update', 'windows-security', 'microsoft-edge'],
    'windows-11': ['windows', 'windows-update', 'windows-security', 'microsoft-edge'],
    'windows-10': ['windows', 'windows-update', 'windows-security', 'windows-defender'],
    'windows-update': ['windows', 'windows-11', 'windows-10', 'windows-security'],
    'windows-security': ['windows', 'windows-defender', 'windows-update', 'microsoft-edge'],
    printer: ['printer-setup', 'hp-printer', 'canon-printer', 'epson-printer'],
    'printer-setup': ['printer', 'hp-printer', 'canon-printer', 'brother-printer'],
    'hp-printer': ['printer', 'printer-setup', 'canon-printer', 'epson-printer'],
    'canon-printer': ['printer', 'printer-setup', 'hp-printer', 'epson-printer'],
    'epson-printer': ['printer', 'printer-setup', 'hp-printer', 'brother-printer'],
    'brother-printer': ['printer', 'printer-setup', 'hp-printer', 'canon-printer']
  };
  const slugs = relatedMap[product.slug] || products
    .filter((item) => item.slug !== product.slug)
    .slice(0, 4)
    .map((item) => item.slug);
  return slugs.map((slug) => productBySlug.get(slug)).filter(Boolean);
}

function categoriesFor(product) {
  return product
    ? product.categories.map(categoryTitle)
    : products.flatMap((item) => item.categories.map(categoryTitle));
}

function hasSensitiveData(message) {
  const text = cleanText(message, 1800);
  const patterns = [
    /(password|passcode|pin|otp|one[-\s]?time code|recovery code|security code)\s*(is|:|=)\s*\S+/i,
    /(card number|credit card|debit card|cvv|cvc|expiry)\s*(is|:|=)?/i,
    /\b(?:\d[ -]*?){13,19}\b/,
    /(anydesk|teamviewer|screen share code|device control code)\s*(is|:|=)?/i
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function requestFields(body) {
  return {
    name: cleanText(body.name, 80),
    phone: cleanText(body.phone, 40),
    email: cleanText(body.email, 120),
    productSlug: cleanSlug(body.product || body.productSlug),
    issueCategory: cleanText(body.selectedIssue || body.issueCategory || body.issue, 140),
    message: cleanText(body.message, 1500)
  };
}

function validateFields(fields, options = { requireEmail: true }) {
  const errors = {};
  const product = productBySlug.get(fields.productSlug);

  if (!fields.name) errors.name = 'Name is required.';
  if (!fields.phone) errors.phone = 'Phone is required.';
  if (options.requireEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    errors.email = 'A valid email is required.';
  }
  if (!product) errors.product = 'Choose a valid product.';
  if (!fields.issueCategory) errors.issueCategory = 'Choose an issue category.';
  if (!fields.message || fields.message.length < 8) {
    errors.message = 'Message must be at least 8 characters.';
  }
  if (hasSensitiveData(fields.message)) {
    errors.message = 'Please remove account credentials, one-time codes, recovery codes, payment card details, or device-control details.';
  }

  return { errors, product };
}

async function readJson(file, fallback = []) {
  try {
    const text = await fs.readFile(file, 'utf8');
    if (!text.trim()) return fallback;
    return JSON.parse(text);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(file, data) {
  const tempFile = `${file}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tempFile, file);
}

function mutateJson(file, fallback, mutator) {
  const previous = writeQueues.get(file) || Promise.resolve();
  const next = previous.then(async () => {
    const data = await readJson(file, fallback);
    const result = await mutator(data);
    await writeJson(file, data);
    return result;
  });
  writeQueues.set(file, next.catch(() => undefined));
  return next;
}

async function appendJson(file, item) {
  return mutateJson(file, [], async (items) => {
    items.push(item);
    return item;
  });
}

function chatHref(product) {
  return isPrinterProductSlug(product?.slug) ? `/printer-chat?product=${product.slug}` : `/chat?product=${product.slug}`;
}

function normalizeChat(chat) {
  if (!chat) return null;
  const productMeta = selectedProductFrom(chat.productSlug || chat.product);
  const messages = Array.isArray(chat.messages) ? chat.messages : [];
  const lastMessage = messages[messages.length - 1] || null;
  return {
    ...chat,
    id: chat.id || chat.sessionId,
    sessionId: chat.sessionId || chat.id,
    status: normalizeStatus(chat.status, 'Open'),
    product: chat.product || productMeta.name,
    productName: chat.product || productMeta.name,
    productSlug: chat.productSlug || productMeta.slug,
    productIconText: productMeta.iconText,
    productIconClass: productMeta.iconClass,
    customer: chat.customer || chat.visitor || {},
    visitor: chat.visitor || chat.customer || {},
    unreadAdmin: Number(chat.unreadAdmin || 0),
    unreadCustomer: Number(chat.unreadCustomer || 0),
    visitorOnline: Boolean(chat.visitorOnline),
    adminOnline: Boolean(chat.adminOnline),
    lastMessage: chat.lastMessage || (lastMessage ? lastMessage.text : ''),
    lastMessageAt: chat.lastMessageAt || (lastMessage ? messageTime(lastMessage) : (chat.updatedAt || chat.createdAt)),
    messages: messages.map((message) => ({
      ...message,
      id: message.id || crypto.randomUUID(),
      sender: messageSender(message.sender),
      createdAt: message.createdAt || message.at || new Date().toISOString(),
      at: message.at || message.createdAt || new Date().toISOString(),
      seen: Boolean(message.seen)
    }))
  };
}

function serializeChat(chat) {
  const normalized = normalizeChat(chat);
  return {
    ...normalized,
    id: normalized.sessionId,
    sessionId: normalized.sessionId,
    visitor: normalized.visitor,
    customer: normalized.customer,
    updatedAt: normalized.updatedAt || normalized.lastMessageAt || normalized.createdAt
  };
}

function chatSummary(chat) {
  const normalized = normalizeChat(chat);
  return {
    id: normalized.sessionId,
    sessionId: normalized.sessionId,
    status: normalized.status,
    product: normalized.productName,
    productName: normalized.productName,
    productSlug: normalized.productSlug,
    productIconText: normalized.productIconText,
    productIconClass: normalized.productIconClass,
    issueCategory: normalized.issueCategory || 'General question',
    visitor: normalized.visitor,
    customer: normalized.customer,
    visitorOnline: normalized.visitorOnline,
    adminOnline: normalized.adminOnline,
    unreadAdmin: normalized.unreadAdmin,
    unreadCustomer: normalized.unreadCustomer,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    lastMessage: normalized.messages[normalized.messages.length - 1] || null,
    lastMessageText: normalized.lastMessage,
    lastMessageAt: normalized.lastMessageAt,
    messageCount: normalized.messages.length
  };
}

async function getChatList(productFilter = '') {
  const chats = await readJson(CHATS_FILE, []);
  const normalized = chats.map(normalizeChat).filter(Boolean);
  const filter = cleanSlug(productFilter);
  const filtered = filter === 'printer-family'
    ? normalized.filter((chat) => isPrinterProductSlug(chat.productSlug))
    : filter
      ? normalized.filter((chat) => chat.productSlug === filter)
      : normalized;
  return filtered
    .sort((a, b) => new Date(b.lastMessageAt || b.updatedAt || b.createdAt) - new Date(a.lastMessageAt || a.updatedAt || a.createdAt))
    .map(chatSummary);
}

async function getChatBySession(sessionId) {
  const chatId = cleanText(sessionId, 100);
  const chats = await readJson(CHATS_FILE, []);
  return normalizeChat(chats.find((chat) => chat.id === chatId || chat.sessionId === chatId));
}

async function createOrGetChatSession(data = {}) {
  const sessionId = cleanText(data.sessionId, 100);
  const fields = requestFields({
    name: data.name || data.customer?.name,
    email: data.email || data.customer?.email,
    phone: data.phone || data.customer?.phone,
    product: data.productSlug || data.product || 'microsoft',
    issue: data.selectedIssue || data.issue || data.issueCategory || 'General product question',
    message: data.message || 'Visitor opened the message window.'
  });
  const product = selectedProductFrom(fields.productSlug || 'microsoft');
  const now = new Date().toISOString();
  let result;

  await mutateJson(CHATS_FILE, [], async (chats) => {
    let chat = sessionId ? chats.find((item) => item.id === sessionId || item.sessionId === sessionId) : null;
    if (!chat) {
      const newSessionId = sessionId || createChatId();
      chat = {
        id: newSessionId,
        sessionId: newSessionId,
        token: cleanText(data.token, 100) || crypto.randomBytes(16).toString('hex'),
        status: 'Open',
        product: product.name,
        productName: product.name,
        productSlug: product.slug,
        issueCategory: fields.issueCategory || 'General question',
        visitor: {
          name: fields.name || 'Visitor',
          email: fields.email || '',
          phone: fields.phone || '',
          ip: cleanText(data.ip || 'unknown', 120),
          userAgent: cleanText(data.userAgent || 'unknown', 300),
          pagePath: cleanText(data.pagePath || '/chat', 300)
        },
        customer: {
          name: fields.name || 'Visitor',
          email: fields.email || '',
          phone: fields.phone || ''
        },
        visitorOnline: true,
        adminOnline: false,
        unreadAdmin: 0,
        unreadCustomer: 0,
        lastMessage: '',
        lastMessageAt: now,
        messages: [],
        createdAt: now,
        updatedAt: now
      };
      chats.push(chat);
    } else {
      chat.visitor = {
        ...(chat.visitor || {}),
        name: fields.name || chat.visitor?.name || chat.customer?.name || 'Visitor',
        email: fields.email || chat.visitor?.email || chat.customer?.email || '',
        phone: fields.phone || chat.visitor?.phone || chat.customer?.phone || '',
        ip: cleanText(data.ip || chat.visitor?.ip || 'unknown', 120),
        userAgent: cleanText(data.userAgent || chat.visitor?.userAgent || 'unknown', 300),
        pagePath: cleanText(data.pagePath || chat.visitor?.pagePath || '/chat', 300)
      };
      chat.customer = {
        name: chat.visitor.name,
        email: chat.visitor.email,
        phone: chat.visitor.phone
      };
      chat.visitorOnline = true;
      chat.updatedAt = now;
    }
    result = serializeChat(chat);
  });

  return result;
}

async function addChatMessage(sessionId, sender, text, options = {}) {
  const chatId = cleanText(sessionId, 100);
  const safeText = cleanText(text, 2000);
  if (!chatId || !safeText) return null;
  if (hasSensitiveData(safeText)) {
    const error = new Error('Please remove account credentials, one-time codes, recovery codes, payment card details, or device-control details.');
    error.code = 'SENSITIVE_DATA';
    throw error;
  }
  const now = new Date().toISOString();
  const message = {
    id: `MSG-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    sender: messageSender(sender),
    senderName: cleanText(options.senderName, 80) || undefined,
    text: safeText,
    at: now,
    createdAt: now,
    seen: options.seen === undefined ? false : Boolean(options.seen)
  };
  let updatedChat;
  await mutateJson(CHATS_FILE, [], async (chats) => {
    const chat = chats.find((item) => item.id === chatId || item.sessionId === chatId);
    if (!chat) return;
    chat.messages = Array.isArray(chat.messages) ? chat.messages : [];
    chat.messages.push(message);
    chat.lastMessage = message.text;
    chat.lastMessageAt = now;
    chat.updatedAt = now;
    chat.status = chat.status === 'Closed' ? 'Open' : normalizeStatus(chat.status, 'Open');
    chat.unreadAdmin = message.sender === 'visitor' ? Number(chat.unreadAdmin || 0) + 1 : Number(chat.unreadAdmin || 0);
    chat.unreadCustomer = message.sender === 'admin' ? Number(chat.unreadCustomer || 0) + 1 : Number(chat.unreadCustomer || 0);
    updatedChat = serializeChat(chat);
  });
  return updatedChat ? { chat: updatedChat, message } : null;
}

async function updateChatFlags(sessionId, updater) {
  const chatId = cleanText(sessionId, 100);
  let updatedChat;
  await mutateJson(CHATS_FILE, [], async (chats) => {
    const chat = chats.find((item) => item.id === chatId || item.sessionId === chatId);
    if (!chat) return;
    updater(chat);
    chat.updatedAt = new Date().toISOString();
    updatedChat = serializeChat(chat);
  });
  return updatedChat;
}

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await Promise.all([
    fs.access(TICKETS_FILE).catch(() => writeJson(TICKETS_FILE, [])),
    fs.access(CHATS_FILE).catch(() => writeJson(CHATS_FILE, [])),
    fs.access(VISITS_FILE).catch(() => writeJson(VISITS_FILE, []))
  ]);
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function baseLocals(req, extra = {}) {
  const defaultTitle = 'Product Help Portal | Independent Microsoft Product Guides';
  const defaultDescription = 'Independent Microsoft product help guides, service requests, and live chat intake. Not affiliated with Microsoft Corporation.';
  const defaultKeywords = 'Microsoft product guide, Windows guide, Excel guide, Word guide, Outlook guide, service request portal';
  const canonicalPath = req.path === '/' ? '/' : req.path.replace(/\/+$/, '');
  const seoTitle = extra.seoTitle || extra.pageTitle || defaultTitle;
  const seoDescription = extra.seoDescription || defaultDescription;
  const keywordValue = Array.isArray(extra.seoKeywords) ? extra.seoKeywords.join(', ') : (extra.seoKeywords || defaultKeywords);
  return {
    products,
    disclaimer: DISCLAIMER,
    siteUrl: SITE_URL,
    currentPath: req.path,
    isAdmin: Boolean(req.session && req.session.isAdmin),
    categoryTitle,
    categorySlug,
    chatHref,
    seoTitle,
    seoDescription,
    seoKeywords: keywordValue,
    canonicalUrl: extra.canonicalUrl || absoluteUrl(canonicalPath || '/'),
    robots: extra.robots || (req.path.startsWith('/admin') ? 'noindex, nofollow' : 'index, follow'),
    jsonLd: extra.jsonLd || null,
    guidePage: false,
    pageTitle: seoTitle,
    ...extra
  };
}

function renderPage(req, res, next, view, locals = {}) {
  const allLocals = baseLocals(req, locals);
  app.render(view, allLocals, (viewError, body) => {
    if (viewError) return next(viewError);
    return res.render('layout', { ...allLocals, body }, (layoutError, html) => {
      if (layoutError) return next(layoutError);
      return res.send(html);
    });
  });
}

function renderAdminPage(req, res, next, view, locals = {}) {
  const allLocals = baseLocals(req, { ...locals, adminPage: true });
  app.render(view, allLocals, (viewError, body) => {
    if (viewError) return next(viewError);
    return res.render('admin-layout', { ...allLocals, body }, (layoutError, html) => {
      if (layoutError) return next(layoutError);
      return res.send(html);
    });
  });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  if (req.path.startsWith('/admin/api')) {
    return res.status(401).json({ error: 'Admin session expired. Please log in again.' });
  }
  return res.redirect('/admin/login');
}

function requireAdminJson(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Admin session expired. Please log in again.' });
}

function filterByDateAndProduct(records, filters) {
  return records.filter((record) => {
    const matchesDate = !filters.date || localDateFromIso(record.createdAt || record.time) === filters.date;
    const recordProduct = record.productSlug || record.product || '';
    const matchesProduct = !filters.product || recordProduct === filters.product;
    return matchesDate && matchesProduct;
  });
}

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/admin') || req.path.startsWith('/api')) return next();

  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const productSlug = req.query.product
      ? cleanSlug(req.query.product)
      : req.path.startsWith('/product/')
        ? cleanSlug(req.path.replace('/product/', ''))
        : '';
    appendJson(VISITS_FILE, {
      id: crypto.randomUUID(),
      ip: clientIp(req),
      userAgent: userAgent(req),
      path: cleanText(req.originalUrl, 240),
      productSlug,
      createdAt: new Date().toISOString()
    }).catch((error) => console.error('Visit tracking failed:', error.message));
  });
  return next();
});

async function emitAdminChatList() {
  io.to('admin').emit('chat:list:update', await getChatList());
}

io.on('connection', (socket) => {
  socket.on('admin:join', async () => {
    socket.join('admin');
    socket.data.role = 'admin';
    socket.emit('chat:list:update', await getChatList());
  });

  socket.on('customer:join', async (data = {}, callback) => {
    try {
      const isExistingSession = Boolean(cleanText(data.sessionId, 100));
      if (!isExistingSession) {
        const name = cleanText(data.name, 80);
        const phone = cleanText(data.phone, 40);
        const email = cleanText(data.email, 120);
        if (!name || !phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          if (callback) callback({ ok: false, error: 'Please enter your name, email address, and phone number before choosing an issue.' });
          return;
        }
      }
      const chat = await createOrGetChatSession({
        ...data,
        ip: socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || 'unknown',
        userAgent: socket.handshake.headers['user-agent'] || 'unknown',
        pagePath: data.pagePath || socket.handshake.headers.referer || '/chat'
      });
      socket.join(`chat:${chat.sessionId}`);
      socket.data.sessionId = chat.sessionId;
      socket.data.role = 'customer';
      socket.emit('chat:init', chat);
      if (callback) callback({ ok: true, chat });
      io.to('admin').emit('visitor:online', { sessionId: chat.sessionId, online: true });
      await emitAdminChatList();
    } catch (error) {
      if (callback) callback({ ok: false, error: 'Unable to join chat.' });
    }
  });

  socket.on('customer:message', async ({ sessionId, text } = {}, callback) => {
    try {
      const result = await addChatMessage(sessionId, 'visitor', text);
      if (!result) throw new Error('Chat not found');
      const shouldSendBotReply = (result.chat.messages || []).length === 1;
      let updatedChat = result.chat;
      if (shouldSendBotReply) {
        const replies = guideAssistantReplies(result.chat.productSlug, result.chat.issueCategory);
        for (const replyText of replies) {
          const botResult = await addChatMessage(result.chat.sessionId, 'bot', replyText, {
            senderName: 'Product Guide Assistant',
            seen: true
          });
          if (botResult?.chat) updatedChat = botResult.chat;
        }
      }
      io.to(`chat:${updatedChat.sessionId}`).emit('chat:message:new', {
        sessionId: updatedChat.sessionId,
        message: result.message,
        chat: updatedChat
      });
      io.to('admin').emit('admin:notify', {
        sessionId: updatedChat.sessionId,
        sound: true,
        text: result.message.text,
        name: updatedChat.visitor?.name || 'Visitor'
      });
      await emitAdminChatList();
      if (callback) callback({ ok: true, message: result.message, chat: updatedChat });
    } catch (error) {
      if (callback) callback({ ok: false, error: error.message || 'Unable to send message.' });
    }
  });

  socket.on('customer:typing', ({ sessionId, isTyping } = {}) => {
    io.to('admin').emit('chat:typing', {
      sessionId: cleanText(sessionId, 100),
      sender: 'customer',
      isTyping: Boolean(isTyping)
    });
  });

  socket.on('customer:seen', async ({ sessionId } = {}) => {
    const chat = await updateChatFlags(sessionId, (item) => {
      item.unreadCustomer = 0;
      if (Array.isArray(item.messages)) {
        item.messages.forEach((message) => {
          if (message.sender === 'admin') message.seen = true;
        });
      }
    });
    if (chat) {
      io.to(`chat:${chat.sessionId}`).emit('chat:seen', { sessionId: chat.sessionId, by: 'customer' });
      await emitAdminChatList();
    }
  });

  socket.on('admin:openChat', async ({ sessionId } = {}, callback) => {
    const chatId = cleanText(sessionId, 100);
    socket.join(`chat:${chatId}`);
    socket.data.role = 'admin';
    socket.data.sessionId = chatId;
    const chat = await updateChatFlags(chatId, (item) => {
      item.adminOnline = true;
      item.unreadAdmin = 0;
      if (Array.isArray(item.messages)) {
        item.messages.forEach((message) => {
          if (message.sender === 'visitor' || message.sender === 'customer') message.seen = true;
        });
      }
    }) || await getChatBySession(chatId);
    if (chat) {
      socket.emit('chat:init', chat);
      if (callback) callback({ ok: true, chat });
      await emitAdminChatList();
    } else if (callback) {
      callback({ ok: false, error: 'Chat not found.' });
    }
  });

  socket.on('admin:message', async ({ sessionId, text } = {}, callback) => {
    try {
      const result = await addChatMessage(sessionId, 'admin', text);
      if (!result) throw new Error('Chat not found');
      io.to(`chat:${result.chat.sessionId}`).emit('chat:message:new', {
        sessionId: result.chat.sessionId,
        message: result.message,
        chat: result.chat
      });
      await emitAdminChatList();
      if (callback) callback({ ok: true, message: result.message, chat: result.chat });
    } catch (error) {
      if (callback) callback({ ok: false, error: error.message || 'Unable to send reply.' });
    }
  });

  socket.on('admin:typing', ({ sessionId, isTyping } = {}) => {
    const chatId = cleanText(sessionId, 100);
    io.to(`chat:${chatId}`).emit('chat:typing', {
      sessionId: chatId,
      sender: 'admin',
      isTyping: Boolean(isTyping)
    });
  });

  socket.on('admin:updateStatus', async ({ sessionId, status } = {}, callback) => {
    const normalizedStatus = normalizeStatus(status, 'Open');
    const chat = await updateChatFlags(sessionId, (item) => {
      item.status = normalizedStatus;
    });
    if (chat) {
      io.to(`chat:${chat.sessionId}`).emit('chat:status:update', {
        sessionId: chat.sessionId,
        status: chat.status,
        chat
      });
      await emitAdminChatList();
      if (callback) callback({ ok: true, chat });
    } else if (callback) {
      callback({ ok: false, error: 'Chat not found.' });
    }
  });

  socket.on('admin:seen', async ({ sessionId } = {}) => {
    const chat = await updateChatFlags(sessionId, (item) => {
      item.unreadAdmin = 0;
    });
    if (chat) await emitAdminChatList();
  });

  socket.on('disconnect', () => {
    if (socket.data.role === 'customer' && socket.data.sessionId) {
      const sessionId = socket.data.sessionId;
      windowClearCustomerOnline(sessionId);
    }
  });
});

function windowClearCustomerOnline(sessionId) {
  setTimeout(async () => {
    const chat = await updateChatFlags(sessionId, (item) => {
      item.visitorOnline = false;
    });
    if (chat) {
      io.to('admin').emit('visitor:online', { sessionId: chat.sessionId, online: false });
      await emitAdminChatList();
    }
  }, 5000);
}

app.get('/', (req, res, next) => {
  const microsoftProducts = publicMicrosoftProducts();
  renderPage(req, res, next, 'index', {
    pageTitle: 'Product Help Portal | Independent Microsoft Product Guides',
    seoTitle: 'Product Help Portal | Independent Microsoft Product Guides',
    seoDescription: 'Independent Microsoft product information portal with Windows, Excel, Word, Outlook, OneDrive, Teams, Microsoft 365, service requests, and live chat intake.',
    seoKeywords: 'Microsoft product information portal, Windows help guide, Excel guide, Word guide, Outlook guide, service request portal',
    canonicalUrl: absoluteUrl('/'),
    popularProducts: microsoftProducts.slice(0, 6),
    featuredProducts: microsoftProducts
  });
});

app.get('/printer', (req, res, next) => {
  const guideProducts = printerProducts();
  renderPage(req, res, next, 'printer', {
    pageTitle: 'Printer Guide Portal',
    seoTitle: 'Printer Setup and Supplies Guide | Independent Information Portal',
    seoDescription: 'Independent printer guide for setup, wireless connection, driver installation, printer offline questions, ink, toner, cartridges, drum units, scanner setup, and accessories.',
    seoKeywords: 'printer setup guide, wireless printer setup, printer offline guide, printer driver installation, ink toner cartridge guide, scanner setup',
    canonicalUrl: absoluteUrl('/printer'),
    guidePage: true,
    hideSiteFooter: true,
    printerGuideProducts: guideProducts,
    printerTopics: [
      'Printer offline',
      'Wireless printer setup',
      'Driver installation',
      'Print queue stuck',
      'Paper jam guidance',
      'Ink or toner question',
      'Cartridge guidance',
      'Drum unit guidance',
      'Scanner setup',
      'Printer accessories'
    ],
    jsonLd: safeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Printer Setup and Supplies Guide',
      description: 'Independent printer setup and supplies information portal.',
      url: absoluteUrl('/printer'),
      isPartOf: {
        '@type': 'WebSite',
        name: 'Product Help Portal',
        url: SITE_URL
      }
    })
  });
});

app.get('/products', (req, res, next) => {
  renderPage(req, res, next, 'products', {
    pageTitle: 'Microsoft Product Guides | Independent Product Help Portal',
    seoTitle: 'Microsoft Product Guides | Independent Product Help Portal',
    seoDescription: 'Browse independent Microsoft product guides for Windows, Excel, Word, PowerPoint, Outlook, OneDrive, Teams, Microsoft 365, Edge, Surface, Xbox, Azure, and more.',
    seoKeywords: 'Microsoft product guides, Windows guide, Excel guide, Word guide, Outlook guide, OneDrive guide, Teams guide',
    canonicalUrl: absoluteUrl('/products'),
    productList: publicMicrosoftProducts()
  });
});

app.get('/provider/:slug', (req, res) => {
  const slug = cleanSlug(req.params.slug);
  res.redirect(301, `/product/${slugAliases.get(slug) || slug}`);
});

app.get('/product/:slug', (req, res, next) => {
  const rawSlug = cleanSlug(req.params.slug);
  const canonicalSlug = slugAliases.get(rawSlug) || rawSlug;
  if (canonicalSlug !== rawSlug) return res.redirect(301, `/product/${canonicalSlug}`);
  const product = productBySlug.get(canonicalSlug);
  const productSeo = product ? seoForProduct(product) : null;
  if (!product) return renderPage(req, res.status(404), next, 'legal', {
    pageTitle: 'Product Not Found',
    heading: 'Product not found',
    sections: [
      {
        title: 'Try the product list',
        body: 'The product page you requested is not available. Please choose a product from the full listing.'
      }
    ]
  });
  return renderPage(req, res, next, 'product-detail', {
    pageTitle: productSeo.title,
    seoTitle: productSeo.title,
    seoDescription: productSeo.description,
    seoKeywords: productSeo.keywords,
    canonicalUrl: absoluteUrl(`/product/${product.slug}`),
    product,
    relatedProducts: relatedProductsFor(product),
    selectedIssue: null,
    jsonLd: safeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: product.pageTitle,
      description: productSeo.description,
      url: absoluteUrl(`/product/${product.slug}`),
      isPartOf: {
        '@type': 'WebSite',
        name: 'Product Help Portal',
        url: SITE_URL
      },
      about: {
        '@type': 'Thing',
        name: product.name
      }
    }),
    guidePage: true,
    formValues: {
      product: product.slug,
      issueCategory: categoryTitle(product.categories[0]) || ''
    },
    errors: {}
  });
});

app.get('/product/:slug/issue/:issueSlug', (req, res, next) => {
  const rawSlug = cleanSlug(req.params.slug);
  const canonicalSlug = slugAliases.get(rawSlug) || rawSlug;
  if (canonicalSlug !== rawSlug) return res.redirect(301, `/product/${canonicalSlug}/issue/${cleanSlug(req.params.issueSlug)}`);
  const product = productBySlug.get(canonicalSlug);
  if (!product) return res.redirect('/products');
  const issueSlug = cleanSlug(req.params.issueSlug);
  const selectedIssue = product.categories.find((item) => categorySlug(item) === issueSlug);
  const productSeo = seoForProduct(product);
  return renderPage(req, res, next, 'product-detail', {
    pageTitle: selectedIssue ? `${selectedIssue.title} - ${product.name} | Independent Product Help Portal` : productSeo.title,
    seoTitle: selectedIssue ? `${selectedIssue.title} - ${product.name} | Independent Product Help Portal` : productSeo.title,
    seoDescription: selectedIssue ? `${selectedIssue.description} Independent guidance for ${product.name}. Not affiliated with Microsoft Corporation.` : productSeo.description,
    seoKeywords: productSeo.keywords,
    canonicalUrl: absoluteUrl(`/product/${product.slug}/issue/${issueSlug}`),
    product,
    relatedProducts: relatedProductsFor(product),
    selectedIssue,
    jsonLd: safeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: selectedIssue ? `${selectedIssue.title} - ${product.name}` : product.pageTitle,
      description: selectedIssue ? selectedIssue.description : productSeo.description,
      url: absoluteUrl(`/product/${product.slug}/issue/${issueSlug}`),
      isPartOf: {
        '@type': 'WebSite',
        name: 'Product Help Portal',
        url: SITE_URL
      },
      about: {
        '@type': 'Thing',
        name: product.name
      }
    }),
    guidePage: true,
    formValues: {
      product: product.slug,
      issueCategory: selectedIssue ? selectedIssue.title : categoryTitle(product.categories[0]) || ''
    },
    errors: {}
  });
});

app.get('/request', (req, res, next) => {
  const selectedProduct = selectedProductFrom(req.query.product);
  renderPage(req, res, next, 'request', {
    pageTitle: 'Start Service Request | Product Help Portal',
    seoTitle: 'Start Service Request | Product Help Portal',
    seoDescription: 'Submit a basic independent Microsoft product service request with name, phone, email, product, issue category, and message only.',
    seoKeywords: 'Microsoft product service request, product setup guidance, independent request portal',
    canonicalUrl: absoluteUrl('/request'),
    robots: 'noindex, follow',
    selectedProduct,
    formValues: {
      name: '',
      phone: '',
      email: '',
      product: selectedProduct.slug,
      issueCategory: categoryTitle(selectedProduct.categories[0]) || '',
      message: ''
    },
    errors: {}
  });
});

app.post('/request', submitLimiter, asyncRoute(async (req, res, next) => {
  const fields = requestFields(req.body);
  const { errors, product } = validateFields(fields, { requireEmail: true });
  const selectedProduct = product || selectedProductFrom(fields.productSlug);

  if (Object.keys(errors).length > 0) {
    return renderPage(req, res.status(422), next, 'request', {
      pageTitle: 'Start Service Request',
      selectedProduct,
      formValues: {
        ...fields,
        product: selectedProduct.slug
      },
      errors
    });
  }

  const token = createTicketToken();
  const ticket = {
    token,
    name: fields.name,
    phone: fields.phone,
    email: fields.email,
    product: product.name,
    productSlug: product.slug,
    issueCategory: fields.issueCategory,
    message: fields.message,
    status: 'New',
    ip: clientIp(req),
    userAgent: userAgent(req),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await appendJson(TICKETS_FILE, ticket);
  return renderPage(req, res, next, 'success', {
    pageTitle: 'Request Received',
    token,
    product,
    ticket
  });
}));

app.get('/success', asyncRoute(async (req, res, next) => {
  const token = cleanText(req.query.token, 40);
  const tickets = await readJson(TICKETS_FILE, []);
  const ticket = tickets.find((item) => item.token === token);
  return renderPage(req, res, next, 'success', {
    pageTitle: 'Request Received',
    token: ticket ? ticket.token : '',
    product: ticket ? selectedProductFrom(ticket.productSlug) : null,
    ticket
  });
}));

app.get('/chat', (req, res, next) => {
  const selectedProduct = selectedProductFrom(req.query.product);
  renderPage(req, res, next, 'chat', {
    pageTitle: 'Message Intake | Product Help Portal',
    seoTitle: 'Message Intake | Product Help Portal',
    seoDescription: 'Send a basic product question to an independent Microsoft product information portal. Do not submit passwords, codes, payment data, or credentials.',
    seoKeywords: 'product message intake, Microsoft product question, independent product portal',
    canonicalUrl: absoluteUrl('/chat'),
    robots: 'noindex, follow',
    guidePage: true,
    selectedProduct,
    chatIssueOptions: chatIssueOptionsFor(selectedProduct),
    isPrinterChat: false,
    formValues: {
      name: '',
      phone: '',
      email: '',
      product: selectedProduct.slug,
      issueCategory: categoryTitle(selectedProduct.categories[0]) || '',
      message: ''
    }
  });
});

app.get('/printer-chat', (req, res, next) => {
  const selectedProduct = selectedProductFrom(req.query.product || 'printer');
  const product = isPrinterProductSlug(selectedProduct.slug) ? selectedProduct : selectedProductFrom('printer');
  renderPage(req, res, next, 'chat', {
    pageTitle: 'Printer Live Chat | Product Help Portal',
    seoTitle: 'Printer Live Chat | Independent Printer Guide Portal',
    seoDescription: 'Start an independent printer live chat intake for printer offline, wireless setup, driver installation, print queue, ink, toner, cartridge, and scanner questions.',
    seoKeywords: 'printer live chat, printer setup guide, printer offline help, wireless printer setup, printer driver guidance',
    canonicalUrl: absoluteUrl('/printer-chat'),
    robots: 'noindex, follow',
    guidePage: true,
    selectedProduct: product,
    chatIssueOptions: chatIssueOptionsFor(product),
    isPrinterChat: true,
    formValues: {
      name: '',
      phone: '',
      email: '',
      product: product.slug,
      issueCategory: categoryTitle(product.categories[0]) || '',
      message: ''
    }
  });
});

app.get('/api/products/:slug', (req, res) => {
  const rawSlug = cleanSlug(req.params.slug);
  const product = productBySlug.get(slugAliases.get(rawSlug) || rawSlug);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  return res.json({
    product: {
      ...product,
      categoryTitles: product.categories.map(categoryTitle)
    }
  });
});

app.post('/api/chat/start', submitLimiter, asyncRoute(async (req, res) => {
  const fields = requestFields(req.body);
  const { errors, product } = validateFields(fields, { requireEmail: false });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    errors.email = 'A valid email is required.';
  }
  if (Object.keys(errors).length > 0) {
    return res.status(422).json({ errors });
  }

  const chat = await createOrGetChatSession({
    name: fields.name,
    email: fields.email,
    phone: fields.phone,
    productSlug: product.slug,
    issue: fields.issueCategory,
    message: fields.message,
    ip: clientIp(req),
    userAgent: userAgent(req),
    pagePath: cleanText(req.get('referer') || '/chat', 300)
  });
  const visitorResult = await addChatMessage(chat.sessionId, 'visitor', fields.message);
  let updatedChat = visitorResult?.chat || chat;
  const replies = guideAssistantReplies(product.slug, fields.issueCategory);
  for (const replyText of replies) {
    const botResult = await addChatMessage(chat.sessionId, 'bot', replyText, {
      senderName: 'Product Guide Assistant',
      seen: true
    });
    if (botResult?.chat) updatedChat = botResult.chat;
  }

  io.to('admin').emit('admin:notify', {
    sessionId: updatedChat.sessionId,
    sound: true,
    text: fields.message,
    name: fields.name || 'Visitor'
  });
  await emitAdminChatList();
  return res.status(201).json({
    chatId: updatedChat.sessionId,
    sessionId: updatedChat.sessionId,
    token: updatedChat.token,
    chat: updatedChat
  });
}));

app.get('/api/chat/:id/messages', asyncRoute(async (req, res) => {
  const chatId = cleanText(req.params.id, 80);
  const token = cleanText(req.query.token, 80);
  const chat = await getChatBySession(chatId);
  if (!chat || chat.token !== token) return res.status(404).json({ error: 'Chat not found' });
  await updateChatFlags(chatId, (item) => {
    item.visitorOnline = true;
    item.unreadCustomer = 0;
  });
  if (chat) await emitAdminChatList();
  return res.json({
    id: chat.sessionId,
    sessionId: chat.sessionId,
    status: chat.status,
    messages: chat.messages,
    chat
  });
}));

app.post('/api/chat/:id/message', submitLimiter, asyncRoute(async (req, res) => {
  const chatId = cleanText(req.params.id, 80);
  const token = cleanText(req.body.token, 80);
  const message = cleanText(req.body.message, 1500);

  if (!message || message.length < 2) return res.status(422).json({ error: 'Message is required.' });

  const chat = await getChatBySession(chatId);
  if (!chat || chat.token !== token) return res.status(404).json({ error: 'Chat not found' });

  try {
    const result = await addChatMessage(chatId, 'visitor', message);
    if (!result) return res.status(404).json({ error: 'Chat not found' });
    io.to(`chat:${result.chat.sessionId}`).emit('chat:message:new', {
      sessionId: result.chat.sessionId,
      message: result.message,
      chat: result.chat
    });
    io.to('admin').emit('admin:notify', {
      sessionId: result.chat.sessionId,
      sound: true,
      text: result.message.text,
      name: result.chat.visitor?.name || 'Visitor'
    });
    await emitAdminChatList();
    return res.json({ chat: result.chat });
  } catch (error) {
    return res.status(422).json({ error: error.message || 'Unable to send message.' });
  }
}));

app.get('/api/chats', requireAdminJson, asyncRoute(async (req, res) => {
  const productFilter = cleanSlug(req.query.product || '');
  return res.json({ chats: await getChatList(productFilter) });
}));

app.get('/api/chats/:sessionId', asyncRoute(async (req, res) => {
  const sessionId = cleanText(req.params.sessionId, 100);
  const token = cleanText(req.query.token, 100);
  const chat = await getChatBySession(sessionId);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  if (!(req.session && req.session.isAdmin) && chat.token !== token) {
    return res.status(404).json({ error: 'Chat not found' });
  }
  return res.json({ chat });
}));

app.post('/api/chats/:sessionId/message', submitLimiter, asyncRoute(async (req, res) => {
  const sessionId = cleanText(req.params.sessionId, 100);
  const token = cleanText(req.body.token, 100);
  const sender = req.session && req.session.isAdmin ? 'admin' : 'visitor';
  const chat = await getChatBySession(sessionId);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  if (sender !== 'admin' && chat.token !== token) return res.status(404).json({ error: 'Chat not found' });

  try {
    const result = await addChatMessage(sessionId, sender, req.body.message);
    if (!result) return res.status(404).json({ error: 'Chat not found' });
    io.to(`chat:${result.chat.sessionId}`).emit('chat:message:new', {
      sessionId: result.chat.sessionId,
      message: result.message,
      chat: result.chat
    });
    if (sender !== 'admin') {
      io.to('admin').emit('admin:notify', {
        sessionId: result.chat.sessionId,
        sound: true,
        text: result.message.text,
        name: result.chat.visitor?.name || 'Visitor'
      });
    }
    await emitAdminChatList();
    return res.json({ chat: result.chat, message: result.message });
  } catch (error) {
    return res.status(422).json({ error: error.message || 'Unable to send message.' });
  }
}));

app.patch('/api/chats/:sessionId/status', requireAdminJson, asyncRoute(async (req, res) => {
  const sessionId = cleanText(req.params.sessionId, 100);
  const status = normalizeStatus(req.body.status, 'Open');
  const updatedChat = await updateChatFlags(sessionId, (chat) => {
    chat.status = status;
  });
  if (!updatedChat) return res.status(404).json({ error: 'Chat not found' });
  io.to(`chat:${updatedChat.sessionId}`).emit('chat:status:update', {
    sessionId: updatedChat.sessionId,
    status: updatedChat.status,
    chat: updatedChat
  });
  await emitAdminChatList();
  return res.json({ chat: updatedChat });
}));

app.get('/admin/login', (req, res, next) => {
  if (req.session.isAdmin) return res.redirect('/admin/dashboard');
  return renderPage(req, res, next, 'admin-login', {
    pageTitle: 'Admin Login',
    error: ''
  });
});

app.post('/admin/login', loginLimiter, (req, res, next) => {
  const username = cleanText(req.body.username, 80);
  const password = String(req.body.password || '');
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.isAdmin = true;
    return res.redirect('/admin/dashboard');
  }
  return renderPage(req, res.status(401), next, 'admin-login', {
    pageTitle: 'Admin Login',
    error: 'Invalid admin credentials.'
  });
});

app.post('/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

app.get('/admin/dashboard', requireAdmin, asyncRoute(async (req, res, next) => {
  const productFilter = cleanSlug(req.query.product || '');
  const statusFilter = cleanSlug(req.query.status || '');
  const [tickets, chats, visits] = await Promise.all([
    readJson(TICKETS_FILE, []),
    readJson(CHATS_FILE, []),
    readJson(VISITS_FILE, [])
  ]);
  const productTickets = productFilter
    ? tickets.filter((ticket) => ticket.productSlug === productFilter)
    : tickets;
  const filteredTickets = statusFilter
    ? productTickets.filter((ticket) => cleanSlug(ticket.status || '') === statusFilter)
    : productTickets;
  const filteredChats = productFilter
    ? chats.filter((chat) => chat.productSlug === productFilter)
    : chats;
  const filteredVisits = productFilter
    ? visits.filter((visit) => visit.productSlug === productFilter)
    : visits;
  const todayVisitors = new Set(
    filteredVisits
      .filter((visit) => isToday(visit.createdAt))
      .map((visit) => `${visit.ip}|${visit.userAgent}`)
  ).size;
  const latestRequests = [...filteredTickets]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 12);
  const recentChats = [...filteredChats]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 6);

  renderAdminPage(req, res, next, 'admin-dashboard', {
    pageTitle: 'Admin Dashboard',
    stats: {
      totalRequests: filteredTickets.length,
      openChats: filteredChats.filter((chat) => chat.status !== 'Closed').length,
      todayVisitors,
      pendingTickets: filteredTickets.filter((ticket) => ticket.status !== 'Closed').length
    },
    latestRequests,
    recentChats,
    allowedStatuses,
    productFilter,
    statusFilter,
    toast: cleanText(req.query.toast || '', 80)
  });
}));

app.post('/admin/tickets/:token/status', requireAdmin, asyncRoute(async (req, res) => {
  const token = cleanText(req.params.token, 50);
  const status = cleanText(req.body.status, 40);
  if (!allowedStatuses.includes(status)) return res.status(400).send('Invalid status');

  await mutateJson(TICKETS_FILE, [], async (tickets) => {
    const ticket = tickets.find((item) => item.token === token);
    if (ticket) {
      ticket.status = status;
      ticket.updatedAt = new Date().toISOString();
    }
  });

  const product = cleanSlug(req.body.productFilter || '');
  const statusFilter = cleanSlug(req.body.statusFilter || '');
  const params = new URLSearchParams();
  if (product) params.set('product', product);
  if (statusFilter) params.set('status', statusFilter);
  params.set('toast', 'request-status-updated');
  return res.redirect(`/admin/dashboard?${params.toString()}`);
}));

app.get('/admin/live', requireAdmin, (req, res, next) => {
  renderAdminPage(req, res, next, 'admin-live', {
    pageTitle: 'Admin Live Chat',
    liveTitle: 'Live Chat',
    liveMode: 'all',
    defaultProductFilter: '',
    liveProducts: products,
    toast: ''
  });
});

app.get('/admin/printer-live', requireAdmin, (req, res, next) => {
  renderAdminPage(req, res, next, 'admin-live', {
    pageTitle: 'Admin Printer Live Chat',
    liveTitle: 'Printer Live Chat',
    liveMode: 'printer',
    defaultProductFilter: 'printer-family',
    liveProducts: printerProducts(),
    toast: ''
  });
});

app.get('/admin/api/chats', requireAdmin, asyncRoute(async (req, res) => {
  const productFilter = cleanSlug(req.query.product || '');
  return res.json({ chats: await getChatList(productFilter) });
}));

app.get('/admin/api/chats/:id', requireAdmin, asyncRoute(async (req, res) => {
  const chatId = cleanText(req.params.id, 80);
  const chat = await getChatBySession(chatId);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  return res.json({
    chat
  });
}));

app.post('/admin/api/chats/:id/reply', requireAdmin, asyncRoute(async (req, res) => {
  const chatId = cleanText(req.params.id, 80);
  const message = cleanText(req.body.message, 1500);
  if (!message || message.length < 2) return res.status(422).json({ error: 'Reply is required.' });

  try {
    const result = await addChatMessage(chatId, 'admin', message);
    if (!result) return res.status(404).json({ error: 'Chat not found' });
    io.to(`chat:${result.chat.sessionId}`).emit('chat:message:new', {
      sessionId: result.chat.sessionId,
      message: result.message,
      chat: result.chat
    });
    await emitAdminChatList();
    return res.json({ chat: result.chat });
  } catch (error) {
    return res.status(422).json({ error: error.message || 'Unable to send reply.' });
  }
}));

app.post('/admin/api/chats/:id/status', requireAdmin, asyncRoute(async (req, res) => {
  const chatId = cleanText(req.params.id, 80);
  const status = cleanText(req.body.status, 40);
  if (!allowedStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const updatedChat = await updateChatFlags(chatId, (chat) => {
    chat.status = status;
  });

  if (!updatedChat) return res.status(404).json({ error: 'Chat not found' });
  io.to(`chat:${updatedChat.sessionId}`).emit('chat:status:update', {
    sessionId: updatedChat.sessionId,
    status: updatedChat.status,
    chat: updatedChat
  });
  await emitAdminChatList();
  return res.json({ chat: updatedChat });
}));

app.get('/admin/reports', requireAdmin, asyncRoute(async (req, res, next) => {
  const filters = {
    date: cleanText(req.query.date, 20),
    product: cleanSlug(req.query.product || '')
  };
  const [tickets, chats, visits] = await Promise.all([
    readJson(TICKETS_FILE, []),
    readJson(CHATS_FILE, []),
    readJson(VISITS_FILE, [])
  ]);
  renderAdminPage(req, res, next, 'admin-reports', {
    pageTitle: 'Admin Reports',
    filters,
    counts: {
      tickets: filterByDateAndProduct(tickets, filters).length,
      chats: filterByDateAndProduct(chats, filters).length,
      visits: filterByDateAndProduct(visits, filters).length
    },
    toast: ''
  });
}));

app.get('/admin/reports/export', requireAdmin, asyncRoute(async (req, res) => {
  const type = cleanText(req.query.type, 20) || 'all';
  const filters = {
    date: cleanText(req.query.date, 20),
    product: cleanSlug(req.query.product || '')
  };
  const [tickets, chats, visits] = await Promise.all([
    readJson(TICKETS_FILE, []),
    readJson(CHATS_FILE, []),
    readJson(VISITS_FILE, [])
  ]);
  const payload = {
    generatedAt: new Date().toISOString(),
    filters,
    tickets: filterByDateAndProduct(tickets, filters),
    chats: filterByDateAndProduct(chats, filters),
    visits: filterByDateAndProduct(visits, filters)
  };
  const allowedTypes = ['all', 'tickets', 'chats', 'visits'];
  const exportType = allowedTypes.includes(type) ? type : 'all';
  const data = exportType === 'all'
    ? payload
    : { generatedAt: payload.generatedAt, filters, [exportType]: payload[exportType] };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${exportType}-report-${dateStamp()}.json"`);
  return res.send(JSON.stringify(data, null, 2));
}));

app.get('/privacy', (req, res) => {
  res.redirect(301, '/privacy-policy');
});

app.get('/privacy-policy', (req, res, next) => {
  renderPage(req, res, next, 'legal', {
    pageTitle: 'Privacy Policy',
    seoTitle: 'Privacy Policy | Product Help Portal',
    seoDescription: 'Privacy policy for the independent Product Help Portal, including information collected through product requests and chat messages.',
    canonicalUrl: absoluteUrl('/privacy-policy'),
    heading: 'Privacy Policy',
    sections: [
      {
        title: 'Information collected',
        body: 'This portal stores only the details submitted through the request and chat forms: name, phone, email when provided, selected product, issue category, message, IP address, user agent, page path, and timestamps.'
      },
      {
        title: 'Information not requested',
        body: 'Do not submit account credentials, one-time codes, recovery codes, payment card data, or device-control details. The public forms are intentionally limited to basic service request information.'
      },
      {
        title: 'No payment or remote access collection',
        body: 'The public request and chat forms do not collect card numbers, bank details, remote access codes, passwords, one-time codes, or recovery codes.'
      },
      {
        title: 'Use of information',
        body: 'Submitted information is used to review requests, respond to chats, manage tickets, and create basic operational reports inside the admin dashboard.'
      }
    ]
  });
});

app.get('/terms', (req, res, next) => {
  renderPage(req, res, next, 'legal', {
    pageTitle: 'Terms',
    seoTitle: 'Terms | Product Help Portal',
    seoDescription: 'Terms for using the independent Product Help Portal for Microsoft product information guides and service request intake.',
    canonicalUrl: absoluteUrl('/terms'),
    heading: 'Terms',
    sections: [
      {
        title: 'Independent portal',
        body: DISCLAIMER
      },
      {
        title: 'Advertising and identity transparency',
        body: 'This website is presented as an independent information and request intake portal. It is not an official Microsoft website, Microsoft service, Microsoft partner portal, or official account recovery channel.'
      },
      {
        title: 'Use of product names',
        body: 'Product names such as Windows, Microsoft 365, Outlook, OneDrive, Teams, Xbox, Surface, Edge, Azure, and others are used only to identify the topic of a request.'
      },
      {
        title: 'No guarantee',
        body: 'Information on this site is provided for general guidance and request intake. Official product policies, warranties, subscriptions, and account decisions remain with the product owner.'
      }
    ]
  });
});

app.get('/disclaimer', (req, res, next) => {
  renderPage(req, res, next, 'legal', {
    pageTitle: 'Disclaimer',
    seoTitle: 'Disclaimer | Product Help Portal',
    seoDescription: 'Disclaimer for the independent Product Help Portal. This website is not affiliated with Microsoft Corporation.',
    canonicalUrl: absoluteUrl('/disclaimer'),
    heading: 'Disclaimer',
    sections: [
      {
        title: 'Independence',
        body: DISCLAIMER
      },
      {
        title: 'Credential safety',
        body: 'This site does not ask for Microsoft account credentials, one-time codes, recovery codes, payment card data, or device-control details.'
      },
      {
        title: 'No official account action',
        body: 'Requests submitted through this portal do not replace official Microsoft account recovery, warranty, billing, subscription, or security processes.'
      }
    ]
  });
});

app.get('/ad-transparency', (req, res, next) => {
  renderPage(req, res, next, 'legal', {
    pageTitle: 'Advertising Transparency',
    seoTitle: 'Advertising Transparency | Product Help Portal',
    seoDescription: 'Advertising transparency and safe request boundaries for the independent Product Help Portal.',
    canonicalUrl: absoluteUrl('/ad-transparency'),
    heading: 'Advertising Transparency',
    sections: [
      {
        title: 'Independent identity',
        body: DISCLAIMER
      },
      {
        title: 'Product-name usage',
        body: 'Microsoft product names are used only for identification of user-selected topics. This website does not use Microsoft logos, official brand artwork, or copied Microsoft interface assets.'
      },
      {
        title: 'Safe request boundaries',
        body: 'Do not submit passwords, one-time codes, recovery codes, payment card data, remote access information, or Microsoft account credentials. Public forms are limited to name, phone, email, product, issue category, and message.'
      },
      {
        title: 'Official services',
        body: 'For official account recovery, warranty decisions, subscription management, billing decisions, product licensing, or security enforcement, use official Microsoft channels.'
      }
    ]
  });
});

app.get('/contact', (req, res, next) => {
  renderPage(req, res, next, 'legal', {
    pageTitle: 'Contact',
    seoTitle: 'Contact | Product Help Portal',
    seoDescription: 'Contact the independent Product Help Portal by starting a product request or live chat intake.',
    canonicalUrl: absoluteUrl('/contact'),
    heading: 'Contact',
    sections: [
      {
        title: 'Start a request',
        body: 'Use the request form or chat page to send a product-specific message to the portal team.'
      },
      {
        title: 'Required disclaimer',
        body: DISCLAIMER
      }
    ]
  });
});

app.get('/faq', (req, res, next) => {
  const faqs = [
    {
      question: 'Is Product Help Portal affiliated with Microsoft Corporation?',
      answer: DISCLAIMER
    },
    {
      question: 'What information can I submit in a service request?',
      answer: 'The request form asks only for name, phone, email, selected product, issue category, and message.'
    },
    {
      question: 'Should I include passwords, one-time codes, or payment details?',
      answer: 'No. Do not submit passwords, one-time codes, recovery codes, payment card data, remote access details, or Microsoft account credentials.'
    },
    {
      question: 'Which product guides are available?',
      answer: 'The portal includes independent guides for Windows, Windows 11, Excel, Word, PowerPoint, Outlook, OneDrive, Teams, Microsoft 365, Edge, Xbox, Surface, Azure, and related products.'
    }
  ];
  renderPage(req, res, next, 'faq', {
    pageTitle: 'FAQ | Independent Product Help Portal',
    seoTitle: 'FAQ | Independent Product Help Portal',
    seoDescription: 'Frequently asked questions about the independent Microsoft product help guide, service request, and live chat intake portal.',
    seoKeywords: 'Microsoft product guide FAQ, independent product help portal, service request FAQ',
    canonicalUrl: absoluteUrl('/faq'),
    faqs,
    jsonLd: safeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer
        }
      }))
    })
  });
});

app.get('/sitemap.xml', (req, res) => {
  const urls = [
    { loc: absoluteUrl('/'), priority: '1.0' },
    { loc: absoluteUrl('/products'), priority: '0.9' },
    { loc: absoluteUrl('/printer'), priority: '0.7' },
    ...publicMicrosoftProducts().map((product) => ({
      loc: absoluteUrl(`/product/${product.slug}`),
      priority: '0.8'
    })),
    { loc: absoluteUrl('/faq'), priority: '0.6' },
    { loc: absoluteUrl('/contact'), priority: '0.6' },
    { loc: absoluteUrl('/privacy-policy'), priority: '0.4' },
    { loc: absoluteUrl('/terms'), priority: '0.4' },
    { loc: absoluteUrl('/disclaimer'), priority: '0.4' }
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url>\n    <loc>${xmlEscape(url.loc)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`).join('\n')}\n</urlset>`;
  res.type('application/xml');
  res.send(xml);
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /chat\nDisallow: /request\n\nSitemap: ${absoluteUrl('/sitemap.xml')}\n`);
});

app.use((req, res, next) => {
  renderPage(req, res.status(404), next, 'legal', {
    pageTitle: 'Page Not Found',
    heading: 'Page not found',
    sections: [
      {
        title: 'Choose a page',
        body: 'The page you requested was not found. Use the navigation to visit products, start a request, or open chat.'
      }
    ]
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  return renderPage(req, res.status(500), next, 'legal', {
    pageTitle: 'Server Error',
    heading: 'Something went wrong',
    sections: [
      {
        title: 'Please try again',
        body: 'The portal could not complete that action. Please refresh and try again.'
      }
    ]
  });
});

ensureDataFiles()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Independent product help portal running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
