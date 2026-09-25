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

- Each invoice receives a sequential `YPC-000001` style number and the server timestamp. The registration/UID is automatically assigned per invoice in YPC-UID-000001 format. The form previews the next number; the server assigns the final number when saving.
- Add descriptions and amounts in rupees. The server stores integer paise, calculates CGST and SGST separately, and records received payment and balance.
- Each line supports Medicine, Treatment, or Service, with a name, quantity and unit price. The line amount is calculated as quantity × unit price and is printed on the invoice. Older invoices remain readable as quantity 1.
- New invoices automatically apply CGST at 9% and SGST at 9%. Staff cannot edit the rates. Previously saved invoices retain their original rates. Have a qualified accountant validate rates and invoice wording before issuing real tax invoices.
- Saved invoices cannot be edited or deleted in this first version. This preserves the issued record. Corrections should use a deliberate credit note or replacement workflow in a later release.

## Deployment

Run behind HTTPS on a private server. Set `COOKIE_SECURE=1` for HTTPS and use a reverse proxy with access controls. Do not expose a plain HTTP deployment containing patient information. Restrict filesystem access to `data/`, keep encrypted off-site backups, and define staff access and retention policies before production use. No real patient details are included in source code.

No external packages, subscriptions, or cloud service are required to run it. It has no payment gateway, SMS, multi-user roles, or accounting integration.

## Payments and corrections

Open an invoice from history to record later payments. The invoice lists every later payment and the current balance. An overpayment is rejected. An unpaid invoice can be voided with a reason and remains searchable with its original number. A paid invoice cannot be voided in this version; handle any refund and accounting correction under the clinic's approved procedure before issuing a replacement.

## Backups and restore

Run `npm run backup -- /secure/backup/directory` on a schedule. It creates a consistent SQLite snapshot; store copies outside the application server and limit access to authorized staff. Test restoration on a separate machine: stop the application, copy a backup to `data/billing.sqlite`, then start the application and verify an old invoice. Never commit the database or backups to GitHub.

## Production checklist

1. Confirm the clinic's exact legal name, address, GSTIN, tax treatment, footer statement, and invoice numbering policy with the owner and accountant. The fixed 9% CGST + 9% SGST rates are configured at the owner's request, not an independent determination of the correct rate for every treatment.
2. Deploy on a private Node.js 24+ server behind an HTTPS reverse proxy. Restrict server access; point the proxy to `127.0.0.1:3000`, set `COOKIE_SECURE=1`, and run as an unprivileged service user.
3. Run `npm run setup -- admin "long-unique-secret"` on the server once. Do not put the password into version control or a shared terminal transcript. Restrict the `data/` directory and establish backup/restore and access procedures.
4. Check a sample invoice on desktop and mobile, print to A4 PDF, and obtain the owner's acceptance before using real patient data.

This code is ready for deployment, but deployment, accountant approval, and owner acceptance require the clinic's hosting details and decisions. The repository is public; it contains no real patient database.

## Manual payment status

In Invoice history, use the status dropdown to mark an invoice Paid or Unpaid. Paid sets the received amount to the full invoice total; Unpaid sets it to zero. Each change stores a signed adjustment and an audit entry, preserving the original payment records. Adjustments appear on the invoice, and later payments use the adjusted balance. Voided invoices cannot change payment status.
