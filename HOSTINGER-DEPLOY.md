# Deploy to printeronlines.shop on Hostinger

Use these steps to host this Node.js + Express website on `printeronlines.shop`.

## 1. Prepare project files

Upload the full project folder to Hostinger Node.js hosting, including:

- `server.js`
- `package.json`
- `views/`
- `public/`
- `data/`
- `.env.example`

Do not upload `node_modules`; Hostinger should install dependencies with `npm install`.

## 2. Hostinger Node.js app settings

In Hostinger hPanel:

1. Open **Websites**.
2. Select `printeronlines.shop`.
3. Open **Node.js** or **Node.js App**.
4. Create a Node.js app.
5. Set:
   - Application root: the folder where this project is uploaded.
   - Startup file: `server.js`
   - Start command: `npm start`
   - Node version: `18` or newer.

The app already uses:

```js
process.env.PORT || 3000
```

So Hostinger can provide its own port automatically.

## 3. Environment variables

Add these environment variables in Hostinger:

```text
SESSION_SECRET=replace-with-a-long-random-secret
ADMIN_USER=admin
ADMIN_PASS=admin@123
NODE_ENV=production
```

Do not set `PORT` manually unless Hostinger specifically asks for it.

## 4. Install dependencies

Run this in Hostinger terminal from the project folder:

```bash
npm install
```

Then start/restart the Node.js app from Hostinger panel.

## 5. Connect domain

If `printeronlines.shop` is registered at Hostinger:

1. Go to **Domains**.
2. Make sure the domain points to the same hosting account.
3. Open the Node.js app settings.
4. Attach/select `printeronlines.shop` as the app domain.

If the domain is registered somewhere else:

1. Point nameservers to Hostinger nameservers, or
2. Add the A record/CNAME values shown by Hostinger.

After DNS change, propagation can take a few minutes to 24 hours.

## 6. Enable SSL

In Hostinger hPanel:

1. Open **SSL**.
2. Enable free SSL for `printeronlines.shop`.
3. Force HTTPS if Hostinger provides that option.

Final URL:

```text
https://printeronlines.shop
```

## 7. Test live routes

After deployment, check:

```text
https://printeronlines.shop/
https://printeronlines.shop/products
https://printeronlines.shop/request
https://printeronlines.shop/chat
https://printeronlines.shop/admin/login
https://printeronlines.shop/ad-transparency
```

Admin login:

```text
Username: admin
Password: admin@123
```

## 8. Important Google Ads note

The domain name `printeronlines.shop` should match the website topic and ads. If ads mention Microsoft product information, the landing page must clearly show:

- Independent portal identity.
- No official Microsoft affiliation.
- No collection of passwords, OTPs, recovery codes, payment card data, or remote access details.
- Visible Privacy Policy, Terms, Disclaimer, Contact, and Ad Transparency pages.

This project already includes those pages and disclaimers, but ad approval is always decided by Google.
