/**
 * FRONTEND-BACKEND TRANSPORT ADAPTER (api.js)
 * Supports:
 * 1. Native Google Apps Script HtmlService (google.script.run)
 * 2. External Hosting via GitHub Pages / Google Sites (CORS-safe POST text/plain)
 * 3. Instant Local Sandbox Fallback (when testing UI before linking Web App URL)
 */

const ApiAdapter = (function () {
  const STORAGE_URL_KEY = 'RMS_GAS_WEBAPP_URL';
  const STORAGE_EMAIL_KEY = 'RMS_USER_EMAIL_HINT';
  const STORAGE_SANDBOX_KEY = 'RMS_LOCAL_SANDBOX_DB_V1';

  function getEndpointUrl() {
    return localStorage.getItem(STORAGE_URL_KEY) || '';
  }

  function setEndpointUrl(url) {
    localStorage.setItem(STORAGE_URL_KEY, String(url || '').trim());
  }

  function getUserEmailHint() {
    return localStorage.getItem(STORAGE_EMAIL_KEY) || '';
  }

  function setUserEmailHint(email) {
    localStorage.setItem(STORAGE_EMAIL_KEY, String(email || '').trim());
  }

  function isNativeAppsScript() {
    return typeof window !== 'undefined' &&
      window.google &&
      window.google.script &&
      window.google.script.run;
  }

  function generateIdempotencyKey(prefix) {
    return (prefix || 'REQ') + '-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  async function request(action, payload = {}, idempotencyKey = null) {
    const reqEnvelope = {
      action: action,
      payload: payload,
      idempotencyKey: idempotencyKey || generateIdempotencyKey(action),
      userEmailHint: getUserEmailHint()
    };

    // 1. Native Google Apps Script HtmlService transport
    if (isNativeAppsScript()) {
      return new Promise((resolve, reject) => {
        window.google.script.run
          .withSuccessHandler(res => {
            if (res && res.success) resolve(res.data);
            else reject(new Error((res && res.error) || 'Server operation failed.'));
          })
          .withFailureHandler(err => reject(new Error(err.message || String(err))))
          .handleClientRequest(reqEnvelope);
      });
    }

    // 2. External Fetch to deployed Google Apps Script Web App URL
    const endpoint = getEndpointUrl();
    if (endpoint) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          redirect: 'follow',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify(reqEnvelope),
          signal: controller.signal
        });
        clearTimeout(timer);
        const json = await response.json();
        if (!json.success) {
          throw new Error(json.error || 'Backend returned an error.');
        }
        return json.data;
      } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
          throw new Error('Request timed out after 30s. Safe to retry (Idempotency Key protected).');
        }
        throw err;
      }
    }

    // 3. Interactive Local Sandbox Mode (Works out-of-the-box before configuring Web App URL)
    return executeLocalSandbox(reqEnvelope);
  }

  /**
   * Local Sandbox Engine (Mirrors Code.gs data structures & business rules)
   */
  function getSandboxDB() {
    const raw = localStorage.getItem(STORAGE_SANDBOX_KEY);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    const today = new Date().toISOString().slice(0, 10);
    const seed = {
      user: { email: 'owner@shop.in', name: 'Rajesh Patel (Owner)', role: 'ADMIN', storeId: 'STR-01' },
      settings: {
        SHOP_NAME: 'Shree Ganesh Kirana & General Store',
        SHOP_ADDRESS: '42, MG Road, Alkapuri, Vadodara, Gujarat - 390007',
        SHOP_PHONE: '+91 9876543210',
        SHOP_GSTIN: '24AABCS1429B1Z1',
        FINANCIAL_YEAR: '2026-27',
        ALLOW_NEGATIVE_STOCK: 'FALSE',
        INVOICE_TERMS: 'Goods once sold will only be exchanged within 7 days with original bill.',
        AUTO_LOW_STOCK_EMAIL: 'FALSE',
        AUTO_DAILY_SALES_EMAIL: 'FALSE',
        AUTO_PAYMENT_REMINDERS: 'FALSE',
        AUTO_DAILY_BACKUP: 'FALSE',
        ALERT_RECIPIENT_EMAIL: 'owner@shop.in',
        BACKUP_FOLDER_ID: ''
      },
      stores: [
        { StoreID: 'STR-01', StoreName: 'Main Branch - Alkapuri', Address: '42, MG Road, Vadodara', Phone: '+91 9876543210', GSTIN: '24AABCS1429B1Z1', StateCode: '24', Active: 'TRUE' }
      ],
      categories: [
        { CategoryID: 'CAT-01', CategoryName: 'Groceries & Staples', Active: 'TRUE' },
        { CategoryID: 'CAT-02', CategoryName: 'Dairy & Beverages', Active: 'TRUE' },
        { CategoryID: 'CAT-03', CategoryName: 'Packaged Snacks', Active: 'TRUE' },
        { CategoryID: 'CAT-04', CategoryName: 'Personal Care', Active: 'TRUE' },
        { CategoryID: 'CAT-05', CategoryName: 'Household Supplies', Active: 'TRUE' }
      ],
      products: [
        { ProductID: 'PRD-0001', SKU: 'GRC-AT-05', Barcode: '8901725121112', Name: 'Aashirvaad Shudh Chakki Atta 5kg', Category: 'Groceries & Staples', Brand: 'ITC', Unit: 'Bag', PurchaseCost: 215, SellingPrice: 245, GSTRate: 5, HSN: '1101', OpeningStock: 25, MinStock: 10, CachedStock: 23, CurrentStock: 23, Active: 'TRUE', Description: 'Whole wheat flour 5kg pack' },
        { ProductID: 'PRD-0002', SKU: 'DRY-AM-01', Barcode: '8901262010016', Name: 'Amul Taaza Toned Milk 1L Tetrapack', Category: 'Dairy & Beverages', Brand: 'Amul', Unit: 'Pack', PurchaseCost: 66, SellingPrice: 72, GSTRate: 5, HSN: '0401', OpeningStock: 40, MinStock: 15, CachedStock: 38, CurrentStock: 38, Active: 'TRUE', Description: 'UHT Treated Toned Milk 1L' },
        { ProductID: 'PRD-0003', SKU: 'BEV-TT-500', Barcode: '8901058851234', Name: 'Tata Tea Gold 500g', Category: 'Dairy & Beverages', Brand: 'Tata', Unit: 'Pack', PurchaseCost: 235, SellingPrice: 280, GSTRate: 5, HSN: '0902', OpeningStock: 8, MinStock: 10, CachedStock: 8, CurrentStock: 8, Active: 'TRUE', Description: 'Assam tea with gently rolled aromatic long leaves' },
        { ProductID: 'PRD-0004', SKU: 'SNK-MG-420', Barcode: '8901058000290', Name: 'Maggi 2-Minute Noodles 6-Pack (420g)', Category: 'Packaged Snacks', Brand: 'Nestle', Unit: 'Pack', PurchaseCost: 72, SellingPrice: 84, GSTRate: 12, HSN: '1902', OpeningStock: 30, MinStock: 12, CachedStock: 30, CurrentStock: 30, Active: 'TRUE', Description: 'Masala instant noodles family pack' },
        { ProductID: 'PRD-0005', SKU: 'HHS-SX-01', Barcode: '8901030845215', Name: 'Surf Excel Easy Wash Detergent 1kg', Category: 'Household Supplies', Brand: 'HUL', Unit: 'Pack', PurchaseCost: 112, SellingPrice: 135, GSTRate: 18, HSN: '3402', OpeningStock: 6, MinStock: 10, CachedStock: 6, CurrentStock: 6, Active: 'TRUE', Description: 'Superfast stain removal detergent powder' }
      ],
      customers: [
        { CustomerID: 'CUS-0001', Name: 'Walk-in Customer', Phone: '0000000000', Email: '', Address: 'Counter Sale', GSTIN: '', CreditLimit: 0, OpeningBalance: 0, CachedBalance: 0, Notes: 'Default counter customer', Active: 'TRUE' },
        { CustomerID: 'CUS-0002', Name: 'Mehta Provision & Cafe', Phone: '9825011223', Email: 'mehtacafe@example.com', Address: '14, Sayajigunj, Vadodara', GSTIN: '24AAACM1234F1Z5', CreditLimit: 25000, OpeningBalance: 1200, CachedBalance: 1200, Notes: 'B2B Account', Active: 'TRUE' },
        { CustomerID: 'CUS-0003', Name: 'Priya Desai', Phone: '9898044556', Email: 'priya.desai@example.com', Address: 'Vasna Road, Vadodara', GSTIN: '', CreditLimit: 5000, OpeningBalance: 0, CachedBalance: 151.2, Notes: 'Regular customer', Active: 'TRUE' }
      ],
      suppliers: [
        { SupplierID: 'SUP-0001', Name: 'Gujarat FMCG Distributors Pvt Ltd', ContactPerson: 'Kiran Shah', Phone: '9824099887', Email: 'orders@gujaratfmcg.in', Address: 'GIDC Makarpura, Vadodara', GSTIN: '24AABCG5566H1Z2', PaymentTerms: 'Net 15', OpeningBalance: 4500, CachedBalance: 4500, Notes: 'ITC & HUL distributor', Active: 'TRUE' },
        { SupplierID: 'SUP-0002', Name: 'Anand Dairy Agency', ContactPerson: 'Sureshbhai Patel', Phone: '9727033445', Email: 'ananddairy@example.com', Address: 'Ajwa Road, Vadodara', GSTIN: '24AAACF9876D1Z9', PaymentTerms: 'COD', OpeningBalance: 0, CachedBalance: 0, Notes: 'Dairy supplier', Active: 'TRUE' }
      ],
      sales: [
        { InvoiceID: 'INV-SEED-01', InvoiceNo: 'INV-2026-27-0001', Date: today, StoreID: 'STR-01', CustomerID: 'CUS-0001', CustomerName: 'Walk-in Customer', CustomerGSTIN: '', TaxType: 'INTRA', Subtotal: 490, DiscountTotal: 0, TaxableAmount: 490, CGST: 12.25, SGST: 12.25, IGST: 0, GrandTotal: 514.5, AmountPaid: 514.5, BalanceDue: 0, PaymentStatus: 'PAID', Status: 'COMPLETED', Notes: 'Counter bill', Operator: 'owner@shop.in' },
        { InvoiceID: 'INV-SEED-02', InvoiceNo: 'INV-2026-27-0002', Date: today, StoreID: 'STR-01', CustomerID: 'CUS-0003', CustomerName: 'Priya Desai', CustomerGSTIN: '', TaxType: 'INTRA', Subtotal: 144, DiscountTotal: 0, TaxableAmount: 144, CGST: 3.6, SGST: 3.6, IGST: 0, GrandTotal: 151.2, AmountPaid: 0, BalanceDue: 151.2, PaymentStatus: 'UNPAID', Status: 'COMPLETED', Notes: 'Credit bill', Operator: 'owner@shop.in' }
      ],
      saleItems: [
        { SaleItemID: 'INV-SEED-01-L1', InvoiceID: 'INV-SEED-01', InvoiceNo: 'INV-2026-27-0001', ProductID: 'PRD-0001', SKU: 'GRC-AT-05', ProductName: 'Aashirvaad Shudh Chakki Atta 5kg', HSN: '1101', Quantity: 2, UnitPrice: 245, Discount: 0, TaxableValue: 490, GSTRate: 5, CGST: 12.25, SGST: 12.25, IGST: 0, LineTotal: 514.5, UnitCostSnapshot: 215 },
        { SaleItemID: 'INV-SEED-02-L1', InvoiceID: 'INV-SEED-02', InvoiceNo: 'INV-2026-27-0002', ProductID: 'PRD-0002', SKU: 'DRY-AM-01', ProductName: 'Amul Taaza Toned Milk 1L Tetrapack', HSN: '0401', Quantity: 2, UnitPrice: 72, Discount: 0, TaxableValue: 144, GSTRate: 5, CGST: 3.6, SGST: 3.6, IGST: 0, LineTotal: 151.2, UnitCostSnapshot: 66 }
      ],
      salesReturns: [],
      purchases: [
        { PurchaseID: 'PUR-SEED-01', PONumber: 'PO-2026-27-0001', Date: today, SupplierID: 'SUP-0001', SupplierName: 'Gujarat FMCG Distributors Pvt Ltd', SupplierInvoiceNo: 'GFD/882', Status: 'ORDERED', Subtotal: 2350, TaxTotal: 117.5, GrandTotal: 2467.5, AmountPaid: 0, BalanceDue: 2467.5, Notes: 'Restock order for Tata Tea Gold', Operator: 'owner@shop.in' }
      ],
      purchaseItems: [
        { PurchaseItemID: 'PUR-SEED-01-L1', PurchaseID: 'PUR-SEED-01', PONumber: 'PO-2026-27-0001', ProductID: 'PRD-0003', ProductName: 'Tata Tea Gold 500g', OrderedQty: 10, ReceivedQty: 0, DamagedQty: 0, UnitCost: 235, GSTRate: 5, TaxAmount: 117.5, LineTotal: 2467.5 }
      ],
      goodsReceipts: [],
      payments: [
        { PaymentID: 'PAY-SEED-01', PaymentNo: 'PAY-2026-27-0001', Date: today, PartyType: 'CUSTOMER', PartyID: 'CUS-0001', PartyName: 'Walk-in Customer', PaymentType: 'INCOMING', PaymentMethod: 'UPI', Amount: 514.5, UnallocatedAmount: 0, ReferenceNo: 'UPI-41258963', Notes: 'POS Bill INV-2026-27-0001', Operator: 'owner@shop.in' }
      ],
      paymentAllocations: [
        { AllocationID: 'ALC-01', PaymentID: 'PAY-SEED-01', Date: today, DocumentType: 'INVOICE', DocumentID: 'INV-SEED-01', DocumentNo: 'INV-2026-27-0001', AllocatedAmount: 514.5 }
      ],
      expenses: [
        { ExpenseID: 'EXP-SEED-01', Date: today, Category: 'Utilities & Electricity', Description: 'Shop Electricity Bill & Packaging Carry Bags', Amount: 450, PaymentMethod: 'CASH', Payee: 'MGVCL / Local Vendor', ReferenceNo: 'BILL-109', IsInternalTransfer: 'FALSE', Notes: 'Paid from counter cash', Operator: 'owner@shop.in' }
      ],
      stockMovements: [
        { MovementID: 'MOV-07', Timestamp: today + 'T10:15:00', ProductID: 'PRD-0002', SKU: 'DRY-AM-01', ProductName: 'Amul Taaza Toned Milk 1L Tetrapack', MovementType: 'SALE', QtyChange: -2, ReferenceDocID: 'INV-SEED-02', ReferenceDocNo: 'INV-2026-27-0002', Reason: 'POS Sale', Location: 'STR-01', Operator: 'owner@shop.in' },
        { MovementID: 'MOV-06', Timestamp: today + 'T09:40:00', ProductID: 'PRD-0001', SKU: 'GRC-AT-05', ProductName: 'Aashirvaad Shudh Chakki Atta 5kg', MovementType: 'SALE', QtyChange: -2, ReferenceDocID: 'INV-SEED-01', ReferenceDocNo: 'INV-2026-27-0001', Reason: 'POS Sale', Location: 'STR-01', Operator: 'owner@shop.in' },
        { MovementID: 'MOV-05', Timestamp: today + 'T08:00:00', ProductID: 'PRD-0005', SKU: 'HHS-SX-01', ProductName: 'Surf Excel Easy Wash Detergent 1kg', MovementType: 'OPENING_STOCK', QtyChange: 6, ReferenceDocID: 'PRD-0005', ReferenceDocNo: 'OPENING', Reason: 'Initial stock', Location: 'STR-01', Operator: 'SYSTEM' },
        { MovementID: 'MOV-04', Timestamp: today + 'T08:00:00', ProductID: 'PRD-0004', SKU: 'SNK-MG-420', ProductName: 'Maggi 2-Minute Noodles 6-Pack (420g)', MovementType: 'OPENING_STOCK', QtyChange: 30, ReferenceDocID: 'PRD-0004', ReferenceDocNo: 'OPENING', Reason: 'Initial stock', Location: 'STR-01', Operator: 'SYSTEM' },
        { MovementID: 'MOV-03', Timestamp: today + 'T08:00:00', ProductID: 'PRD-0003', SKU: 'BEV-TT-500', ProductName: 'Tata Tea Gold 500g', MovementType: 'OPENING_STOCK', QtyChange: 8, ReferenceDocID: 'PRD-0003', ReferenceDocNo: 'OPENING', Reason: 'Initial stock', Location: 'STR-01', Operator: 'SYSTEM' },
        { MovementID: 'MOV-02', Timestamp: today + 'T08:00:00', ProductID: 'PRD-0002', SKU: 'DRY-AM-01', ProductName: 'Amul Taaza Toned Milk 1L Tetrapack', MovementType: 'OPENING_STOCK', QtyChange: 40, ReferenceDocID: 'PRD-0002', ReferenceDocNo: 'OPENING', Reason: 'Initial stock', Location: 'STR-01', Operator: 'SYSTEM' },
        { MovementID: 'MOV-01', Timestamp: today + 'T08:00:00', ProductID: 'PRD-0001', SKU: 'GRC-AT-05', ProductName: 'Aashirvaad Shudh Chakki Atta 5kg', MovementType: 'OPENING_STOCK', QtyChange: 25, ReferenceDocID: 'PRD-0001', ReferenceDocNo: 'OPENING', Reason: 'Initial stock', Location: 'STR-01', Operator: 'SYSTEM' }
      ],
      processedKeys: {}
    };
    saveSandboxDB(seed);
    return seed;
  }

  function saveSandboxDB(db) {
    localStorage.setItem(STORAGE_SANDBOX_KEY, JSON.stringify(db));
  }

  function r2(n) {
    return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
  }

  function recalcSandboxStock(db) {
    const map = {};
    db.stockMovements.forEach(m => {
      map[m.ProductID] = r2((map[m.ProductID] || 0) + Number(m.QtyChange || 0));
    });
    db.products.forEach(p => {
      const s = map[p.ProductID] !== undefined ? map[p.ProductID] : Number(p.OpeningStock || 0);
      p.CurrentStock = r2(s);
      p.CachedStock = r2(s);
    });
  }

  function executeLocalSandbox(req) {
    const db = getSandboxDB();
    const { action, payload, idempotencyKey } = req;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString().slice(0, 19);

    if (idempotencyKey && db.processedKeys && db.processedKeys[idempotencyKey]) {
      return Promise.resolve(db.processedKeys[idempotencyKey]);
    }

    recalcSandboxStock(db);

    switch (action) {
      case 'getInitialBundle':
        return Promise.resolve(db);

      case 'setupDatabase':
        localStorage.removeItem(STORAGE_SANDBOX_KEY);
        return Promise.resolve({ message: 'Sandbox database reset and re-seeded with sample records.' });

      case 'saveProduct': {
        const sku = String(payload.SKU || '').trim().toUpperCase();
        if (!sku || !payload.Name) return Promise.reject(new Error('SKU and Product Name are required.'));
        const dup = db.products.find(p => p.SKU.toUpperCase() === sku && p.ProductID !== payload.ProductID);
        if (dup) return Promise.reject(new Error('Duplicate SKU: ' + sku + ' already exists.'));

        if (payload.ProductID) {
          const idx = db.products.findIndex(p => p.ProductID === payload.ProductID);
          if (idx === -1) return Promise.reject(new Error('Product not found.'));
          db.products[idx] = {
            ...db.products[idx],
            SKU: sku,
            Barcode: payload.Barcode || '',
            Name: payload.Name,
            Category: payload.Category,
            Brand: payload.Brand || '',
            Unit: payload.Unit || 'Pcs',
            PurchaseCost: r2(payload.PurchaseCost),
            SellingPrice: r2(payload.SellingPrice),
            GSTRate: r2(payload.GSTRate),
            HSN: payload.HSN || '',
            MinStock: r2(payload.MinStock),
            Active: payload.Active || 'TRUE',
            Description: payload.Description || ''
          };
        } else {
          const newId = 'PRD-' + String(db.products.length + 1).padStart(4, '0');
          const openQty = r2(payload.OpeningStock || 0);
          db.products.push({
            ProductID: newId,
            SKU: sku,
            Barcode: payload.Barcode || '',
            Name: payload.Name,
            Category: payload.Category || 'Groceries & Staples',
            Brand: payload.Brand || '',
            Unit: payload.Unit || 'Pcs',
            PurchaseCost: r2(payload.PurchaseCost),
            SellingPrice: r2(payload.SellingPrice),
            GSTRate: r2(payload.GSTRate),
            HSN: payload.HSN || '',
            OpeningStock: openQty,
            MinStock: r2(payload.MinStock),
            CachedStock: openQty,
            CurrentStock: openQty,
            Active: 'TRUE',
            Description: payload.Description || ''
          });
          if (openQty !== 0) {
            db.stockMovements.unshift({
              MovementID: 'MOV-' + Date.now(),
              Timestamp: now,
              ProductID: newId,
              SKU: sku,
              ProductName: payload.Name,
              MovementType: 'OPENING_STOCK',
              QtyChange: openQty,
              ReferenceDocID: newId,
              ReferenceDocNo: 'OPENING',
              Reason: 'Opening balance',
              Location: 'STR-01',
              Operator: db.user.email
            });
          }
        }
        recalcSandboxStock(db);
        saveSandboxDB(db);
        return Promise.resolve({ message: 'Product saved.' });
      }

      case 'importProductsBatch': {
        let imported = 0, skipped = 0;
        (payload.rows || []).forEach(r => {
          const sku = String(r.SKU || '').trim().toUpperCase();
          if (!sku || !r.Name || db.products.some(p => p.SKU.toUpperCase() === sku)) {
            skipped++;
            return;
          }
          const newId = 'PRD-' + String(db.products.length + 1).padStart(4, '0');
          const openQty = r2(r.OpeningStock || 0);
          db.products.push({
            ProductID: newId, SKU: sku, Barcode: r.Barcode || '', Name: r.Name,
            Category: r.Category || 'Groceries & Staples', Brand: r.Brand || '', Unit: r.Unit || 'Pcs',
            PurchaseCost: r2(r.PurchaseCost), SellingPrice: r2(r.SellingPrice), GSTRate: r2(r.GSTRate || 5),
            HSN: r.HSN || '', OpeningStock: openQty, MinStock: r2(r.MinStock || 5),
            CachedStock: openQty, CurrentStock: openQty, Active: 'TRUE', Description: r.Description || ''
          });
          if (openQty > 0) {
            db.stockMovements.unshift({
              MovementID: 'MOV-' + Date.now() + '-' + imported, Timestamp: now, ProductID: newId, SKU: sku,
              ProductName: r.Name, MovementType: 'OPENING_STOCK', QtyChange: openQty,
              ReferenceDocID: newId, ReferenceDocNo: 'CSV-IMPORT', Reason: 'CSV Import', Location: 'STR-01', Operator: db.user.email
            });
          }
          imported++;
        });
        recalcSandboxStock(db);
        saveSandboxDB(db);
        return Promise.resolve({ imported, skipped });
      }

      case 'recordStockAdjustment': {
        const prod = db.products.find(p => p.ProductID === payload.ProductID);
        if (!prod) return Promise.reject(new Error('Product not found.'));
        const qtyChange = r2(payload.QtyChange);
        if (!qtyChange || !payload.Reason) return Promise.reject(new Error('Quantity change and reason are required.'));
        if (prod.CurrentStock + qtyChange < 0 && db.settings.ALLOW_NEGATIVE_STOCK !== 'TRUE') {
          return Promise.reject(new Error('Stock cannot go below zero. Current stock: ' + prod.CurrentStock));
        }
        const adjId = 'ADJ-' + Date.now().toString().slice(-5);
        db.stockMovements.unshift({
          MovementID: 'MOV-' + Date.now(), Timestamp: now, ProductID: prod.ProductID, SKU: prod.SKU,
          ProductName: prod.Name, MovementType: 'ADJUSTMENT', QtyChange: qtyChange,
          ReferenceDocID: adjId, ReferenceDocNo: adjId, Reason: payload.Reason, Location: 'STR-01', Operator: db.user.email
        });
        recalcSandboxStock(db);
        saveSandboxDB(db);
        return Promise.resolve({ AdjustmentID: adjId });
      }

      case 'reconcileInventory':
        recalcSandboxStock(db);
        saveSandboxDB(db);
        return Promise.resolve({ totalProducts: db.products.length, correctedCount: 0 });

      case 'createSale': {
        const items = payload.items || [];
        if (items.length === 0) return Promise.reject(new Error('Cart is empty.'));
        const allowNeg = db.settings.ALLOW_NEGATIVE_STOCK === 'TRUE';
        const taxType = payload.TaxType === 'IGST' ? 'IGST' : 'INTRA';
        const customer = db.customers.find(c => c.CustomerID === payload.CustomerID) || db.customers[0];

        let subtotal = 0, discountTotal = 0, taxableTotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0;
        const lines = [];

        for (const item of items) {
          const prod = db.products.find(p => p.ProductID === item.ProductID);
          if (!prod) return Promise.reject(new Error('Product not found.'));
          const qty = r2(item.Quantity);
          if (!allowNeg && qty > prod.CurrentStock) {
            return Promise.reject(new Error(`Insufficient stock for ${prod.Name} (Available: ${prod.CurrentStock})`));
          }
          const price = r2(prod.SellingPrice);
          const gross = r2(qty * price);
          const disc = Math.min(gross, Math.max(0, r2(item.Discount || 0)));
          const taxable = r2(gross - disc);
          const gst = r2(prod.GSTRate || 0);
          const tax = r2(taxable * (gst / 100));
          let cgst = 0, sgst = 0, igst = 0;
          if (taxType === 'IGST') igst = tax;
          else { cgst = r2(tax / 2); sgst = r2(tax - cgst); }
          const lineTotal = r2(taxable + cgst + sgst + igst);

          subtotal = r2(subtotal + gross);
          discountTotal = r2(discountTotal + disc);
          taxableTotal = r2(taxableTotal + taxable);
          cgstTotal = r2(cgstTotal + cgst);
          sgstTotal = r2(sgstTotal + sgst);
          igstTotal = r2(igstTotal + igst);

          lines.push({ prod, qty, price, disc, taxable, gst, cgst, sgst, igst, lineTotal });
        }

        const grandTotal = r2(taxableTotal + cgstTotal + sgstTotal + igstTotal);
        const paymentsInput = Array.isArray(payload.payments) && payload.payments.length > 0
          ? payload.payments
          : [{ method: payload.PaymentMethod || 'CASH', amount: grandTotal, reference: payload.ReferenceNo || '' }];

        const rawPaid = paymentsInput.reduce((s, p) => r2(s + r2(p.amount)), 0);
        const appliedPaid = Math.min(grandTotal, rawPaid);
        const balanceDue = r2(grandTotal - appliedPaid);

        if (balanceDue > 0 && customer.CustomerID === 'CUS-0001') {
          return Promise.reject(new Error('Walk-in Customer cannot have an unpaid balance. Select or add a registered customer.'));
        }

        const invNo = `INV-${db.settings.FINANCIAL_YEAR || '2026-27'}-${String(db.sales.length + 1).padStart(4, '0')}`;
        const invId = 'INV-' + Date.now();
        const invoiceRecord = {
          InvoiceID: invId, InvoiceNo: invNo, Date: payload.Date || today, StoreID: 'STR-01',
          CustomerID: customer.CustomerID, CustomerName: customer.Name, CustomerGSTIN: customer.GSTIN || '',
          TaxType: taxType, Subtotal: subtotal, DiscountTotal: discountTotal, TaxableAmount: taxableTotal,
          CGST: cgstTotal, SGST: sgstTotal, IGST: igstTotal, GrandTotal: grandTotal,
          AmountPaid: appliedPaid, BalanceDue: balanceDue,
          PaymentStatus: balanceDue === 0 ? 'PAID' : (appliedPaid > 0 ? 'PARTIAL' : 'UNPAID'),
          Status: 'COMPLETED', Notes: payload.Notes || '', Operator: db.user.email
        };
        db.sales.unshift(invoiceRecord);

        lines.forEach((l, i) => {
          db.saleItems.push({
            SaleItemID: invId + '-L' + (i + 1), InvoiceID: invId, InvoiceNo: invNo,
            ProductID: l.prod.ProductID, SKU: l.prod.SKU, ProductName: l.prod.Name, HSN: l.prod.HSN || '',
            Quantity: l.qty, UnitPrice: l.price, Discount: l.disc, TaxableValue: l.taxable,
            GSTRate: l.gst, CGST: l.cgst, SGST: l.sgst, IGST: l.igst, LineTotal: l.lineTotal,
            UnitCostSnapshot: r2(l.prod.PurchaseCost)
          });
          db.stockMovements.unshift({
            MovementID: 'MOV-' + Date.now() + '-' + i, Timestamp: now, ProductID: l.prod.ProductID,
            SKU: l.prod.SKU, ProductName: l.prod.Name, MovementType: 'SALE', QtyChange: -Math.abs(l.qty),
            ReferenceDocID: invId, ReferenceDocNo: invNo, Reason: 'POS Sale ' + invNo, Location: 'STR-01', Operator: db.user.email
          });
        });

        let rem = appliedPaid;
        paymentsInput.forEach((pmt, idx) => {
          const amt = Math.min(rem, r2(pmt.amount));
          if (amt <= 0) return;
          rem = r2(rem - amt);
          const payNo = `PAY-2026-27-${String(db.payments.length + 1).padStart(4, '0')}`;
          const payId = 'PAY-' + Date.now() + '-' + idx;
          db.payments.unshift({
            PaymentID: payId, PaymentNo: payNo, Date: today, PartyType: 'CUSTOMER',
            PartyID: customer.CustomerID, PartyName: customer.Name, PaymentType: 'INCOMING',
            PaymentMethod: pmt.method || 'CASH', Amount: amt, UnallocatedAmount: 0,
            ReferenceNo: pmt.reference || invNo, Notes: 'POS Receipt ' + invNo, Operator: db.user.email
          });
          db.paymentAllocations.push({
            AllocationID: 'ALC-' + Date.now() + '-' + idx, PaymentID: payId, Date: today,
            DocumentType: 'INVOICE', DocumentID: invId, DocumentNo: invNo, AllocatedAmount: amt
          });
        });

        if (balanceDue > 0) {
          customer.CachedBalance = r2(Number(customer.CachedBalance || 0) + balanceDue);
        }

        recalcSandboxStock(db);
        const result = { invoice: invoiceRecord };
        db.processedKeys[idempotencyKey] = result;
        saveSandboxDB(db);
        return Promise.resolve(result);
      }

      case 'processSalesReturn': {
        const inv = db.sales.find(s => s.InvoiceID === payload.InvoiceID);
        if (!inv) return Promise.reject(new Error('Invoice not found.'));
        const line = db.saleItems.find(si => si.InvoiceID === payload.InvoiceID && si.ProductID === payload.ProductID);
        if (!line) return Promise.reject(new Error('Item not found on invoice.'));
        const retQty = r2(payload.Quantity);
        if (retQty <= 0 || retQty > line.Quantity) return Promise.reject(new Error('Invalid return quantity.'));

        const ratio = retQty / line.Quantity;
        const taxableRefund = r2(line.TaxableValue * ratio);
        const taxRefund = r2((line.CGST + line.SGST + line.IGST) * ratio);
        const totalRefund = r2(taxableRefund + taxRefund);
        const retNo = `RET-2026-27-${String(db.salesReturns.length + 1).padStart(4, '0')}`;

        db.salesReturns.unshift({
          ReturnID: 'RET-' + Date.now(), ReturnNo: retNo, Date: today, InvoiceID: inv.InvoiceID,
          InvoiceNo: inv.InvoiceNo, CustomerID: inv.CustomerID, ProductID: line.ProductID,
          Quantity: retQty, TaxableRefund: taxableRefund, TaxRefund: taxRefund, TotalRefund: totalRefund,
          Condition: payload.Condition || 'RESTOCK', Reason: payload.Reason || 'Customer Return',
          RefundMethod: payload.RefundMethod || 'CASH', Operator: db.user.email
        });

        if ((payload.Condition || 'RESTOCK') === 'RESTOCK') {
          db.stockMovements.unshift({
            MovementID: 'MOV-' + Date.now(), Timestamp: now, ProductID: line.ProductID, SKU: line.SKU,
            ProductName: line.ProductName, MovementType: 'CUSTOMER_RETURN', QtyChange: retQty,
            ReferenceDocID: retNo, ReferenceDocNo: retNo, Reason: 'Return against ' + inv.InvoiceNo,
            Location: 'STR-01', Operator: db.user.email
          });
        }
        recalcSandboxStock(db);
        saveSandboxDB(db);
        return Promise.resolve({ ReturnNo: retNo, TotalRefund: totalRefund });
      }

      case 'createPurchaseOrder': {
        const sup = db.suppliers.find(s => s.SupplierID === payload.SupplierID);
        if (!sup) return Promise.reject(new Error('Supplier not found.'));
        const poId = 'PUR-' + Date.now();
        const poNo = `PO-2026-27-${String(db.purchases.length + 1).padStart(4, '0')}`;
        let sub = 0, tax = 0;

        (payload.items || []).forEach((it, idx) => {
          const prod = db.products.find(p => p.ProductID === it.ProductID);
          if (!prod) return;
          const qty = r2(it.OrderedQty);
          const cost = r2(it.UnitCost || prod.PurchaseCost);
          const lSub = r2(qty * cost);
          const lTax = r2(lSub * (prod.GSTRate / 100));
          sub = r2(sub + lSub);
          tax = r2(tax + lTax);
          db.purchaseItems.push({
            PurchaseItemID: poId + '-L' + (idx + 1), PurchaseID: poId, PONumber: poNo,
            ProductID: prod.ProductID, ProductName: prod.Name, OrderedQty: qty, ReceivedQty: 0,
            DamagedQty: 0, UnitCost: cost, GSTRate: prod.GSTRate, TaxAmount: lTax, LineTotal: r2(lSub + lTax)
          });
        });

        const grand = r2(sub + tax);
        db.purchases.unshift({
          PurchaseID: poId, PONumber: poNo, Date: payload.Date || today, SupplierID: sup.SupplierID,
          SupplierName: sup.Name, SupplierInvoiceNo: payload.SupplierInvoiceNo || '', Status: 'ORDERED',
          Subtotal: sub, TaxTotal: tax, GrandTotal: grand, AmountPaid: 0, BalanceDue: grand,
          Notes: payload.Notes || '', Operator: db.user.email
        });
        saveSandboxDB(db);
        return Promise.resolve({ PurchaseID: poId, PONumber: poNo });
      }

      case 'receiveGoods': {
        const po = db.purchases.find(p => p.PurchaseID === payload.PurchaseID);
        if (!po || po.Status === 'RECEIVED') return Promise.reject(new Error('Invalid or already received PO.'));
        const poItems = db.purchaseItems.filter(pi => pi.PurchaseID === po.PurchaseID);
        const grnNo = `GRN-2026-27-${String(db.goodsReceipts.length + 1).padStart(4, '0')}`;
        let accQtyTotal = 0, dmgQtyTotal = 0, accVal = 0;

        poItems.forEach(pi => {
          const input = (payload.items || []).find(x => x.PurchaseItemID === pi.PurchaseItemID) || { ReceivedQty: pi.OrderedQty, DamagedQty: 0 };
          const rec = r2(input.ReceivedQty);
          const dmg = r2(input.DamagedQty);
          const acc = Math.max(0, r2(rec - dmg));
          const val = r2(acc * pi.UnitCost * (1 + pi.GSTRate / 100));
          pi.ReceivedQty = rec;
          pi.DamagedQty = dmg;
          pi.LineTotal = val;
          accQtyTotal = r2(accQtyTotal + acc);
          dmgQtyTotal = r2(dmgQtyTotal + dmg);
          accVal = r2(accVal + val);

          if (acc > 0) {
            db.stockMovements.unshift({
              MovementID: 'MOV-' + Date.now() + '-' + pi.ProductID, Timestamp: now, ProductID: pi.ProductID,
              SKU: '', ProductName: pi.ProductName, MovementType: 'PURCHASE_RECEIPT', QtyChange: acc,
              ReferenceDocID: grnNo, ReferenceDocNo: grnNo, Reason: 'GRN for ' + po.PONumber,
              Location: 'STR-01', Operator: db.user.email
            });
          }
        });

        po.Status = 'RECEIVED';
        po.SupplierInvoiceNo = payload.SupplierInvoiceNo || po.SupplierInvoiceNo;
        po.GrandTotal = accVal;
        po.BalanceDue = r2(accVal - po.AmountPaid);

        db.goodsReceipts.unshift({
          GRNID: 'GRN-' + Date.now(), GRNNumber: grnNo, Date: today, PurchaseID: po.PurchaseID,
          PONumber: po.PONumber, SupplierID: po.SupplierID, SupplierInvoiceNo: po.SupplierInvoiceNo,
          ReceivedQtyTotal: accQtyTotal, DamagedQtyTotal: dmgQtyTotal, AcceptedValue: accVal,
          Notes: payload.Notes || '', Operator: db.user.email
        });

        const sup = db.suppliers.find(s => s.SupplierID === po.SupplierID);
        if (sup) sup.CachedBalance = r2(Number(sup.CachedBalance || 0) + accVal);

        recalcSandboxStock(db);
        saveSandboxDB(db);
        return Promise.resolve({ GRNNumber: grnNo, AcceptedValue: accVal });
      }

      case 'saveParty': {
        const isSup = payload.partyType === 'SUPPLIER';
        const list = isSup ? db.suppliers : db.customers;
        const idCol = isSup ? 'SupplierID' : 'CustomerID';
        if (payload[idCol]) {
          const idx = list.findIndex(x => x[idCol] === payload[idCol]);
          if (idx !== -1) list[idx] = { ...list[idx], ...payload };
        } else {
          const newId = (isSup ? 'SUP-' : 'CUS-') + String(list.length + 1).padStart(4, '0');
          const openBal = r2(payload.OpeningBalance || 0);
          list.push({ ...payload, [idCol]: newId, OpeningBalance: openBal, CachedBalance: openBal, Active: 'TRUE' });
        }
        saveSandboxDB(db);
        return Promise.resolve({ message: 'Saved.' });
      }

      case 'recordPayment': {
        const amt = r2(payload.Amount);
        if (amt <= 0) return Promise.reject(new Error('Amount must be positive.'));
        const payNo = `PAY-2026-27-${String(db.payments.length + 1).padStart(4, '0')}`;
        const payId = 'PAY-' + Date.now();
        let alloc = 0;

        if (payload.DocumentID) {
          if (payload.PartyType === 'CUSTOMER') {
            const inv = db.sales.find(s => s.InvoiceID === payload.DocumentID || s.InvoiceNo === payload.DocumentID);
            if (inv) {
              alloc = Math.min(amt, inv.BalanceDue);
              inv.AmountPaid = r2(inv.AmountPaid + alloc);
              inv.BalanceDue = r2(inv.GrandTotal - inv.AmountPaid);
              inv.PaymentStatus = inv.BalanceDue === 0 ? 'PAID' : 'PARTIAL';
              db.paymentAllocations.push({
                AllocationID: 'ALC-' + Date.now(), PaymentID: payId, Date: today,
                DocumentType: 'INVOICE', DocumentID: inv.InvoiceID, DocumentNo: inv.InvoiceNo, AllocatedAmount: alloc
              });
            }
          } else {
            const po = db.purchases.find(p => p.PurchaseID === payload.DocumentID || p.PONumber === payload.DocumentID);
            if (po) {
              alloc = Math.min(amt, po.BalanceDue);
              po.AmountPaid = r2(po.AmountPaid + alloc);
              po.BalanceDue = r2(po.GrandTotal - po.AmountPaid);
              db.paymentAllocations.push({
                AllocationID: 'ALC-' + Date.now(), PaymentID: payId, Date: today,
                DocumentType: 'PURCHASE', DocumentID: po.PurchaseID, DocumentNo: po.PONumber, AllocatedAmount: alloc
              });
            }
          }
        }

        db.payments.unshift({
          PaymentID: payId, PaymentNo: payNo, Date: payload.Date || today, PartyType: payload.PartyType,
          PartyID: payload.PartyID, PartyName: payload.PartyName,
          PaymentType: payload.PartyType === 'CUSTOMER' ? 'INCOMING' : 'OUTGOING',
          PaymentMethod: payload.PaymentMethod || 'CASH', Amount: amt, UnallocatedAmount: r2(amt - alloc),
          ReferenceNo: payload.ReferenceNo || '', Notes: payload.Notes || '', Operator: db.user.email
        });

        const list = payload.PartyType === 'CUSTOMER' ? db.customers : db.suppliers;
        const idCol = payload.PartyType === 'CUSTOMER' ? 'CustomerID' : 'SupplierID';
        const party = list.find(p => p[idCol] === payload.PartyID);
        if (party) party.CachedBalance = Math.max(0, r2(Number(party.CachedBalance || 0) - amt));

        saveSandboxDB(db);
        return Promise.resolve({ PaymentNo: payNo });
      }

      case 'recordExpense': {
        const expId = 'EXP-' + Date.now();
        db.expenses.unshift({
          ExpenseID: expId, Date: payload.Date || today, Category: payload.Category,
          Description: payload.Description, Amount: r2(payload.Amount),
          PaymentMethod: payload.PaymentMethod || 'CASH', Payee: payload.Payee || '',
          ReferenceNo: payload.ReferenceNo || '', IsInternalTransfer: payload.IsInternalTransfer || 'FALSE',
          Notes: payload.Notes || '', Operator: db.user.email
        });
        saveSandboxDB(db);
        return Promise.resolve({ ExpenseID: expId });
      }

      case 'saveSettings':
        db.settings = { ...db.settings, ...(payload.settings || {}) };
        saveSandboxDB(db);
        return Promise.resolve({ message: 'Settings updated.' });

      case 'reconcilePartyBalances':
        return Promise.resolve({ custUpdated: 0, supUpdated: 0 });

      default:
        return Promise.resolve({});
    }
  }

  return {
    request,
    getEndpointUrl,
    setEndpointUrl,
    getUserEmailHint,
    setUserEmailHint,
    isNativeAppsScript,
    generateIdempotencyKey
  };
})();