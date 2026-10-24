/**
 * FRONTEND-BACKEND TRANSPORT ADAPTER (api.js)
 * Configured for: Rang Creation By Ekta
 */

const ApiAdapter = (function () {
  const STORAGE_URL_KEY = 'RMS_GAS_WEBAPP_URL';
  const STORAGE_EMAIL_KEY = 'RMS_USER_EMAIL_HINT';
  const STORAGE_SANDBOX_KEY = 'RMS_LOCAL_SANDBOX_RANG_V1';

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

    return executeLocalSandbox(reqEnvelope);
  }

  function getSandboxDB() {
    const raw = localStorage.getItem(STORAGE_SANDBOX_KEY);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    const today = new Date().toISOString().slice(0, 10);
    const seed = {
      user: { email: 'owner@rangcreation.in', name: 'Store Owner (Admin)', role: 'ADMIN', storeId: 'STR-01' },
      settings: {
        SHOP_NAME: 'Rang Creation By Ekta',
        SHOP_ADDRESS: 'D-103/104, Meet Residency, Vadodara, Gujarat - 390019',
        SHOP_PHONE: '+91 9876543210',
        SHOP_GSTIN: '24AABCS1429B1Z1',
        FINANCIAL_YEAR: '2026-27',
        ALLOW_NEGATIVE_STOCK: 'FALSE',
        INVOICE_TERMS: 'Goods once sold will only be exchanged within 7 days with original bill.',
        AUTO_LOW_STOCK_EMAIL: 'FALSE',
        AUTO_DAILY_SALES_EMAIL: 'FALSE',
        AUTO_PAYMENT_REMINDERS: 'FALSE',
        AUTO_DAILY_BACKUP: 'FALSE',
        ALERT_RECIPIENT_EMAIL: 'owner@rangcreation.in',
        BACKUP_FOLDER_ID: ''
      },
      stores: [
        { StoreID: 'STR-01', StoreName: 'Rang Creation By Ekta - Main Studio', Address: 'D-103/104, Meet Residency, Vadodara', Phone: '+91 9876543210', GSTIN: '24AABCS1429B1Z1', StateCode: '24', Active: 'TRUE' }
      ],
      categories: [
        { CategoryID: 'CAT-01', CategoryName: 'Imitation Jewellery', Active: 'TRUE' },
        { CategoryID: 'CAT-02', CategoryName: 'Bangles & Kada', Active: 'TRUE' },
        { CategoryID: 'CAT-03', CategoryName: 'Hair Accessories', Active: 'TRUE' },
        { CategoryID: 'CAT-04', CategoryName: 'Gift Hampers', Active: 'TRUE' },
        { CategoryID: 'CAT-05', CategoryName: 'Bridal Sets & Packaging', Active: 'TRUE' }
      ],
      products: [
        { ProductID: 'PRD-0001', SKU: 'JWL-NK-01', Barcode: '8904001001011', Name: 'Kundan Pearl Bridal Choker Necklace Set', Category: 'Imitation Jewellery', Brand: 'Rang Creation', Unit: 'Set', PurchaseCost: 420, SellingPrice: 799, GSTRate: 3, HSN: '7117', OpeningStock: 15, MinStock: 5, CachedStock: 14, CurrentStock: 14, Active: 'TRUE', Description: 'Gold-plated Kundan choker with earrings & maang tikka' },
        { ProductID: 'PRD-0002', SKU: 'JWL-ER-02', Barcode: '8904001001028', Name: 'Oxidised Silver Dome Jhumka Earrings', Category: 'Imitation Jewellery', Brand: 'Rang Creation', Unit: 'Pair', PurchaseCost: 65, SellingPrice: 149, GSTRate: 3, HSN: '7117', OpeningStock: 40, MinStock: 10, CachedStock: 40, CurrentStock: 40, Active: 'TRUE', Description: 'Traditional oxidised German silver jhumkas' },
        { ProductID: 'PRD-0003', SKU: 'BNG-KD-01', Barcode: '8904002002017', Name: 'Velvet Silk Thread Kundan Bangle Set (24 Pcs)', Category: 'Bangles & Kada', Brand: 'Rang Creation', Unit: 'Set', PurchaseCost: 160, SellingPrice: 320, GSTRate: 3, HSN: '7117', OpeningStock: 25, MinStock: 8, CachedStock: 23, CurrentStock: 23, Active: 'TRUE', Description: 'Bridal Chuda & velvet bangle set Size 2.4 / 2.6' },
        { ProductID: 'PRD-0004', SKU: 'BNG-RJ-02', Barcode: '8904002002024', Name: 'Antique Gold Plated Rajwadi Kada Pair', Category: 'Bangles & Kada', Brand: 'Rang Creation', Unit: 'Pair', PurchaseCost: 190, SellingPrice: 380, GSTRate: 3, HSN: '7117', OpeningStock: 18, MinStock: 6, CachedStock: 18, CurrentStock: 18, Active: 'TRUE', Description: 'Screw-open Meenakari work Rajwadi Kada pair' },
        { ProductID: 'PRD-0005', SKU: 'HAR-CL-01', Barcode: '8904003003010', Name: 'Korean Matte Pastel Jumbo Hair Claw Clip', Category: 'Hair Accessories', Brand: 'GlamHair', Unit: 'Pcs', PurchaseCost: 28, SellingPrice: 69, GSTRate: 18, HSN: '9615', OpeningStock: 60, MinStock: 15, CachedStock: 60, CurrentStock: 60, Active: 'TRUE', Description: 'Non-slip Matte finish korean claw clips' },
        { ProductID: 'PRD-0006', SKU: 'GFT-HM-01', Barcode: '8904004004013', Name: 'Festive Luxury Jewellery & Accessories Gift Hamper', Category: 'Gift Hampers', Brand: 'Rang Creation', Unit: 'Hamper', PurchaseCost: 550, SellingPrice: 1099, GSTRate: 18, HSN: '4202', OpeningStock: 10, MinStock: 4, CachedStock: 10, CurrentStock: 10, Active: 'TRUE', Description: 'Curated box with AD pendant set + scrunchies + claw clip' }
      ],
      customers: [
        { CustomerID: 'CUS-0001', Name: 'Walk-in Customer', Phone: '0000000000', Email: '', Address: 'Counter Sale', GSTIN: '', CreditLimit: 0, OpeningBalance: 0, CachedBalance: 0, Notes: 'Default counter customer', Active: 'TRUE' },
        { CustomerID: 'CUS-0002', Name: 'Nehaben Shah', Phone: '9825011223', Email: 'neha.shah@example.com', Address: 'Waghodia Road, Vadodara', GSTIN: '', CreditLimit: 15000, OpeningBalance: 0, CachedBalance: 659.2, Notes: 'Regular Jewellery & Bangle Customer', Active: 'TRUE' },
        { CustomerID: 'CUS-0003', Name: 'Priya Bridal Studio', Phone: '9898044556', Email: 'priyabridal@example.com', Address: 'Alkapuri, Vadodara', GSTIN: '24AAACP1234F1Z5', CreditLimit: 25000, OpeningBalance: 0, CachedBalance: 0, Notes: 'Boutique & Bulk Hamper Account', Active: 'TRUE' }
      ],
      suppliers: [
        { SupplierID: 'SUP-0001', Name: 'Zaveri Bazaar Imitation Wholesalers', ContactPerson: 'Kiran Shah', Phone: '9824099887', Email: 'orders@zaveriwholesale.in', Address: 'Mandvi / Mumbai Wholesale Market', GSTIN: '24AABCG5566H1Z2', PaymentTerms: 'Net 15', OpeningBalance: 0, CachedBalance: 0, Notes: 'Kundan, AD Jewellery & Bangles supplier', Active: 'TRUE' },
        { SupplierID: 'SUP-0002', Name: 'Royal Hair & Hamper Packaging Co.', ContactPerson: 'Sureshbhai Patel', Phone: '9727033445', Email: 'royalpack@example.com', Address: 'GIDC, Vadodara', GSTIN: '24AAACF9876D1Z9', PaymentTerms: 'COD', OpeningBalance: 0, CachedBalance: 0, Notes: 'Hair accessories & gift hamper boxes', Active: 'TRUE' }
      ],
      sales: [
        { InvoiceID: 'INV-SEED-01', InvoiceNo: 'INV-2026-27-0001', Date: today, StoreID: 'STR-01', CustomerID: 'CUS-0001', CustomerName: 'Walk-in Customer', CustomerGSTIN: '', TaxType: 'INTRA', Subtotal: 799, DiscountTotal: 49, TaxableAmount: 750, CGST: 11.25, SGST: 11.25, IGST: 0, GrandTotal: 772.5, AmountPaid: 772.5, BalanceDue: 0, PaymentStatus: 'PAID', Status: 'COMPLETED', Notes: 'Counter bill with ₹49 Flat Discount', Operator: 'owner@rangcreation.in' },
        { InvoiceID: 'INV-SEED-02', InvoiceNo: 'INV-2026-27-0002', Date: today, StoreID: 'STR-01', CustomerID: 'CUS-0002', CustomerName: 'Nehaben Shah', CustomerGSTIN: '', TaxType: 'INTRA', Subtotal: 640, DiscountTotal: 0, TaxableAmount: 640, CGST: 9.6, SGST: 9.6, IGST: 0, GrandTotal: 659.2, AmountPaid: 0, BalanceDue: 659.2, PaymentStatus: 'UNPAID', Status: 'COMPLETED', Notes: 'Given on Credit (Udhaar)', Operator: 'owner@rangcreation.in' }
      ],
      saleItems: [
        { SaleItemID: 'INV-SEED-01-L1', InvoiceID: 'INV-SEED-01', InvoiceNo: 'INV-2026-27-0001', ProductID: 'PRD-0001', SKU: 'JWL-NK-01', ProductName: 'Kundan Pearl Bridal Choker Necklace Set', HSN: '7117', Quantity: 1, UnitPrice: 799, Discount: 49, TaxableValue: 750, GSTRate: 3, CGST: 11.25, SGST: 11.25, IGST: 0, LineTotal: 772.5, UnitCostSnapshot: 420 },
        { SaleItemID: 'INV-SEED-02-L1', InvoiceID: 'INV-SEED-02', InvoiceNo: 'INV-2026-27-0002', ProductID: 'PRD-0003', SKU: 'BNG-KD-01', ProductName: 'Velvet Silk Thread Kundan Bangle Set (24 Pcs)', HSN: '7117', Quantity: 2, UnitPrice: 320, Discount: 0, TaxableValue: 640, GSTRate: 3, CGST: 9.6, SGST: 9.6, IGST: 0, LineTotal: 659.2, UnitCostSnapshot: 160 }
      ],
      salesReturns: [],
      purchases: [],
      purchaseItems: [],
      goodsReceipts: [],
      payments: [
        { PaymentID: 'PAY-SEED-01', PaymentNo: 'PAY-2026-27-0001', Date: today, PartyType: 'CUSTOMER', PartyID: 'CUS-0001', PartyName: 'Walk-in Customer', PaymentType: 'INCOMING', PaymentMethod: 'UPI', Amount: 772.5, UnallocatedAmount: 0, ReferenceNo: 'UPI-918273', Notes: 'POS Bill INV-2026-27-0001', Operator: 'owner@rangcreation.in' }
      ],
      paymentAllocations: [
        { AllocationID: 'ALC-01', PaymentID: 'PAY-SEED-01', Date: today, DocumentType: 'INVOICE', DocumentID: 'INV-SEED-01', DocumentNo: 'INV-2026-27-0001', AllocatedAmount: 772.5 }
      ],
      expenses: [],
      stockMovements: [
        { MovementID: 'MOV-08', Timestamp: today + 'T11:15:00', ProductID: 'PRD-0003', SKU: 'BNG-KD-01', ProductName: 'Velvet Silk Thread Kundan Bangle Set (24 Pcs)', MovementType: 'SALE', QtyChange: -2, ReferenceDocID: 'INV-SEED-02', ReferenceDocNo: 'INV-2026-27-0002', Reason: 'POS Sale (Credit)', Location: 'STR-01', Operator: 'owner@rangcreation.in' },
        { MovementID: 'MOV-07', Timestamp: today + 'T10:30:00', ProductID: 'PRD-0001', SKU: 'JWL-NK-01', ProductName: 'Kundan Pearl Bridal Choker Necklace Set', MovementType: 'SALE', QtyChange: -1, ReferenceDocID: 'INV-SEED-01', ReferenceDocNo: 'INV-2026-27-0001', Reason: 'POS Sale', Location: 'STR-01', Operator: 'owner@rangcreation.in' },
        { MovementID: 'MOV-06', Timestamp: today + 'T09:00:00', ProductID: 'PRD-0006', SKU: 'GFT-HM-01', ProductName: 'Festive Luxury Jewellery & Accessories Gift Hamper', MovementType: 'OPENING_STOCK', QtyChange: 10, ReferenceDocID: 'PRD-0006', ReferenceDocNo: 'OPENING', Reason: 'Initial stock', Location: 'STR-01', Operator: 'SYSTEM' },
        { MovementID: 'MOV-05', Timestamp: today + 'T09:00:00', ProductID: 'PRD-0005', SKU: 'HAR-CL-01', ProductName: 'Korean Matte Pastel Jumbo Hair Claw Clip', MovementType: 'OPENING_STOCK', QtyChange: 60, ReferenceDocID: 'PRD-0005', ReferenceDocNo: 'OPENING', Reason: 'Initial stock', Location: 'STR-01', Operator: 'SYSTEM' },
        { MovementID: 'MOV-04', Timestamp: today + 'T09:00:00', ProductID: 'PRD-0004', SKU: 'BNG-RJ-02', ProductName: 'Antique Gold Plated Rajwadi Kada Pair', MovementType: 'OPENING_STOCK', QtyChange: 18, ReferenceDocID: 'PRD-0004', ReferenceDocNo: 'OPENING', Reason: 'Initial stock', Location: 'STR-01', Operator: 'SYSTEM' },
        { MovementID: 'MOV-03', Timestamp: today + 'T09:00:00', ProductID: 'PRD-0003', SKU: 'BNG-KD-01', ProductName: 'Velvet Silk Thread Kundan Bangle Set (24 Pcs)', MovementType: 'OPENING_STOCK', QtyChange: 25, ReferenceDocID: 'PRD-0003', ReferenceDocNo: 'OPENING', Reason: 'Initial stock', Location: 'STR-01', Operator: 'SYSTEM' },
        { MovementID: 'MOV-02', Timestamp: today + 'T09:00:00', ProductID: 'PRD-0002', SKU: 'JWL-ER-02', ProductName: 'Oxidised Silver Dome Jhumka Earrings', MovementType: 'OPENING_STOCK', QtyChange: 40, ReferenceDocID: 'PRD-0002', ReferenceDocNo: 'OPENING', Reason: 'Initial stock', Location: 'STR-01', Operator: 'SYSTEM' },
        { MovementID: 'MOV-01', Timestamp: today + 'T09:00:00', ProductID: 'PRD-0001', SKU: 'JWL-NK-01', ProductName: 'Kundan Pearl Bridal Choker Necklace Set', MovementType: 'OPENING_STOCK', QtyChange: 15, ReferenceDocID: 'PRD-0001', ReferenceDocNo: 'OPENING', Reason: 'Initial stock', Location: 'STR-01', Operator: 'SYSTEM' }
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
        return Promise.resolve({ message: 'Sandbox database reset and seeded for Rang Creation By Ekta.' });

      case 'saveProduct': {
        const sku = String(payload.SKU || '').trim().toUpperCase();
        if (!sku || !payload.Name) return Promise.reject(new Error('SKU and Product Name are required.'));
        const dup = db.products.find(p => p.SKU.toUpperCase() === sku && p.ProductID !== payload.ProductID);
        if (dup) return Promise.reject(new Error('Duplicate SKU: ' + sku + ' already exists.'));

        const catName = String(payload.Category || 'Imitation Jewellery').trim();
        if (catName && !db.categories.some(c => c.CategoryName.toLowerCase() === catName.toLowerCase())) {
          db.categories.push({ CategoryID: 'CAT-0' + (db.categories.length + 1), CategoryName: catName, Active: 'TRUE' });
        }

        if (payload.ProductID) {
          const idx = db.products.findIndex(p => p.ProductID === payload.ProductID);
          if (idx === -1) return Promise.reject(new Error('Product not found.'));
          db.products[idx] = {
            ...db.products[idx],
            SKU: sku,
            Barcode: payload.Barcode || '',
            Name: payload.Name,
            Category: catName,
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
            Category: catName,
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
            Category: r.Category || 'Imitation Jewellery', Brand: r.Brand || '', Unit: r.Unit || 'Pcs',
            PurchaseCost: r2(r.PurchaseCost), SellingPrice: r2(r.SellingPrice), GSTRate: r2(r.GSTRate !== undefined ? r.GSTRate : 3),
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

        let subtotal = 0, lineDiscountTotal = 0;
        const prelim = [];

        for (const item of items) {
          const prod = db.products.find(p => p.ProductID === item.ProductID);
          if (!prod) return Promise.reject(new Error('Product not found.'));
          const qty = r2(item.Quantity);
          if (!allowNeg && qty > prod.CurrentStock) {
            return Promise.reject(new Error(`Insufficient stock for ${prod.Name} (Available: ${prod.CurrentStock})`));
          }
          const price = r2(prod.SellingPrice);
          const gross = r2(qty * price);
          const lDisc = Math.min(gross, Math.max(0, r2(item.Discount || 0)));
          const netAfterLine = r2(gross - lDisc);
          subtotal = r2(subtotal + gross);
          lineDiscountTotal = r2(lineDiscountTotal + lDisc);
          prelim.push({ prod, qty, price, gross, lDisc, netAfterLine });
        }

        const baseAfterLine = Math.max(0, r2(subtotal - lineDiscountTotal));
        const invDiscType = String(payload.InvoiceDiscountType || 'FLAT').toUpperCase();
        const invDiscVal = Math.max(0, Number(payload.InvoiceDiscountValue || 0));
        const invDiscAmt = invDiscType === 'PERCENT'
          ? r2(baseAfterLine * (Math.min(100, invDiscVal) / 100))
          : Math.min(baseAfterLine, r2(invDiscVal));

        const discountTotal = r2(lineDiscountTotal + invDiscAmt);
        let taxableTotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0;
        const lines = [];

        prelim.forEach(pl => {
          const share = baseAfterLine > 0 ? r2(invDiscAmt * (pl.netAfterLine / baseAfterLine)) : 0;
          const totalDisc = r2(pl.lDisc + share);
          const taxable = Math.max(0, r2(pl.gross - totalDisc));
          const gst = r2(pl.prod.GSTRate || 0);
          const tax = r2(taxable * (gst / 100));
          let cgst = 0, sgst = 0, igst = 0;
          if (taxType === 'IGST') igst = tax;
          else { cgst = r2(tax / 2); sgst = r2(tax - cgst); }
          const lineTotal = r2(taxable + cgst + sgst + igst);

          taxableTotal = r2(taxableTotal + taxable);
          cgstTotal = r2(cgstTotal + cgst);
          sgstTotal = r2(sgstTotal + sgst);
          igstTotal = r2(igstTotal + igst);
          lines.push({ prod: pl.prod, qty: pl.qty, price: pl.price, disc: totalDisc, taxable, gst, cgst, sgst, igst, lineTotal });
        });

        const grandTotal = r2(taxableTotal + cgstTotal + sgstTotal + igstTotal);
        const paymentsInput = Array.isArray(payload.payments) && payload.payments.length > 0
          ? payload.payments
          : [{ method: payload.PaymentMethod || 'CASH', amount: grandTotal, reference: payload.ReferenceNo || '' }];

        const rawPaid = paymentsInput.reduce((s, p) => r2(s + r2(p.amount)), 0);
        const appliedPaid = Math.min(grandTotal, rawPaid);
        const balanceDue = r2(grandTotal - appliedPaid);

        if (balanceDue > 0 && customer.CustomerID === 'CUS-0001') {
          return Promise.reject(new Error('Walk-in Customer cannot take goods on Credit. Please select or add a customer.'));
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
          saveSandboxDB(db);
          return Promise.resolve({ id: payload[idCol], message: 'Saved.' });
        } else {
          const newId = (isSup ? 'SUP-' : 'CUS-') + String(list.length + 1).padStart(4, '0');
          const openBal = r2(payload.OpeningBalance || 0);
          list.push({ ...payload, [idCol]: newId, OpeningBalance: openBal, CachedBalance: openBal, Active: 'TRUE' });
          saveSandboxDB(db);
          return Promise.resolve({ id: newId, message: 'Saved.' });
        }
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

      case 'deleteProduct': {
        const pid = payload.ProductID;
        db.products = db.products.filter(p => p.ProductID !== pid);
        db.stockMovements = db.stockMovements.filter(m => m.ProductID !== pid);
        saveSandboxDB(db);
        return Promise.resolve({ message: 'Product deleted.' });
      }

      case 'deleteParty': {
        if (payload.id === 'CUS-0001') return Promise.reject(new Error('Cannot delete Walk-in Customer.'));
        if (payload.partyType === 'SUPPLIER') {
          db.suppliers = db.suppliers.filter(s => s.SupplierID !== payload.id);
        } else {
          db.customers = db.customers.filter(c => c.CustomerID !== payload.id);
        }
        saveSandboxDB(db);
        return Promise.resolve({ message: 'Deleted.' });
      }
      
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