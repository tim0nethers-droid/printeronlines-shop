require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const products = require('./data/products');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
const VISITS_FILE = path.join(DATA_DIR, 'visits.json');
const DISCLAIMER = 'This is an independent service request and information portal. We are not affiliated with Microsoft Corporation.';
const SITE_URL = (process.env.SITE_URL || 'https://printeronlines.shop').replace(/\/+$/, '');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin@123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'local-development-secret-change-me';
const allowedStatuses = ['New', 'Open', 'In Progress', 'Closed'];
const productBySlug = new Map(products.map((product) => [product.slug, product]));
const slugAliases = new Map([
  ['edge', 'microsoft-edge'],
  ['microsoft-copilot', 'copilot'],
  ['defender', 'windows-defender'],
  ['microsoft-defender', 'windows-defender'],
  ['store', 'microsoft-store']
]);
const writeQueues = new Map();

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
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8
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

function selectedProductFrom(value) {
  const rawSlug = cleanSlug(value);
  const slug = slugAliases.get(rawSlug) || rawSlug;
  return productBySlug.get(slug) || products[0];
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
    'windows-security': ['windows', 'windows-defender', 'windows-update', 'microsoft-edge']
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
    issueCategory: cleanText(body.issueCategory || body.issue, 140),
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
  const defaultDescription = 'Independent product help guides, service requests, and live chat for Microsoft products. Not affiliated with Microsoft Corporation.';
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

app.get('/', (req, res, next) => {
  renderPage(req, res, next, 'index', {
    pageTitle: 'Product Help Portal | Independent Microsoft Product Guides',
    seoTitle: 'Product Help Portal | Independent Microsoft Product Guides',
    seoDescription: 'Independent Microsoft product information portal with Windows, Excel, Word, Outlook, OneDrive, Teams, setup guidance, service requests, and live chat intake.',
    seoKeywords: 'Microsoft product information portal, Windows help guide, Excel help guide, Word guide, Outlook setup guide, service request portal',
    canonicalUrl: absoluteUrl('/'),
    popularProducts: products.slice(0, 6),
    featuredProducts: products
  });
});

app.get('/products', (req, res, next) => {
  renderPage(req, res, next, 'products', {
    pageTitle: 'Microsoft Product Guides | Independent Product Help Portal',
    seoTitle: 'Microsoft Product Guides | Independent Product Help Portal',
    seoDescription: 'Browse independent Microsoft product help guides for Windows, Excel, Word, PowerPoint, Outlook, OneDrive, Teams, Microsoft 365, Edge, Xbox, Surface, Azure, and more.',
    seoKeywords: 'Microsoft product guides, Windows guide, Excel guide, Outlook setup guide, OneDrive sync guidance, Teams meeting guidance',
    canonicalUrl: absoluteUrl('/products'),
    productList: products
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

  const chat = {
    id: createChatId(),
    token: crypto.randomBytes(16).toString('hex'),
    status: 'Open',
    product: product.name,
    productSlug: product.slug,
    issueCategory: fields.issueCategory,
    visitor: {
      name: fields.name,
      email: fields.email,
      phone: fields.phone,
      ip: clientIp(req),
      userAgent: userAgent(req),
      pagePath: cleanText(req.get('referer') || '/chat', 300)
    },
    messages: [
      createMessage('visitor', fields.message),
      createMessage('bot', 'Thank you. Your request has been received. A portal team member will review your message shortly.')
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await appendJson(CHATS_FILE, chat);
  return res.status(201).json({
    chatId: chat.id,
    sessionId: chat.id,
    token: chat.token,
    chat
  });
}));

app.get('/api/chat/:id/messages', asyncRoute(async (req, res) => {
  const chatId = cleanText(req.params.id, 80);
  const token = cleanText(req.query.token, 80);
  const chats = await readJson(CHATS_FILE, []);
  const chat = chats.find((item) => item.id === chatId && item.token === token);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  return res.json({
    id: chat.id,
    status: chat.status,
    messages: chat.messages
  });
}));

app.post('/api/chat/:id/message', submitLimiter, asyncRoute(async (req, res) => {
  const chatId = cleanText(req.params.id, 80);
  const token = cleanText(req.body.token, 80);
  const message = cleanText(req.body.message, 1500);

  if (!message || message.length < 2) return res.status(422).json({ error: 'Message is required.' });
  if (hasSensitiveData(message)) {
    return res.status(422).json({ error: 'Please remove account credentials, one-time codes, recovery codes, payment card details, or device-control details.' });
  }

  let updatedChat;
  await mutateJson(CHATS_FILE, [], async (chats) => {
    const chat = chats.find((item) => item.id === chatId && item.token === token);
    if (!chat) return;
    chat.messages.push(createMessage('visitor', message));
    chat.updatedAt = new Date().toISOString();
    if (chat.status === 'Closed') chat.status = 'Open';
    updatedChat = chat;
  });

  if (!updatedChat) return res.status(404).json({ error: 'Chat not found' });
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
    toast: ''
  });
});

app.get('/admin/api/chats', requireAdmin, asyncRoute(async (req, res) => {
  const productFilter = cleanSlug(req.query.product || '');
  const chats = await readJson(CHATS_FILE, []);
  const filtered = productFilter ? chats.filter((chat) => chat.productSlug === productFilter) : chats;
  const summaries = filtered
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((chat) => {
      const productMeta = selectedProductFrom(chat.productSlug);
      return {
        id: chat.id,
        status: chat.status,
        product: chat.product,
        productSlug: chat.productSlug,
        productIconText: productMeta.iconText,
        productIconClass: productMeta.iconClass,
        issueCategory: chat.issueCategory,
        visitor: chat.visitor,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messageCount: chat.messages.length,
        lastMessage: chat.messages[chat.messages.length - 1] || null
      };
    });
  return res.json({ chats: summaries });
}));

app.get('/admin/api/chats/:id', requireAdmin, asyncRoute(async (req, res) => {
  const chatId = cleanText(req.params.id, 80);
  const chats = await readJson(CHATS_FILE, []);
  const chat = chats.find((item) => item.id === chatId);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  return res.json({
    chat: withProductMeta(chat)
  });
}));

app.post('/admin/api/chats/:id/reply', requireAdmin, asyncRoute(async (req, res) => {
  const chatId = cleanText(req.params.id, 80);
  const message = cleanText(req.body.message, 1500);
  if (!message || message.length < 2) return res.status(422).json({ error: 'Reply is required.' });

  let updatedChat;
  await mutateJson(CHATS_FILE, [], async (chats) => {
    const chat = chats.find((item) => item.id === chatId);
    if (!chat) return;
    chat.messages.push(createMessage('admin', message));
    chat.status = 'Open';
    chat.updatedAt = new Date().toISOString();
    updatedChat = chat;
  });

  if (!updatedChat) return res.status(404).json({ error: 'Chat not found' });
  return res.json({ chat: withProductMeta(updatedChat) });
}));

app.post('/admin/api/chats/:id/status', requireAdmin, asyncRoute(async (req, res) => {
  const chatId = cleanText(req.params.id, 80);
  const status = cleanText(req.body.status, 40);
  if (!allowedStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  let updatedChat;
  await mutateJson(CHATS_FILE, [], async (chats) => {
    const chat = chats.find((item) => item.id === chatId);
    if (!chat) return;
    chat.status = status;
    chat.updatedAt = new Date().toISOString();
    updatedChat = chat;
  });

  if (!updatedChat) return res.status(404).json({ error: 'Chat not found' });
  return res.json({ chat: withProductMeta(updatedChat) });
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
    ...products.map((product) => ({
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
    app.listen(PORT, () => {
      console.log(`Independent product help portal running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
