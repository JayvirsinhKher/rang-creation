# Simple Retail Management System (Google Sheets + Apps Script)

A responsive, auditable Retail Management System built with Vanilla HTML5/CSS3/JS, Google Apps Script, and a structured 20-sheet Google Sheets database.

---

## 1. File Inventory & Verification Summary

Use these exact 7 files in your project:

- `index.html` — Single-page responsive dashboard, modals, and print containers.
- `styles.css` — Desktop/tablet/mobile styles + A4 & 80mm thermal print media queries.
- `api.js` — Transport adapter (`google.script.run`, CORS-safe `text/plain` fetch, and Local Sandbox).
- `app.js` — Complete 12-module frontend controller, GST calculator, and 16-report generator.
- `Code.gs` — Rename your attached `code2.gs.js` to `Code.gs` in the Apps Script editor.
- `appsscript.json` — Apps Script V8 manifest and OAuth scopes.
- `sample-data.csv` — Seed product catalog for CSV import testing.

---

## 2. Google Sheets Database Setup Guide

1. Create a new Google Sheet in Google Drive (restrict sharing to authorised store personnel only).
2. Open **Extensions → Apps Script**.
3. Enable **"Show `appsscript.json` manifest file in editor"** in Project Settings and paste `appsscript.json`.
4. Paste the contents of `code2.gs.js` into `Code.gs`.
5. _(Optional for Native Hosting)_ Create an HTML file named `index.html` in Apps Script and inline `styles.css`, `api.js`, and `app.js`, or host the frontend on GitHub Pages.
6. Select `setupDatabase` in the Apps Script toolbar and click **Run**.
7. Grant permissions when prompted. This automatically creates and formats all **20 sheets**:
   `Settings`, `Users`, `Stores`, `Products`, `Categories`, `Customers`, `Suppliers`, `Sales`, `SaleItems`, `SalesReturns`, `Purchases`, `PurchaseItems`, `GoodsReceipts`, `Payments`, `PaymentAllocations`, `Expenses`, `StockMovements`, `StockAdjustments`, `AuditLogs`, `DocumentSequences`.

---

## 3. Apps Script Deployment Instructions

1. In the Apps Script editor, click **Deploy → New deployment**.
2. Select type: **Web app**.
3. Configure deployment mode:
   - **Recommended (Internal Google Workspace / Native HtmlService)**:
     - _Execute as_: `User accessing the web app` (`USER_ACCESSING`)
     - _Who has access_: `Anyone within your Google Workspace domain` (or specific Google accounts).
   - **External Static Hosting (GitHub Pages)**:
     - Because cross-origin `fetch()` requests from GitHub Pages cannot attach Google session cookies across `script.google.com` redirects, if you deploy on GitHub Pages, set _Execute as_: `Me` and verify the operator email in the `Users` sheet. Never leave sensitive spreadsheets publicly shared on Google Drive.
4. Copy the generated `https://script.google.com/macros/s/.../exec` Web App URL.

---

## 4. Configuring the Frontend Endpoint, GitHub Pages & Google Sites

### Configuring the Endpoint

1. Open the application in your browser.
2. Navigate to **12. Settings → Apps Script Web App Connection**.
3. Paste your `/exec` URL and click **Save Connection**.
4. `api.js` sends POST payloads with `Content-Type: text/plain;charset=utf-8` and `redirect: 'follow'`, avoiding browser CORS `OPTIONS` preflight rejections on Google Apps Script endpoints.

### GitHub Pages Deployment

1. Push `index.html`, `styles.css`, `api.js`, `app.js`, `sample-data.csv`, and `README.md` to a GitHub repository.
2. Go to **Settings → Pages → Build and deployment**, select the `main` branch (`/root`), and save.

### Google Sites Embedding

1. Open Google Sites → **Insert → Embed → By URL** (using your Apps Script Web App URL, since `XFrameOptionsMode.ALLOWALL` is enabled in `doGet`).

---

## 5. Required OAuth Permissions & Purpose

| Scope                           | Purpose                                                                     |
| :------------------------------ | :-------------------------------------------------------------------------- |
| `spreadsheets`                  | Read and write structured rows across the 20 sheets.                        |
| `drive.readonly` / `drive.file` | Create automated daily spreadsheet backups in the restricted backup folder. |
| `script.scriptapp`              | Manage installable time-driven triggers without creating duplicates.        |
| `script.send_mail`              | Send daily low-stock and sales summary emails when enabled by the owner.    |
| `userinfo.email`                | Identify the logged-in operator for RBAC and `AuditLogs`.                   |

---

## 6. Reconciliation & Recovery Procedures

### Reconciling Stock Balances with `StockMovements`

- `StockMovements` is the single source of truth for inventory.
- Click **3. Inventory → Reconcile Cached Stock** (or run `reconcileInventory` in `Code.gs`). The server recalculates the net sum of `QtyChange` per `ProductID` and repairs any drifted `CachedStock` values in `Products`.

### Reconciling Recorded Payments with Invoices & Supplier Bills

- Click **7. Customers → Reconcile Balances** (or run `reconcilePartyBalances` in `Code.gs`). The server recalculates every customer's `OpeningBalance + sum(unpaid Sales.BalanceDue)` and every supplier's `OpeningBalance + sum(received Purchases.BalanceDue)` and updates `CachedBalance`.

### Backup & Restore

- Enable **Daily Google Drive Backup** in Settings with a restricted Drive Folder ID, or use **File → Version history** in Google Sheets to restore any point-in-time snapshot.

---

## 7. Verification Test Checklist

- [ ] **Database Setup**: Run `setupDatabase()` and confirm all 20 sheets and headers exist.
- [ ] **Duplicate SKU Guard**: Attempt to create two products with SKU `GRC-AT-05` — verify server rejection.
- [ ] **Stock Concurrency & Negative Stock Guard**: With `ALLOW_NEGATIVE_STOCK = FALSE`, attempt to sell 50 units of a product with 23 in stock — verify rejection.
- [ ] **GST Calculation**: Test Intra-State (`CGST + SGST`) and Inter-State (`IGST`) in POS and verify server-side recalculation.
- [ ] **Split & Partial Payments**: Bill ₹514.50 using ₹200 Cash + ₹314.50 UPI — verify two `Payments` rows and `PaymentAllocations` rows are created.
- [ ] **Walk-in Credit Block**: Attempt an unpaid sale for `Walk-in Customer` (`CUS-0001`) — verify server blocks credit for anonymous walk-ins.
- [ ] **Duplicate Click / Idempotency**: Rapidly click "Complete Sale" twice — verify only one invoice and one stock deduction occur.
- [ ] **Purchase & Damaged GRN**: Order 10 units on a PO, receive 10 with 2 damaged — verify stock increases by **8** accepted units.
- [ ] **Controlled Sales Return**: Process a 1-unit return on an invoice — verify `SalesReturns` entry, stock restoration in `StockMovements`, and preservation of original invoice history.
- [ ] **Gross Profit Accuracy**: Open **11. Reports → 16. Estimated Gross Profit** and verify it uses `Net Taxable Sales (excl. GST) - Returns - Snapshot COGS` and excludes internal bank/cash contra transfers.

---

## 8. Known Limitations

1. **Google Sheets Quotas**: Google Sheets supports up to 10 million cells per workbook. High-volume stores (>50,000 line items/year) should archive old financial years into separate workbooks annually.
2. **LockService Concurrency**: `LockService.getScriptLock()` serializes concurrent writes safely for 1–5 counter terminals, but is not designed for dozens of simultaneous high-frequency POS terminals.
