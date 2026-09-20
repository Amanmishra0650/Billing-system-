# Yogi Piles patient billing

A small, dependency-free Node.js billing app for Yogi Piles & Panchkarma Center. Staff can create invoices, search invoice history, reopen bills, and print an A4 PDF using the browser's **Print → Save as PDF** option. The server stores data in SQLite and computes totals itself.

## Run locally

Requires Node.js 24 or newer. From this directory:

```bash
npm run setup -- admin "choose-a-long-unique-password"
npm start
```

Open `http://localhost:3000`. Setup creates one staff account only and refuses to overwrite it. Data is written to `data/billing.sqlite`; the database and passwords are excluded from Git. Back up the `data/` directory regularly.

## Invoice rules

- Each invoice receives a sequential `YPC-000001` style number and the server timestamp. The registration/UID is separate.
- Add descriptions and amounts in rupees. The server stores integer paise, calculates CGST and SGST separately, and records received payment and balance.
- CGST and SGST default to 2.5% each to match the supplied example. Staff can edit the rate for each invoice. Have a qualified accountant validate rates and invoice wording before issuing real tax invoices.
- Saved invoices cannot be edited or deleted in this first version. This preserves the issued record. Corrections should use a deliberate credit note or replacement workflow in a later release.

## Deployment

Run behind HTTPS on a private server. Set `COOKIE_SECURE=1` for HTTPS and use a reverse proxy with access controls. Do not expose a plain HTTP deployment containing patient information. Restrict filesystem access to `data/`, keep encrypted off-site backups, and define staff access and retention policies before production use. No real patient details are included in source code.

No external packages, subscriptions, or cloud service are required to run it. It has no payment gateway, SMS, multi-user roles, or accounting integration.
