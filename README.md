# Microsoft Product Information & Service Request Portal

Independent Node.js and Express portal for product information, service requests, admin ticket management, and polling-based live chat.

## Compliance Notes

- This site does not claim to be official Microsoft support or official Microsoft services.
- It does not use Microsoft logos, copied interface assets, or official brand artwork.
- Product names are used only for identification.
- Public forms collect only name, phone, email where required, product, issue category, and message.
- Public forms do not request passwords, OTPs, recovery codes, payment card data, Microsoft account credentials, or device-control details.
- Every page includes this disclaimer: "This is an independent service request and information portal. We are not affiliated with Microsoft Corporation."

## Run Locally

```bash
npm install
npm start
```

The app uses `process.env.PORT || 3000`, so it runs locally at:

```text
http://localhost:3000
```

## Environment

Copy `.env.example` to `.env` and set strong values:

```text
PORT=3000
SESSION_SECRET=replace-with-a-long-random-secret
ADMIN_USER=admin
ADMIN_PASS=admin@123
```

Admin login:

```text
/admin/login
```

## Hostinger Node.js Hosting

For the `printeronlines.shop` deployment checklist, see `HOSTINGER-DEPLOY.md`.

1. Upload the project files to your Hostinger Node.js app directory.
2. In Hostinger, set the startup file to `server.js`.
3. Add environment variables for `SESSION_SECRET`, `ADMIN_USER`, and `ADMIN_PASS`.
4. Run `npm install` from the Hostinger terminal or deployment panel.
5. Start the app with `npm start`.
6. Use the port supplied by Hostinger. The server reads `process.env.PORT` automatically.

## Storage

The app stores data in JSON files:

- `data/tickets.json`
- `data/chats.json`
- `data/visits.json`

Keep these files writable on the hosting environment. Back them up before replacing or redeploying the project folder.

## Main Routes

- `/` home page
- `/products` product listing
- `/product/:slug` product detail pages
- `/request?product=windows` ticket form
- `/chat?product=windows` polling chat
- `/admin/dashboard` ticket dashboard
- `/admin/live` admin chat replies
- `/admin/reports` JSON exports
