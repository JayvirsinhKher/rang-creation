/**
 * RETAIL MANAGEMENT SYSTEM - MAIN APPLICATION CONTROLLER (app.js)
 * Configured for: Rang Creation By Ekta
 */

const AppState = {
  activeView: 'dashboard',
  bundle: null,
  posCart: [],
  posDrafts: JSON.parse(localStorage.getItem('RMS_POS_DRAFTS') || '[]'),
  posSplitPayments: [{ method: 'CASH', amount: 0, reference: '' }],
  posInvoiceDiscountType: 'FLAT', // 'FLAT' (₹) or 'PERCENT' (%)
  posInvoiceDiscountValue: 0,
  posCreditMode: 'FULL_PAY', // 'FULL_PAY', 'PARTIAL', or 'FULL_CREDIT'
  lastReportCSV: { filename: 'report.csv', content: '' },
  isSubmitting: false
};

/**
 * Formatting, XSS Escaping & Spreadsheet Formula-Injection Guard
 */
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function csvSafeCell(val) {
  let s = val === null || val === undefined ? '' : String(val);
  if (/^[=+\-@]/.test(s)) {
    s = "'" + s;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fmtINR(amount) {
  const num = Number(amount || 0);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(isoStr) {
  if (!isoStr) return '-';
  const s = String(isoStr).slice(0, 10);
  const parts = s.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return esc(isoStr);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isActiveRecord(val) {
  if (val === undefined || val === null || val === '') return true;
  const s = String(val).trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YES' || s === 'ACTIVE';
}

function showLoader(active) {
  const bar = document.getElementById('loading-bar');
  if (bar) bar.classList.toggle('active', Boolean(active));
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function openModal(title, bodyHtml) {
  const backdrop = document.getElementById('modal-backdrop');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  if (!backdrop || !titleEl || !bodyEl) return;
  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;
  backdrop.classList.add('open');
}

function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) backdrop.classList.remove('open');
}

/**
 * Application Initialization & Navigation
 */
document.addEventListener('DOMContentLoaded', () => {
  bindNavigation();
  refreshBundle();
});

function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      switchView(view);
      document.getElementById('sidebar')?.classList.remove('open');
    });
  });

  const toggleBtn = document.getElementById('menu-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('open');
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

async function refreshBundle() {
  showLoader(true);
  try {
    AppState.bundle = await ApiAdapter.request('getInitialBundle');
    updateTopbarStatus();
    renderActiveView();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}

function updateTopbarStatus() {
  if (!AppState.bundle) return;
  const shopEl = document.getElementById('topbar-shop-name');
  const modeEl = document.getElementById('topbar-conn-badge');
  if (shopEl) shopEl.textContent = AppState.bundle.settings.SHOP_NAME || 'Rang Creation By Ekta';
  if (modeEl) {
    if (ApiAdapter.isNativeAppsScript()) {
      modeEl.textContent = 'Google Sheets Live (HtmlService)';
      modeEl.className = 'badge badge-success';
    } else if (ApiAdapter.getEndpointUrl()) {
      modeEl.textContent = 'Google Sheets Live (Web App API)';
      modeEl.className = 'badge badge-success';
    } else {
      modeEl.textContent = 'Local Sandbox (Configure URL in Settings)';
      modeEl.className = 'badge badge-warning';
    }
  }
}

function switchView(viewName) {
  AppState.activeView = viewName;
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
  });
  renderActiveView();
}

function renderActiveView() {
  if (!AppState.bundle) return;
  const container = document.getElementById('view-container');
  switch (AppState.activeView) {
    case 'dashboard': renderDashboard(container); break;
    case 'products': renderProducts(container); break;
    case 'inventory': renderInventory(container); break;
    case 'pos': renderPOS(container); break;
    case 'invoices': renderInvoices(container); break;
    case 'purchases': renderPurchases(container); break;
    case 'customers': renderParties(container, 'CUSTOMER'); break;
    case 'suppliers': renderParties(container, 'SUPPLIER'); break;
    case 'expenses': renderExpenses(container); break;
    case 'payments': renderPayments(container); break;
    case 'reports': renderReports(container); break;
    case 'settings': renderSettings(container); break;
    default: renderDashboard(container);
  }
}

/**
 * 1. DASHBOARD MODULE
 */
function renderDashboard(container) {
  const b = AppState.bundle;
  const today = todayISO();
  const currentMonthPrefix = today.slice(0, 7);

  const validSales = b.sales.filter(s => s.Status !== 'CANCELLED');
  const todaySales = validSales.filter(s => String(s.Date) === today);
  const monthSales = validSales.filter(s => String(s.Date).startsWith(currentMonthPrefix));

  const todaySalesRev = todaySales.reduce((acc, s) => acc + Number(s.GrandTotal || 0), 0);
  const monthSalesRev = monthSales.reduce((acc, s) => acc + Number(s.GrandTotal || 0), 0);

  const lowStockProducts = b.products.filter(p => isActiveRecord(p.Active) && Number(p.CurrentStock) <= Number(p.MinStock));
  const stockValuation = b.products.reduce((acc, p) => acc + (Math.max(0, Number(p.CurrentStock || 0)) * Number(p.PurchaseCost || 0)), 0);

  const custReceivables = b.customers.reduce((acc, c) => acc + Number(c.CachedBalance || 0), 0);
  const supPayables = b.suppliers.reduce((acc, s) => acc + Number(s.CachedBalance || 0), 0);

  const todayExpenses = b.expenses
    .filter(e => String(e.Date) === today && String(e.IsInternalTransfer) !== 'TRUE')
    .reduce((acc, e) => acc + Number(e.Amount || 0), 0);

  const monthInvoiceIds = new Set(monthSales.map(s => s.InvoiceID));
  const monthItems = b.saleItems.filter(si => monthInvoiceIds.has(si.InvoiceID));
  const monthNetTaxableSales = monthSales.reduce((acc, s) => acc + Number(s.TaxableAmount || 0), 0);
  const monthCOGS = monthItems.reduce((acc, si) => acc + (Number(si.Quantity || 0) * Number(si.UnitCostSnapshot || 0)), 0);
  const monthReturnsTaxable = b.salesReturns
    .filter(sr => String(sr.Date).startsWith(currentMonthPrefix))
    .reduce((acc, sr) => acc + Number(sr.TaxableRefund || 0), 0);
  const estimatedGrossProfit = monthNetTaxableSales - monthReturnsTaxable - monthCOGS;

  container.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Today's Sales (${fmtDate(today)})</div>
        <div class="kpi-value">${fmtINR(todaySalesRev)}</div>
        <div class="kpi-sub">${todaySales.length} invoices today</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">This Month's Sales</div>
        <div class="kpi-value">${fmtINR(monthSalesRev)}</div>
        <div class="kpi-sub">${monthSales.length} total transactions</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Est. Gross Profit (Month)</div>
        <div class="kpi-value" style="color:var(--success)">${fmtINR(estimatedGrossProfit)}</div>
        <div class="kpi-sub">Excl. GST, less COGS &amp; returns</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Current Stock Valuation</div>
        <div class="kpi-value">${fmtINR(stockValuation)}</div>
        <div class="kpi-sub">${b.products.length} total items (${lowStockProducts.length} low stock)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Customer Credit (Udhaar)</div>
        <div class="kpi-value" style="color:var(--warning)">${fmtINR(custReceivables)}</div>
        <div class="kpi-sub">Pending customer dues</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Supplier Outstanding</div>
        <div class="kpi-value" style="color:var(--danger)">${fmtINR(supPayables)}</div>
        <div class="kpi-sub">Payables due to vendors</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Today's Expenses</div>
        <div class="kpi-value">${fmtINR(todayExpenses)}</div>
        <div class="kpi-sub">Excludes bank/cash transfers</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Quick Billing</div>
        <div style="margin-top:8px;">
          <button class="btn btn-primary" onclick="switchView('pos')" style="width:100%;">+ New Counter / Credit Bill</button>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Recent Sales Invoices</span>
          <button class="btn btn-secondary btn-sm" onclick="switchView('invoices')">View All / Collect Due</button>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr><th>Invoice No</th><th>Date</th><th>Customer</th><th>Total</th><th>Due</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${b.sales.slice(0, 6).map(s => `
                <tr>
                  <td><strong>${esc(s.InvoiceNo)}</strong></td>
                  <td>${fmtDate(s.Date)}</td>
                  <td>${esc(s.CustomerName)}</td>
                  <td>${fmtINR(s.GrandTotal)}</td>
                  <td style="color:${Number(s.BalanceDue) > 0 ? 'var(--danger)' : 'var(--text-muted)'};font-weight:600;">${fmtINR(s.BalanceDue)}</td>
                  <td><span class="badge ${s.PaymentStatus === 'PAID' ? 'badge-success' : s.PaymentStatus === 'PARTIAL' ? 'badge-warning' : 'badge-danger'}">${esc(s.PaymentStatus)}</span></td>
                </tr>
              `).join('') || '<tr><td colspan="6">No sales recorded yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Low-Stock Alerts (${lowStockProducts.length})</span>
          <button class="btn btn-secondary btn-sm" onclick="switchView('purchases')">Create PO</button>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr><th>SKU</th><th>Product</th><th>Current</th><th>Min Level</th></tr>
            </thead>
            <tbody>
              ${lowStockProducts.slice(0, 6).map(p => `
                <tr>
                  <td>${esc(p.SKU)}</td>
                  <td>${esc(p.Name)}</td>
                  <td><span class="badge badge-danger">${esc(p.CurrentStock)} ${esc(p.Unit)}</span></td>
                  <td>${esc(p.MinStock)} ${esc(p.Unit)}</td>
                </tr>
              `).join('') || '<tr><td colspan="4">All products are adequately stocked.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

/**
 * 2. PRODUCT MASTER MODULE
 */
function renderProducts(container) {
  const b = AppState.bundle;
  const categories = Array.from(new Set([
    'Imitation Jewellery', 'Bangles & Kada', 'Hair Accessories', 'Gift Hampers', 'Bridal Sets & Packaging',
    ...b.categories.map(c => c.CategoryName),
    ...b.products.map(p => p.Category)
  ])).filter(Boolean);

  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Product Master (${b.products.length} Items)</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <label class="btn btn-secondary btn-sm" style="margin:0;cursor:pointer;">
            Import CSV
            <input type="file" id="csv-import-input" accept=".csv" style="display:none;" onchange="handleProductCSVImport(event)">
          </label>
          <button class="btn btn-secondary btn-sm" onclick="exportProductsCSV()">Export CSV</button>
          <button class="btn btn-primary btn-sm" onclick="openProductModal()">+ Add Product</button>
        </div>
      </div>
      <div class="panel-body">
        <div class="form-grid" style="margin-bottom:16px;">
          <input type="text" id="prod-search" placeholder="Search by Name, SKU, or Barcode..." oninput="filterProductTable()">
          <select id="prod-cat-filter" onchange="filterProductTable()">
            <option value="">All Categories</option>
            ${categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
          </select>
          <select id="prod-status-filter" onchange="filterProductTable()">
            <option value="">All Status</option>
            <option value="TRUE">Active Only</option>
            <option value="FALSE">Inactive Only</option>
          </select>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>SKU / Barcode</th>
                <th>Item Name</th>
                <th>Category</th>
                <th>Cost</th>
                <th>Selling Price</th>
                <th>GST %</th>
                <th>Current Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="product-table-body"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  filterProductTable();
}

function filterProductTable() {
  const q = (document.getElementById('prod-search')?.value || '').toLowerCase();
  const cat = document.getElementById('prod-cat-filter')?.value || '';
  const status = document.getElementById('prod-status-filter')?.value || '';
  const tbody = document.getElementById('product-table-body');
  if (!tbody) return;

  const filtered = AppState.bundle.products.filter(p => {
    const activeBool = isActiveRecord(p.Active);
    const matchQ = !q ||
      String(p.Name).toLowerCase().includes(q) ||
      String(p.SKU).toLowerCase().includes(q) ||
      String(p.Barcode).toLowerCase().includes(q);
    const matchCat = !cat || p.Category === cat;
    const matchStatus = !status || (status === 'TRUE' ? activeBool : !activeBool);
    return matchQ && matchCat && matchStatus;
  });

  tbody.innerHTML = filtered.map(p => {
    const isLow = Number(p.CurrentStock) <= Number(p.MinStock);
    const activeBool = isActiveRecord(p.Active);
    return `
      <tr>
        <td><strong>${esc(p.SKU)}</strong><br><small style="color:var(--text-muted)">${esc(p.Barcode || '-')}</small></td>
        <td>${esc(p.Name)}<br><small style="color:var(--text-muted)">Brand: ${esc(p.Brand || '-')} | HSN: ${esc(p.HSN || '-')}</small></td>
        <td>${esc(p.Category)}</td>
        <td>${fmtINR(p.PurchaseCost)}</td>
        <td><strong>${fmtINR(p.SellingPrice)}</strong></td>
        <td>${esc(p.GSTRate)}%</td>
        <td>
          <span class="badge ${isLow ? 'badge-danger' : 'badge-success'}">
            ${esc(p.CurrentStock)} ${esc(p.Unit)}
          </span>
        </td>
        <td><span class="badge ${activeBool ? 'badge-info' : 'badge-warning'}">${activeBool ? 'Active' : 'Inactive'}</span></td>
        <td style="display:flex;gap:4px;">
          <button class="btn btn-secondary btn-sm" onclick="openProductModal('${esc(p.ProductID)}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProductUI('${esc(p.ProductID)}', '${esc(p.Name)}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="9">No matching products found.</td></tr>';
}

async function deleteProductUI(productId, productName) {
  if (!confirm(`Are you sure you want to delete "${productName}" (${productId})?`)) return;
  showLoader(true);
  try {
    const res = await ApiAdapter.request('deleteProduct', { ProductID: productId });
    showToast(res.message || 'Product deleted.');
    await refreshBundle();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}

function openProductModal(productId = '') {
  const p = AppState.bundle.products.find(x => x.ProductID === productId) || {};
  const isEdit = Boolean(productId);
  const cats = Array.from(new Set([
    'Imitation Jewellery', 'Bangles & Kada', 'Hair Accessories', 'Gift Hampers', 'Bridal Sets & Packaging',
    ...AppState.bundle.categories.map(c => c.CategoryName)
  ])).filter(Boolean);

  openModal(isEdit ? `Edit Product (${p.SKU})` : 'Add New Product', `
    <form id="product-form" onsubmit="submitProductForm(event)">
      <input type="hidden" name="ProductID" value="${esc(p.ProductID || '')}">
      <div class="form-grid">
        <div class="form-group">
          <label>SKU (Unique Code) *</label>
          <input type="text" name="SKU" required value="${esc(p.SKU || '')}" placeholder="e.g. JWL-NK-01">
        </div>
        <div class="form-group">
          <label>Barcode (EAN/UPC)</label>
          <input type="text" name="Barcode" value="${esc(p.Barcode || '')}" placeholder="8904...">
        </div>
        <div class="form-group">
          <label>Product Name *</label>
          <input type="text" name="Name" required value="${esc(p.Name || '')}" placeholder="e.g. Kundan Bridal Necklace Set">
        </div>
        <div class="form-group">
          <label>Category *</label>
          <select name="Category">
            ${cats.map(c => `<option value="${esc(c)}" ${p.Category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Brand / Collection</label>
          <input type="text" name="Brand" value="${esc(p.Brand || 'Rang Creation')}">
        </div>
        <div class="form-group">
          <label>Unit of Measurement</label>
          <select name="Unit">
            ${['Pcs', 'Pair', 'Set', 'Dozen', 'Hamper', 'Box', 'Pack'].map(u => `<option value="${u}" ${p.Unit === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Purchase Cost (₹) *</label>
          <input type="number" step="0.01" name="PurchaseCost" required value="${esc(p.PurchaseCost ?? 0)}">
        </div>
        <div class="form-group">
          <label>Selling Price (₹ Excl. GST) *</label>
          <input type="number" step="0.01" name="SellingPrice" required value="${esc(p.SellingPrice ?? 0)}">
        </div>
        <div class="form-group">
          <label>GST Rate (%)</label>
          <select name="GSTRate">
            ${[0, 3, 5, 12, 18, 28].map(g => `<option value="${g}" ${Number(p.GSTRate ?? 3) === g ? 'selected' : ''}>${g}%</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>HSN / SAC Code (7117 = Jewellery)</label>
          <input type="text" name="HSN" value="${esc(p.HSN || '7117')}">
        </div>
        ${!isEdit ? `
        <div class="form-group">
          <label>Opening Stock Quantity</label>
          <input type="number" step="1" name="OpeningStock" value="10">
        </div>` : ''}
        <div class="form-group">
          <label>Minimum Stock Alert Level</label>
          <input type="number" step="1" name="MinStock" value="${esc(p.MinStock ?? 5)}">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select name="Active">
            <option value="TRUE" ${isActiveRecord(p.Active) ? 'selected' : ''}>Active</option>
            <option value="FALSE" ${!isActiveRecord(p.Active) ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Description / Size / Polish Details</label>
        <textarea name="Description" rows="2">${esc(p.Description || '')}</textarea>
      </div>
      <div class="modal-footer" style="padding:12px 0 0 0;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Product</button>
      </div>
    </form>
  `);
}

async function submitProductForm(e) {
  e.preventDefault();
  if (AppState.isSubmitting) return;
  AppState.isSubmitting = true;
  showLoader(true);
  try {
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    await ApiAdapter.request('saveProduct', payload);
    closeModal();
    showToast('Product saved successfully.');
    await refreshBundle();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    AppState.isSubmitting = false;
    showLoader(false);
  }
}

function exportProductsCSV() {
  const headers = ['SKU', 'Barcode', 'Name', 'Category', 'Brand', 'Unit', 'PurchaseCost', 'SellingPrice', 'GSTRate', 'HSN', 'CurrentStock', 'MinStock'];
  const rows = AppState.bundle.products.map(p => headers.map(h => csvSafeCell(p[h])).join(','));
  downloadCSV('rang-creation-products.csv', [headers.join(','), ...rows].join('\n'));
}

async function handleProductCSVImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    showToast('CSV file is empty or missing rows.', 'error');
    return;
  }
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  const parsedRows = lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] || ''; });
    return obj;
  });

  showLoader(true);
  try {
    const res = await ApiAdapter.request('importProductsBatch', { rows: parsedRows });
    showToast(`Imported ${res.imported} products (${res.skipped} skipped).`);
    await refreshBundle();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}

/**
 * 3. INVENTORY & STOCK LEDGER MODULE
 */
function renderInventory(container) {
  const b = AppState.bundle;
  const totalVal = b.products.reduce((s, p) => s + (Math.max(0, Number(p.CurrentStock || 0)) * Number(p.PurchaseCost || 0)), 0);

  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Inventory Ledger &amp; Stock Control (Valuation: ${fmtINR(totalVal)})</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="triggerInventoryReconcile()">Reconcile Cached Stock</button>
          <button class="btn btn-primary btn-sm" onclick="openStockAdjustmentModal()">+ Manual Stock Adjustment</button>
        </div>
      </div>
      <div class="panel-body">
        <h4 style="margin-bottom:10px;">Auditable Stock Movements Ledger (StockMovements Sheet)</h4>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Movement ID</th>
                <th>Date / Time</th>
                <th>Product</th>
                <th>Type</th>
                <th>Qty Change</th>
                <th>Ref Document</th>
                <th>Reason / Notes</th>
                <th>Operator</th>
              </tr>
            </thead>
            <tbody>
              ${b.stockMovements.map(m => {
                const pos = Number(m.QtyChange) >= 0;
                return `
                  <tr>
                    <td><small>${esc(m.MovementID)}</small></td>
                    <td>${fmtDate(m.Timestamp)}</td>
                    <td><strong>${esc(m.ProductName)}</strong> <small>(${esc(m.SKU || m.ProductID)})</small></td>
                    <td><span class="badge ${pos ? 'badge-success' : 'badge-warning'}">${esc(m.MovementType)}</span></td>
                    <td style="font-weight:700;color:${pos ? 'var(--success)' : 'var(--danger)'}">${pos ? '+' : ''}${esc(m.QtyChange)}</td>
                    <td>${esc(m.ReferenceDocNo || m.ReferenceDocID)}</td>
                    <td>${esc(m.Reason)}</td>
                    <td><small>${esc(m.Operator)}</small></td>
                  </tr>
                `;
              }).join('') || '<tr><td colspan="8">No stock movements recorded.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function openStockAdjustmentModal() {
  const prods = AppState.bundle.products;
  openModal('Manual Stock Adjustment (Audited)', `
    <form onsubmit="submitStockAdjustment(event)">
      <div class="form-group">
        <label>Select Product *</label>
        <select name="ProductID" required>
          ${prods.map(p => `<option value="${esc(p.ProductID)}">${esc(p.Name)} (Current: ${p.CurrentStock} ${p.Unit})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Quantity Change (+ for addition, - for reduction/damage) *</label>
        <input type="number" step="1" name="QtyChange" required placeholder="e.g. -1 or +5">
      </div>
      <div class="form-group">
        <label>Reason for Adjustment *</label>
        <input type="text" name="Reason" required placeholder="e.g. Stone/polish damage or stock count update">
      </div>
      <div class="modal-footer" style="padding:12px 0 0 0;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Post Adjustment</button>
      </div>
    </form>
  `);
}

async function submitStockAdjustment(e) {
  e.preventDefault();
  showLoader(true);
  try {
    const payload = Object.fromEntries(new FormData(e.target).entries());
    await ApiAdapter.request('recordStockAdjustment', payload);
    closeModal();
    showToast('Stock adjustment posted to ledger.');
    await refreshBundle();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}

async function triggerInventoryReconcile() {
  if (!confirm('Reconcile all cached product stock balances against the StockMovements ledger?')) return;
  showLoader(true);
  try {
    const res = await ApiAdapter.request('reconcileInventory');
    showToast(`Reconciled ${res.totalProducts} products (${res.correctedCount} discrepancies fixed).`);
    await refreshBundle();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}

/**
 * 4. SALES & POINT OF SALE (POS) MODULE (With Flat/% Invoice Discount & Credit/Udhaar Mode)
 */
function renderPOS(container) {
  const b = AppState.bundle;
  container.innerHTML = `
    <div class="pos-layout">
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Jewellery, Bangles, Hair Accessories &amp; Hampers</span>
          <span class="badge badge-info">${AppState.posDrafts.length} Saved Drafts</span>
        </div>
        <div class="panel-body">
          <div style="display:flex;gap:8px;">
            <input type="text" id="pos-search-input" placeholder="Scan Barcode or type SKU / Item Name (Press Enter)..." style="flex:1;" oninput="renderPOSCatalog()" onkeydown="handlePOSBarcodeEnter(event)">
          </div>
          <div id="pos-catalog-grid" class="pos-product-grid"></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Current Counter Bill</span>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="savePOSDraft()">Hold Draft</button>
            <button class="btn btn-secondary btn-sm" onclick="openPOSDraftsModal()">Recall (${AppState.posDrafts.length})</button>
            <button class="btn btn-danger btn-sm" onclick="clearPOSCart()">Clear</button>
          </div>
        </div>
        <div class="panel-body">
          <div class="form-grid" style="margin-bottom:12px;">
            <div class="form-group">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <label>Customer (Select Customer for Credit)</label>
                <button type="button" class="btn btn-secondary btn-sm" style="padding:1px 6px;font-size:11px;" onclick="openQuickPOSCustomerModal()">+ New Customer</button>
              </div>
              <select id="pos-customer-select" onchange="renderPOSCart()">
                ${b.customers.map(c => `<option value="${esc(c.CustomerID)}">${esc(c.Name)} (${esc(c.Phone)})${Number(c.CachedBalance) > 0 ? ' — Due: ' + fmtINR(c.CachedBalance) : ''}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>GST Tax Mode</label>
              <select id="pos-tax-type" onchange="renderPOSCart()">
                <option value="INTRA">Intra-State (CGST + SGST)</option>
                <option value="IGST">Inter-State (IGST)</option>
              </select>
            </div>
          </div>

          <div class="table-responsive" style="max-height:240px;overflow-y:auto;margin-bottom:12px;">
            <table>
              <thead>
                <tr><th>Item</th><th>Qty</th><th>Price</th><th>Item Disc(₹)</th><th>Total</th><th></th></tr>
              </thead>
              <tbody id="pos-cart-tbody"></tbody>
            </table>
          </div>

          <!-- Invoice-Level Discount Bar (Flat ₹ or %) -->
          <div style="display:flex;gap:8px;align-items:center;background:#eff6ff;padding:8px 12px;border-radius:6px;border:1px solid #bfdbfe;margin-bottom:10px;">
            <label style="margin:0;flex:1;color:#1e40af;">Invoice-Level Discount:</label>
            <select id="pos-inv-disc-type" style="width:135px;padding:5px 8px;" onchange="updatePOSInvoiceDiscount()">
              <option value="FLAT" ${AppState.posInvoiceDiscountType === 'FLAT' ? 'selected' : ''}>Flat Amount (₹)</option>
              <option value="PERCENT" ${AppState.posInvoiceDiscountType === 'PERCENT' ? 'selected' : ''}>Percentage (%)</option>
            </select>
            <input type="number" id="pos-inv-disc-val" step="0.5" min="0" value="${esc(AppState.posInvoiceDiscountValue)}" style="width:95px;padding:5px 8px;" oninput="updatePOSInvoiceDiscount()">
          </div>

          <div id="pos-totals-box" style="background:#f8fafc;padding:12px;border-radius:6px;border:1px solid var(--border);margin-bottom:12px;"></div>

          <!-- Payment & Credit (Udhaar) Mode Selector -->
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap;">
              <label style="margin:0;">Settlement Mode:</label>
              <div style="display:flex;gap:4px;">
                <button type="button" class="btn btn-sm ${AppState.posCreditMode === 'FULL_PAY' ? 'btn-primary' : 'btn-secondary'}" onclick="setPOSCreditMode('FULL_PAY')">Full Payment</button>
                <button type="button" class="btn btn-sm ${AppState.posCreditMode === 'PARTIAL' ? 'btn-primary' : 'btn-secondary'}" onclick="setPOSCreditMode('PARTIAL')">Part Pay + Credit</button>
                <button type="button" class="btn btn-sm ${AppState.posCreditMode === 'FULL_CREDIT' ? 'btn-danger' : 'btn-secondary'}" onclick="setPOSCreditMode('FULL_CREDIT')">Full Credit (Udhaar)</button>
              </div>
            </div>
            <div id="pos-payments-container"></div>
          </div>

          <button id="pos-complete-btn" class="btn btn-success" style="width:100%;padding:12px;font-size:15px;" onclick="submitPOSSale()">
            Complete Sale &amp; Generate Invoice
          </button>
        </div>
      </div>
    </div>
  `;
  renderPOSCatalog();
  renderPOSCart();
}

function updatePOSInvoiceDiscount() {
  const typeEl = document.getElementById('pos-inv-disc-type');
  const valEl = document.getElementById('pos-inv-disc-val');
  AppState.posInvoiceDiscountType = typeEl ? typeEl.value : 'FLAT';
  AppState.posInvoiceDiscountValue = Math.max(0, Number(valEl ? valEl.value : 0));
  syncPOSDefaultPaymentAmount();
  renderPOSCart();
}

function setPOSCreditMode(mode) {
  const currentCust = document.getElementById('pos-customer-select')?.value || 'CUS-0001';
  AppState.posCreditMode = mode;
  const totals = calculatePOSCartTotals();
  if (mode === 'FULL_CREDIT') {
    AppState.posSplitPayments = [{ method: 'CASH', amount: 0, reference: 'ON CREDIT (UDHAAR)' }];
    if (currentCust === 'CUS-0001') {
      showToast('Select a registered customer or click "+ New Customer" for Credit/Udhaar bills.', 'warning');
    }
  } else if (mode === 'FULL_PAY') {
    AppState.posSplitPayments = [{ method: AppState.posSplitPayments[0]?.method || 'CASH', amount: totals.grandTotal, reference: '' }];
  }
  renderPOS(document.getElementById('view-container'));
  const sel = document.getElementById('pos-customer-select');
  if (sel) sel.value = currentCust;
}

function openQuickPOSCustomerModal() {
  openModal('Quick Add Customer for Credit / Billing', `
    <form onsubmit="submitQuickPOSCustomer(event)">
      <div class="form-grid">
        <div class="form-group">
          <label>Customer Name *</label>
          <input type="text" name="Name" required placeholder="e.g. Nehaben Shah">
        </div>
        <div class="form-group">
          <label>Mobile Number *</label>
          <input type="text" name="Phone" required placeholder="98250...">
        </div>
        <div class="form-group">
          <label>Credit Limit (₹)</label>
          <input type="number" name="CreditLimit" value="15000">
        </div>
        <div class="form-group">
          <label>Address / Area</label>
          <input type="text" name="Address" placeholder="Vadodara">
        </div>
      </div>
      <div class="modal-footer" style="padding:12px 0 0 0;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save &amp; Select Customer</button>
      </div>
    </form>
  `);
}

async function submitQuickPOSCustomer(e) {
  e.preventDefault();
  showLoader(true);
  try {
    const payload = { ...Object.fromEntries(new FormData(e.target).entries()), partyType: 'CUSTOMER' };
    const res = await ApiAdapter.request('saveParty', payload);
    closeModal();
    await refreshBundle();
    const sel = document.getElementById('pos-customer-select');
    if (sel && res && res.id) {
      sel.value = res.id;
    }
    showToast('Customer added and selected for billing.');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}

function renderPOSCatalog() {
  const q = (document.getElementById('pos-search-input')?.value || '').trim().toLowerCase();
  const grid = document.getElementById('pos-catalog-grid');
  if (!grid) return;

  const activeProds = AppState.bundle.products.filter(p => isActiveRecord(p.Active) && (
    !q ||
    String(p.Name).toLowerCase().includes(q) ||
    String(p.SKU).toLowerCase().includes(q) ||
    String(p.Barcode).toLowerCase().includes(q) ||
    String(p.Category).toLowerCase().includes(q)
  ));

  grid.innerHTML = activeProds.map(p => `
    <div class="pos-item-card" onclick="addProductToPOSCart('${esc(p.ProductID)}')">
      <div>
        <div style="font-size:11px;color:var(--text-muted);">${esc(p.SKU)} • ${esc(p.Category)}</div>
        <div style="font-weight:600;margin:4px 0;">${esc(p.Name)}</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
        <span style="font-weight:700;color:var(--primary);">${fmtINR(p.SellingPrice)}</span>
        <span class="badge ${Number(p.CurrentStock) > 0 ? 'badge-success' : 'badge-danger'}">${esc(p.CurrentStock)} ${esc(p.Unit)}</span>
      </div>
    </div>
  `).join('') || '<div style="grid-column:1/-1;color:var(--text-muted);">No matching products.</div>';
}

function handlePOSBarcodeEnter(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const q = e.target.value.trim().toLowerCase();
  if (!q) return;
  const match = AppState.bundle.products.find(p =>
    isActiveRecord(p.Active) && (String(p.Barcode).toLowerCase() === q || String(p.SKU).toLowerCase() === q)
  );
  if (match) {
    addProductToPOSCart(match.ProductID);
    e.target.value = '';
    renderPOSCatalog();
  }
}

function addProductToPOSCart(productId) {
  const prod = AppState.bundle.products.find(p => p.ProductID === productId);
  if (!prod) return;
  const allowNeg = AppState.bundle.settings.ALLOW_NEGATIVE_STOCK === 'TRUE';
  const existing = AppState.posCart.find(i => i.ProductID === productId);
  const newQty = (existing ? existing.Quantity : 0) + 1;

  if (!allowNeg && newQty > Number(prod.CurrentStock)) {
    showToast(`Insufficient stock for ${prod.Name} (${prod.CurrentStock} available).`, 'warning');
    return;
  }

  if (existing) {
    existing.Quantity = newQty;
  } else {
    AppState.posCart.push({
      ProductID: prod.ProductID,
      Name: prod.Name,
      SKU: prod.SKU,
      UnitPrice: Number(prod.SellingPrice),
      GSTRate: Number(prod.GSTRate || 0),
      Quantity: 1,
      Discount: 0
    });
  }
  syncPOSDefaultPaymentAmount();
  renderPOSCart();
}

function updatePOSCartItem(idx, field, val) {
  const item = AppState.posCart[idx];
  if (!item) return;
  const num = Number(val || 0);
  if (field === 'Quantity') {
    if (num <= 0) {
      AppState.posCart.splice(idx, 1);
    } else {
      item.Quantity = num;
    }
  } else if (field === 'Discount') {
    item.Discount = Math.max(0, num);
  }
  syncPOSDefaultPaymentAmount();
  renderPOSCart();
}

function removePOSCartItem(idx) {
  AppState.posCart.splice(idx, 1);
  syncPOSDefaultPaymentAmount();
  renderPOSCart();
}

function clearPOSCart() {
  AppState.posCart = [];
  AppState.posInvoiceDiscountValue = 0;
  AppState.posCreditMode = 'FULL_PAY';
  AppState.posSplitPayments = [{ method: 'CASH', amount: 0, reference: '' }];
  renderPOSCart();
}

function calculatePOSCartTotals() {
  const taxType = document.getElementById('pos-tax-type')?.value || 'INTRA';
  let subtotal = 0;
  let lineDiscountTotal = 0;

  const linesAfterLineDisc = AppState.posCart.map(item => {
    const gross = item.Quantity * item.UnitPrice;
    const lDisc = Math.min(gross, Math.max(0, Number(item.Discount || 0)));
    const netAfterLine = gross - lDisc;
    subtotal += gross;
    lineDiscountTotal += lDisc;
    return { ...item, gross, lDisc, netAfterLine };
  });

  const baseForInvDisc = Math.max(0, subtotal - lineDiscountTotal);
  let invDiscountAmount = 0;
  if (AppState.posInvoiceDiscountType === 'PERCENT') {
    const pct = Math.min(100, Math.max(0, Number(AppState.posInvoiceDiscountValue || 0)));
    invDiscountAmount = Math.round((baseForInvDisc * (pct / 100)) * 100) / 100;
  } else {
    invDiscountAmount = Math.min(baseForInvDisc, Math.max(0, Number(AppState.posInvoiceDiscountValue || 0)));
  }

  let taxableTotal = 0, cgst = 0, sgst = 0, igst = 0;
  linesAfterLineDisc.forEach(l => {
    const share = baseForInvDisc > 0 ? (invDiscountAmount * (l.netAfterLine / baseForInvDisc)) : 0;
    const taxable = Math.max(0, l.netAfterLine - share);
    const tax = taxable * (l.GSTRate / 100);
    taxableTotal += taxable;
    if (taxType === 'IGST') igst += tax;
    else { cgst += tax / 2; sgst += tax / 2; }
  });

  const discountTotal = Math.round((lineDiscountTotal + invDiscountAmount) * 100) / 100;
  const grandTotal = Math.round((taxableTotal + cgst + sgst + igst) * 100) / 100;
  return {
    subtotal,
    lineDiscountTotal,
    invDiscountAmount,
    discountTotal,
    taxableTotal,
    cgst,
    sgst,
    igst,
    grandTotal
  };
}

function syncPOSDefaultPaymentAmount() {
  const totals = calculatePOSCartTotals();
  if (AppState.posCreditMode === 'FULL_CREDIT') {
    AppState.posSplitPayments = [{ method: 'CASH', amount: 0, reference: 'ON CREDIT (UDHAAR)' }];
  } else if (AppState.posCreditMode === 'FULL_PAY' && AppState.posSplitPayments.length === 1) {
    AppState.posSplitPayments[0].amount = totals.grandTotal;
  }
}

function renderPOSCart() {
  const tbody = document.getElementById('pos-cart-tbody');
  const totalsBox = document.getElementById('pos-totals-box');
  const payBox = document.getElementById('pos-payments-container');
  if (!tbody || !totalsBox || !payBox) return;

  tbody.innerHTML = AppState.posCart.map((item, idx) => {
    const lineNet = Math.max(0, item.Quantity * item.UnitPrice - item.Discount) * (1 + item.GSTRate / 100);
    return `
      <tr>
        <td><strong>${esc(item.Name)}</strong><br><small>GST ${esc(item.GSTRate)}%</small></td>
        <td><input type="number" step="1" min="1" value="${esc(item.Quantity)}" style="width:60px;" onchange="updatePOSCartItem(${idx}, 'Quantity', this.value)"></td>
        <td>${fmtINR(item.UnitPrice)}</td>
        <td><input type="number" step="1" min="0" value="${esc(item.Discount)}" style="width:65px;" onchange="updatePOSCartItem(${idx}, 'Discount', this.value)"></td>
        <td><strong>${fmtINR(lineNet)}</strong></td>
        <td><button class="btn btn-danger btn-sm" onclick="removePOSCartItem(${idx})">×</button></td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Scan or click items to add to bill.</td></tr>';

  const t = calculatePOSCartTotals();
  const tendered = AppState.posSplitPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const balance = Math.max(0, Math.round((t.grandTotal - tendered) * 100) / 100);

  totalsBox.innerHTML = `
    <div style="display:flex;justify-content:space-between;"><span>Gross Subtotal:</span><span>${fmtINR(t.subtotal)}</span></div>
    <div style="display:flex;justify-content:space-between;color:var(--success);">
      <span>Total Discount (Items + Bill ${AppState.posInvoiceDiscountType === 'PERCENT' ? AppState.posInvoiceDiscountValue + '%' : 'Flat'}):</span>
      <span>-${fmtINR(t.discountTotal)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;"><span>Taxable Value:</span><span>${fmtINR(t.taxableTotal)}</span></div>
    ${t.igst > 0
      ? `<div style="display:flex;justify-content:space-between;"><span>IGST:</span><span>${fmtINR(t.igst)}</span></div>`
      : `<div style="display:flex;justify-content:space-between;"><span>CGST + SGST:</span><span>${fmtINR(t.cgst)} + ${fmtINR(t.sgst)}</span></div>`
    }
    <div style="display:flex;justify-content:space-between;font-size:17px;font-weight:700;border-top:1px solid var(--border);margin-top:6px;padding-top:6px;">
      <span>Grand Total:</span><span style="color:var(--primary)">${fmtINR(t.grandTotal)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;color:${balance > 0 ? 'var(--danger)' : 'var(--success)'};margin-top:4px;">
      <span>Paid Now: ${fmtINR(tendered)}</span>
      <span>Credit / Balance Due: ${fmtINR(balance)}</span>
    </div>
  `;

  if (AppState.posCreditMode === 'FULL_CREDIT') {
    payBox.innerHTML = `
      <div style="padding:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;color:#991b1b;font-size:13px;">
        <strong>Full Credit (Udhaar) Mode Active:</strong> ₹0 collected now. Full amount (${fmtINR(t.grandTotal)}) will be added to the selected customer's outstanding balance and tracked under Invoices &amp; Payments.
      </div>
    `;
  } else {
    payBox.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:6px;">
        <button type="button" class="btn btn-secondary btn-sm" onclick="addPOSSplitPaymentRow()">+ Split Payment Method</button>
      </div>
      ${AppState.posSplitPayments.map((p, idx) => `
        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <select onchange="AppState.posSplitPayments[${idx}].method=this.value" style="width:120px;">
            ${['CASH', 'UPI', 'CARD', 'BANK_TRANSFER'].map(m => `<option value="${m}" ${p.method === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
          <input type="number" step="0.01" value="${esc(p.amount)}" placeholder="Amount Paid" style="width:110px;" oninput="AppState.posSplitPayments[${idx}].amount=Number(this.value||0);AppState.posCreditMode='PARTIAL';renderPOSCart()">
          <input type="text" value="${esc(p.reference)}" placeholder="UPI/Card Ref" style="flex:1;" oninput="AppState.posSplitPayments[${idx}].reference=this.value">
          ${AppState.posSplitPayments.length > 1 ? `<button type="button" class="btn btn-secondary btn-sm" onclick="AppState.posSplitPayments.splice(${idx},1);renderPOSCart()">×</button>` : ''}
        </div>
      `).join('')}
    `;
  }
}

function addPOSSplitPaymentRow() {
  const t = calculatePOSCartTotals();
  const paidSoFar = AppState.posSplitPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const rem = Math.max(0, Math.round((t.grandTotal - paidSoFar) * 100) / 100);
  AppState.posSplitPayments.push({ method: 'UPI', amount: rem, reference: '' });
  renderPOSCart();
}

function savePOSDraft() {
  if (AppState.posCart.length === 0) {
    showToast('Cart is empty.', 'warning');
    return;
  }
  AppState.posDrafts.push({
    id: 'DRF-' + Date.now().toString().slice(-4),
    savedAt: new Date().toLocaleTimeString(),
    customerId: document.getElementById('pos-customer-select')?.value || 'CUS-0001',
    items: JSON.parse(JSON.stringify(AppState.posCart))
  });
  localStorage.setItem('RMS_POS_DRAFTS', JSON.stringify(AppState.posDrafts));
  clearPOSCart();
  showToast('Draft order saved.');
  renderPOS(document.getElementById('view-container'));
}

function openPOSDraftsModal() {
  if (AppState.posDrafts.length === 0) {
    showToast('No saved draft orders.', 'warning');
    return;
  }
  openModal('Saved POS Draft Orders', `
    <table>
      <thead><tr><th>Draft ID</th><th>Time</th><th>Items</th><th>Action</th></tr></thead>
      <tbody>
        ${AppState.posDrafts.map((d, i) => `
          <tr>
            <td>${esc(d.id)}</td>
            <td>${esc(d.savedAt)}</td>
            <td>${d.items.length} items</td>
            <td><button class="btn btn-primary btn-sm" onclick="recallPOSDraft(${i})">Recall to POS</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `);
}

function recallPOSDraft(idx) {
  const draft = AppState.posDrafts[idx];
  if (!draft) return;
  AppState.posCart = draft.items;
  AppState.posDrafts.splice(idx, 1);
  localStorage.setItem('RMS_POS_DRAFTS', JSON.stringify(AppState.posDrafts));
  syncPOSDefaultPaymentAmount();
  closeModal();
  renderPOS(document.getElementById('view-container'));
}

async function submitPOSSale() {
  if (AppState.posCart.length === 0 || AppState.isSubmitting) return;
  const customerId = document.getElementById('pos-customer-select')?.value || 'CUS-0001';
  const totals = calculatePOSCartTotals();
  const tendered = AppState.posSplitPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  if (totals.grandTotal - tendered > 0.01 && customerId === 'CUS-0001') {
    showToast('Walk-in Customer cannot take goods on Credit. Please select a customer or click "+ New Customer".', 'error');
    return;
  }

  AppState.isSubmitting = true;
  const btn = document.getElementById('pos-complete-btn');
  if (btn) btn.disabled = true;
  showLoader(true);

  const idempotencyKey = ApiAdapter.generateIdempotencyKey('SALE');
  try {
    const payload = {
      CustomerID: customerId,
      TaxType: document.getElementById('pos-tax-type')?.value || 'INTRA',
      InvoiceDiscountType: AppState.posInvoiceDiscountType,
      InvoiceDiscountValue: AppState.posInvoiceDiscountValue,
      items: AppState.posCart,
      payments: AppState.posSplitPayments
    };
    const res = await ApiAdapter.request('createSale', payload, idempotencyKey);
    clearPOSCart();
    await refreshBundle();
    openInvoicePrintModal(res.invoice.InvoiceID);
    showToast(`Sale completed! Invoice ${res.invoice.InvoiceNo} generated.`);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    AppState.isSubmitting = false;
    if (btn) btn.disabled = false;
    showLoader(false);
  }
}

/**
 * 5. SALES INVOICES, CREDIT TRACKING & PRINTABLE A4 / THERMAL RECEIPTS
 */
function renderInvoices(container) {
  const unpaidTotal = AppState.bundle.sales
    .filter(s => s.Status !== 'CANCELLED')
    .reduce((sum, s) => sum + Number(s.BalanceDue || 0), 0);

  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Sales Invoices &amp; Credit (Udhaar) Tracker — Total Pending: <span style="color:var(--danger)">${fmtINR(unpaidTotal)}</span></span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <input type="text" id="inv-search" placeholder="Search Invoice No or Customer..." oninput="filterInvoicesTable()" style="width:220px;">
          <select id="inv-status-filter" onchange="filterInvoicesTable()">
            <option value="">All Payment Statuses</option>
            <option value="CREDIT_DUE">Credit / Pending Due Only (Unpaid &amp; Partial)</option>
            <option value="UNPAID">Unpaid (Full Credit)</option>
            <option value="PARTIAL">Partially Paid</option>
            <option value="PAID">Fully Paid</option>
          </select>
        </div>
      </div>
      <div class="panel-body">
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Discount</th>
                <th>Taxable</th>
                <th>GST</th>
                <th>Grand Total</th>
                <th>Paid</th>
                <th>Balance Due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="invoices-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  filterInvoicesTable();
}

function filterInvoicesTable() {
  const q = (document.getElementById('inv-search')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('inv-status-filter')?.value || '';
  const tbody = document.getElementById('invoices-tbody');
  if (!tbody) return;

  const list = AppState.bundle.sales.filter(s => {
    const matchQ = !q || String(s.InvoiceNo).toLowerCase().includes(q) || String(s.CustomerName).toLowerCase().includes(q);
    const matchStatus = !statusFilter ||
      (statusFilter === 'CREDIT_DUE' ? Number(s.BalanceDue) > 0 : String(s.PaymentStatus) === statusFilter);
    return matchQ && matchStatus;
  });

  tbody.innerHTML = list.map(s => {
    const totalTax = Number(s.CGST || 0) + Number(s.SGST || 0) + Number(s.IGST || 0);
    return `
      <tr>
        <td><strong>${esc(s.InvoiceNo)}</strong></td>
        <td>${fmtDate(s.Date)}</td>
        <td>${esc(s.CustomerName)}</td>
        <td style="color:var(--success)">-${fmtINR(s.DiscountTotal || 0)}</td>
        <td>${fmtINR(s.TaxableAmount)}</td>
        <td>${fmtINR(totalTax)}</td>
        <td><strong>${fmtINR(s.GrandTotal)}</strong></td>
        <td>${fmtINR(s.AmountPaid)}</td>
        <td style="color:${Number(s.BalanceDue) > 0 ? 'var(--danger)' : 'var(--text-muted)'};font-weight:700;">${fmtINR(s.BalanceDue)}</td>
        <td><span class="badge ${s.PaymentStatus === 'PAID' ? 'badge-success' : s.PaymentStatus === 'PARTIAL' ? 'badge-warning' : 'badge-danger'}">${esc(s.PaymentStatus)}</span></td>
        <td style="display:flex;gap:4px;">
          <button class="btn btn-secondary btn-sm" onclick="openInvoicePrintModal('${esc(s.InvoiceID)}')">Print</button>
          ${Number(s.BalanceDue) > 0 ? `<button class="btn btn-primary btn-sm" onclick="openQuickInvoicePaymentModal('${esc(s.InvoiceID)}')">Collect Due</button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="openSalesReturnModal('${esc(s.InvoiceID)}')">Return</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="11">No invoices found.</td></tr>';
}

function openQuickInvoicePaymentModal(invoiceId) {
  const inv = AppState.bundle.sales.find(s => s.InvoiceID === invoiceId);
  if (!inv) return;
  openModal(`Collect Pending Credit (${inv.InvoiceNo})`, `
    <form onsubmit="submitPaymentForm(event)">
      <input type="hidden" name="PartyType" value="CUSTOMER">
      <input type="hidden" name="PartyID" value="${esc(inv.CustomerID)}">
      <input type="hidden" name="PartyName" value="${esc(inv.CustomerName)}">
      <input type="hidden" name="DocumentID" value="${esc(inv.InvoiceID)}">
      <div class="form-grid">
        <div class="form-group">
          <label>Customer</label>
          <input type="text" disabled value="${esc(inv.CustomerName)}">
        </div>
        <div class="form-group">
          <label>Pending Invoice Balance</label>
          <input type="text" disabled value="${fmtINR(inv.BalanceDue)}">
        </div>
        <div class="form-group">
          <label>Amount Received Now (₹) *</label>
          <input type="number" step="0.01" min="0.01" max="${esc(inv.BalanceDue)}" name="Amount" required value="${esc(inv.BalanceDue)}">
        </div>
        <div class="form-group">
          <label>Payment Method *</label>
          <select name="PaymentMethod">
            <option value="UPI">UPI</option>
            <option value="CASH">CASH</option>
            <option value="CARD">CARD</option>
            <option value="BANK_TRANSFER">BANK_TRANSFER</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Transaction Reference / Notes</label>
        <input type="text" name="ReferenceNo" placeholder="UPI Ref / Cash Receipt Note">
      </div>
      <div class="modal-footer" style="padding:12px 0 0 0;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Record Receipt &amp; Update Balance</button>
      </div>
    </form>
  `);
}

function openInvoicePrintModal(invoiceId) {
  const b = AppState.bundle;
  const inv = b.sales.find(s => s.InvoiceID === invoiceId);
  if (!inv) return;
  const items = b.saleItems.filter(si => si.InvoiceID === invoiceId);
  const st = b.settings;

  openModal(`Tax Invoice Preview (${inv.InvoiceNo})`, `
    <div id="invoice-preview-content" style="border:1px solid #cbd5e1;padding:20px;background:#fff;color:#000;">
      <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:12px;">
        <div>
          <h2 style="margin:0;font-size:18px;">${esc(st.SHOP_NAME)}</h2>
          <div>${esc(st.SHOP_ADDRESS)}</div>
          <div>Phone: ${esc(st.SHOP_PHONE)} | GSTIN: <strong>${esc(st.SHOP_GSTIN)}</strong></div>
        </div>
        <div style="text-align:right;">
          <h3 style="margin:0;color:#2563eb;">TAX INVOICE</h3>
          <div><strong>Invoice No:</strong> ${esc(inv.InvoiceNo)}</div>
          <div><strong>Date:</strong> ${fmtDate(inv.Date)}</div>
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <strong>Billed To:</strong> ${esc(inv.CustomerName)}
        ${inv.CustomerGSTIN ? ` | <strong>Customer GSTIN:</strong> ${esc(inv.CustomerGSTIN)}` : ''}
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="border:1px solid #cbd5e1;padding:6px;">#</th>
            <th style="border:1px solid #cbd5e1;padding:6px;">Description</th>
            <th style="border:1px solid #cbd5e1;padding:6px;">HSN</th>
            <th style="border:1px solid #cbd5e1;padding:6px;">Qty</th>
            <th style="border:1px solid #cbd5e1;padding:6px;">Rate</th>
            <th style="border:1px solid #cbd5e1;padding:6px;">Disc</th>
            <th style="border:1px solid #cbd5e1;padding:6px;">Taxable</th>
            <th style="border:1px solid #cbd5e1;padding:6px;">GST%</th>
            <th style="border:1px solid #cbd5e1;padding:6px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((it, idx) => `
            <tr>
              <td style="border:1px solid #cbd5e1;padding:6px;">${idx + 1}</td>
              <td style="border:1px solid #cbd5e1;padding:6px;">${esc(it.ProductName)}</td>
              <td style="border:1px solid #cbd5e1;padding:6px;">${esc(it.HSN || '-')}</td>
              <td style="border:1px solid #cbd5e1;padding:6px;">${esc(it.Quantity)}</td>
              <td style="border:1px solid #cbd5e1;padding:6px;">${fmtINR(it.UnitPrice)}</td>
              <td style="border:1px solid #cbd5e1;padding:6px;">${fmtINR(it.Discount)}</td>
              <td style="border:1px solid #cbd5e1;padding:6px;">${fmtINR(it.TaxableValue)}</td>
              <td style="border:1px solid #cbd5e1;padding:6px;">${esc(it.GSTRate)}%</td>
              <td style="border:1px solid #cbd5e1;padding:6px;"><strong>${fmtINR(it.LineTotal)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="max-width:55%;font-size:12px;">
          <strong>Terms &amp; Conditions:</strong><br>
          ${esc(st.INVOICE_TERMS)}
        </div>
        <div style="width:240px;">
          <div style="display:flex;justify-content:space-between;"><span>Gross Subtotal:</span><span>${fmtINR(inv.Subtotal || inv.TaxableAmount)}</span></div>
          ${Number(inv.DiscountTotal || 0) > 0 ? `<div style="display:flex;justify-content:space-between;color:#15803d;"><span>Total Discount:</span><span>-${fmtINR(inv.DiscountTotal)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;"><span>Taxable Value:</span><span>${fmtINR(inv.TaxableAmount)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span>CGST:</span><span>${fmtINR(inv.CGST)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span>SGST:</span><span>${fmtINR(inv.SGST)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span>IGST:</span><span>${fmtINR(inv.IGST)}</span></div>
          <div style="display:flex;justify-content:space-between;font-weight:700;font-size:15px;border-top:1px solid #000;margin-top:4px;padding-top:4px;">
            <span>Grand Total:</span><span>${fmtINR(inv.GrandTotal)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;"><span>Amount Paid:</span><span>${fmtINR(inv.AmountPaid)}</span></div>
          <div style="display:flex;justify-content:space-between;font-weight:700;"><span>Balance Due:</span><span>${fmtINR(inv.BalanceDue)}</span></div>
        </div>
      </div>
    </div>
    <div class="modal-footer" style="padding:14px 0 0 0;">
      <button class="btn btn-secondary" onclick="printInvoiceLayout('THERMAL')">Print Thermal (80mm)</button>
      <button class="btn btn-primary" onclick="printInvoiceLayout('A4')">Print A4 / Save PDF</button>
    </div>
  `);
}

function printInvoiceLayout(mode) {
  const source = document.getElementById('invoice-preview-content');
  const printArea = document.getElementById('printable-area');
  if (!source || !printArea) return;
  printArea.className = mode === 'THERMAL' ? 'thermal-receipt' : '';
  printArea.innerHTML = source.innerHTML;
  window.print();
}

function openSalesReturnModal(invoiceId) {
  const inv = AppState.bundle.sales.find(s => s.InvoiceID === invoiceId);
  const items = AppState.bundle.saleItems.filter(si => si.InvoiceID === invoiceId);
  if (!inv || items.length === 0) return;

  openModal(`Controlled Sales Return (${inv.InvoiceNo})`, `
    <form onsubmit="submitSalesReturn(event)">
      <input type="hidden" name="InvoiceID" value="${esc(inv.InvoiceID)}">
      <div class="form-group">
        <label>Select Sold Line Item *</label>
        <select name="ProductID" required>
          ${items.map(it => `<option value="${esc(it.ProductID)}">${esc(it.ProductName)} (Sold Qty: ${it.Quantity} @ ${fmtINR(it.UnitPrice)})</option>`).join('')}
        </select>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>Return Quantity *</label>
          <input type="number" step="1" min="1" name="Quantity" required value="1">
        </div>
        <div class="form-group">
          <label>Item Condition *</label>
          <select name="Condition">
            <option value="RESTOCK">Good - Restock to Inventory</option>
            <option value="DAMAGED">Damaged - Do Not Restock</option>
          </select>
        </div>
        <div class="form-group">
          <label>Refund Settlement *</label>
          <select name="RefundMethod">
            <option value="CASH">Cash Refund</option>
            <option value="UPI">UPI Refund</option>
            <option value="CREDIT_BALANCE">Adjust Customer Balance Due</option>
          </select>
        </div>
        <div class="form-group">
          <label>Reason for Return *</label>
          <input type="text" name="Reason" required placeholder="e.g. Size exchange or customer return">
        </div>
      </div>
      <div class="modal-footer" style="padding:12px 0 0 0;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-danger">Process Return Reversal</button>
      </div>
    </form>
  `);
}

async function submitSalesReturn(e) {
  e.preventDefault();
  showLoader(true);
  try {
    const payload = Object.fromEntries(new FormData(e.target).entries());
    const res = await ApiAdapter.request('processSalesReturn', payload);
    closeModal();
    showToast(`Return ${res.ReturnNo} recorded. Refund: ${fmtINR(res.TotalRefund)}`);
    await refreshBundle();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}

/**
 * 6. PURCHASES & GOODS RECEIPTS (GRN) MODULE
 */
function renderPurchases(container) {
  const b = AppState.bundle;
  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Purchase Orders &amp; Goods Receipts (GRN)</span>
        <button class="btn btn-primary btn-sm" onclick="openCreatePOModal()">+ Create Purchase Order</button>
      </div>
      <div class="panel-body">
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>Supplier Bill Ref</th>
                <th>Total Value</th>
                <th>Paid</th>
                <th>Balance Due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${b.purchases.map(p => `
                <tr>
                  <td><strong>${esc(p.PONumber)}</strong></td>
                  <td>${fmtDate(p.Date)}</td>
                  <td>${esc(p.SupplierName)}</td>
                  <td>${esc(p.SupplierInvoiceNo || '-')}</td>
                  <td>${fmtINR(p.GrandTotal)}</td>
                  <td>${fmtINR(p.AmountPaid)}</td>
                  <td style="font-weight:600;color:${Number(p.BalanceDue) > 0 ? 'var(--danger)' : 'var(--text-muted)'}">${fmtINR(p.BalanceDue)}</td>
                  <td><span class="badge ${p.Status === 'RECEIVED' ? 'badge-success' : 'badge-warning'}">${esc(p.Status)}</span></td>
                  <td>
                    ${p.Status === 'ORDERED'
                      ? `<button class="btn btn-success btn-sm" onclick="openReceiveGoodsModal('${esc(p.PurchaseID)}')">Receive Stock (GRN)</button>`
                      : `<span class="badge badge-info">Stock Posted</span>`
                    }
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="9">No purchase orders created yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function openCreatePOModal() {
  const b = AppState.bundle;
  openModal('Create Purchase Order', `
    <form onsubmit="submitPurchaseOrder(event)">
      <div class="form-grid">
        <div class="form-group">
          <label>Select Supplier *</label>
          <select name="SupplierID" required>
            ${b.suppliers.map(s => `<option value="${esc(s.SupplierID)}">${esc(s.Name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Supplier Invoice / Ref (Optional)</label>
          <input type="text" name="SupplierInvoiceNo" placeholder="e.g. INV/2026/991">
        </div>
        <div class="form-group">
          <label>Product to Order *</label>
          <select name="ProductID" required onchange="const p=AppState.bundle.products.find(x=>x.ProductID===this.value);if(p)this.form.UnitCost.value=p.PurchaseCost;">
            ${b.products.map(p => `<option value="${esc(p.ProductID)}">${esc(p.Name)} (Stock: ${p.CurrentStock})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Order Quantity *</label>
          <input type="number" step="1" min="1" name="OrderedQty" required value="10">
        </div>
        <div class="form-group">
          <label>Expected Unit Cost (₹ Excl. GST) *</label>
          <input type="number" step="0.01" name="UnitCost" required value="${esc(b.products[0]?.PurchaseCost || 100)}">
        </div>
      </div>
      <div class="modal-footer" style="padding:12px 0 0 0;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Purchase Order</button>
      </div>
    </form>
  `);
}

async function submitPurchaseOrder(e) {
  e.preventDefault();
  showLoader(true);
  try {
    const fd = Object.fromEntries(new FormData(e.target).entries());
    const payload = {
      SupplierID: fd.SupplierID,
      SupplierInvoiceNo: fd.SupplierInvoiceNo,
      items: [{
        ProductID: fd.ProductID,
        OrderedQty: Number(fd.OrderedQty),
        UnitCost: Number(fd.UnitCost)
      }]
    };
    const res = await ApiAdapter.request('createPurchaseOrder', payload);
    closeModal();
    showToast(`Purchase Order ${res.PONumber} created.`);
    await refreshBundle();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}

function openReceiveGoodsModal(purchaseId) {
  const po = AppState.bundle.purchases.find(p => p.PurchaseID === purchaseId);
  const items = AppState.bundle.purchaseItems.filter(pi => pi.PurchaseID === purchaseId);
  if (!po) return;

  openModal(`Receive Goods (GRN) against ${po.PONumber}`, `
    <form onsubmit="submitReceiveGoods(event, '${esc(purchaseId)}')">
      <div class="form-group">
        <label>Supplier Bill / Challan Number *</label>
        <input type="text" name="SupplierInvoiceNo" required value="${esc(po.SupplierInvoiceNo || '')}" placeholder="Enter supplier invoice reference">
      </div>
      <table>
        <thead><tr><th>Product</th><th>Ordered</th><th>Received Qty</th><th>Damaged Qty</th></tr></thead>
        <tbody>
          ${items.map(it => `
            <tr>
              <td>${esc(it.ProductName)}</td>
              <td>${esc(it.OrderedQty)}</td>
              <td><input type="number" step="1" min="0" name="rec_${esc(it.PurchaseItemID)}" value="${esc(it.OrderedQty)}" style="width:80px;"></td>
              <td><input type="number" step="1" min="0" name="dmg_${esc(it.PurchaseItemID)}" value="0" style="width:80px;"></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p style="font-size:12px;color:var(--text-muted);margin-top:8px;">Note: Inventory stock is updated strictly for Accepted Qty (Received minus Damaged).</p>
      <div class="modal-footer" style="padding:12px 0 0 0;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-success">Post Goods Receipt &amp; Update Stock</button>
      </div>
    </form>
  `);
}

async function submitReceiveGoods(e, purchaseId) {
  e.preventDefault();
  showLoader(true);
  try {
    const fd = new FormData(e.target);
    const poItems = AppState.bundle.purchaseItems.filter(pi => pi.PurchaseID === purchaseId);
    const items = poItems.map(pi => ({
      PurchaseItemID: pi.PurchaseItemID,
      ReceivedQty: Number(fd.get('rec_' + pi.PurchaseItemID) || 0),
      DamagedQty: Number(fd.get('dmg_' + pi.PurchaseItemID) || 0)
    }));
    const res = await ApiAdapter.request('receiveGoods', {
      PurchaseID: purchaseId,
      SupplierInvoiceNo: fd.get('SupplierInvoiceNo'),
      items
    });
    closeModal();
    showToast(`GRN ${res.GRNNumber} posted! Stock updated.`);
    await refreshBundle();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}

/**
 * 7 & 8. CUSTOMERS AND SUPPLIERS MODULE
 */
function renderParties(container, partyType) {
  const isSup = partyType === 'SUPPLIER';
  const list = isSup ? AppState.bundle.suppliers : AppState.bundle.customers;
  const idField = isSup ? 'SupplierID' : 'CustomerID';

  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">${isSup ? 'Suppliers &amp; Vendors' : 'Customers Directory'} (${list.length})</span>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="exportPartiesCSV('${partyType}')">Export CSV</button>
          <button class="btn btn-secondary btn-sm" onclick="reconcilePartiesUI()">Reconcile Balances</button>
          <button class="btn btn-primary btn-sm" onclick="openPartyModal('${partyType}')">+ Add ${isSup ? 'Supplier' : 'Customer'}</button>
        </div>
      </div>
      <div class="panel-body">
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>GSTIN</th>
                <th>${isSup ? 'Payment Terms' : 'Credit Limit'}</th>
                <th>Outstanding Balance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${list.map(p => `
                <tr>
                  <td><strong>${esc(p[idField])}</strong></td>
                  <td>${esc(p.Name)}<br><small style="color:var(--text-muted)">${esc(p.Address || '')}</small></td>
                  <td>${esc(p.Phone)}</td>
                  <td>${esc(p.GSTIN || '-')}</td>
                  <td>${isSup ? esc(p.PaymentTerms || 'Net 15') : fmtINR(p.CreditLimit)}</td>
                  <td style="font-weight:700;color:${Number(p.CachedBalance) > 0 ? 'var(--danger)' : 'var(--success)'}">
                    ${fmtINR(p.CachedBalance)}
                  </td>
                  <td style="display:flex;gap:4px;">
                    <button class="btn btn-secondary btn-sm" onclick="openPartyModal('${partyType}', '${esc(p[idField])}')">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deletePartyUI('${partyType}', '${esc(p[idField])}', '${esc(p.Name)}')">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function exportPartiesCSV(partyType) {
  const isSup = partyType === 'SUPPLIER';
  const list = isSup ? AppState.bundle.suppliers : AppState.bundle.customers;
  const headers = isSup
    ? ['SupplierID', 'Name', 'ContactPerson', 'Phone', 'Email', 'GSTIN', 'PaymentTerms', 'CachedBalance']
    : ['CustomerID', 'Name', 'Phone', 'Email', 'GSTIN', 'CreditLimit', 'CachedBalance'];
  const rows = list.map(item => headers.map(h => csvSafeCell(item[h])).join(','));
  downloadCSV(`${partyType.toLowerCase()}s.csv`, [headers.join(','), ...rows].join('\n'));
}

function openPartyModal(partyType, id = '') {
  const isSup = partyType === 'SUPPLIER';
  const list = isSup ? AppState.bundle.suppliers : AppState.bundle.customers;
  const idField = isSup ? 'SupplierID' : 'CustomerID';
  const p = list.find(x => x[idField] === id) || {};

  openModal(`${id ? 'Edit' : 'Add'} ${isSup ? 'Supplier' : 'Customer'}`, `
    <form onsubmit="submitPartyForm(event, '${partyType}')">
      <input type="hidden" name="${idField}" value="${esc(p[idField] || '')}">
      <div class="form-grid">
        <div class="form-group">
          <label>Full Name / Business Name *</label>
          <input type="text" name="Name" required value="${esc(p.Name || '')}">
        </div>
        <div class="form-group">
          <label>Phone Number *</label>
          <input type="text" name="Phone" required value="${esc(p.Phone || '')}">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="Email" value="${esc(p.Email || '')}">
        </div>
        <div class="form-group">
          <label>GSTIN</label>
          <input type="text" name="GSTIN" value="${esc(p.GSTIN || '')}">
        </div>
        ${isSup ? `
          <div class="form-group">
            <label>Contact Person</label>
            <input type="text" name="ContactPerson" value="${esc(p.ContactPerson || '')}">
          </div>
          <div class="form-group">
            <label>Payment Terms</label>
            <input type="text" name="PaymentTerms" value="${esc(p.PaymentTerms || 'Net 15')}">
          </div>
        ` : `
          <div class="form-group">
            <label>Credit Limit (₹)</label>
            <input type="number" name="CreditLimit" value="${esc(p.CreditLimit ?? 15000)}">
          </div>
        `}
        ${!id ? `
          <div class="form-group">
            <label>Verified Opening Balance (₹)</label>
            <input type="number" step="0.01" name="OpeningBalance" value="0">
          </div>
        ` : ''}
      </div>
      <div class="form-group">
        <label>Address</label>
        <input type="text" name="Address" value="${esc(p.Address || '')}">
      </div>
      <div class="modal-footer" style="padding:12px 0 0 0;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Record</button>
      </div>
    </form>
  `);
}

async function submitPartyForm(e, partyType) {
  e.preventDefault();
  showLoader(true);
  try {
    const payload = { ...Object.fromEntries(new FormData(e.target).entries()), partyType };
    await ApiAdapter.request('saveParty', payload);
    closeModal();
    showToast('Record saved.');
    await refreshBundle();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}

async function reconcilePartiesUI() {
  showLoader(true);
  try {
    await ApiAdapter.request('reconcilePartyBalances');
    showToast('Customer and Supplier balances reconciled with open invoices/bills.');
    await refreshBundle();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}

/**
 * 9. EXPENSES MODULE
 */
function renderExpenses(container) {
  const b = AppState.bundle;
  const totalOperatingExpenses = b.expenses
    .filter(e => String(e.IsInternalTransfer) !== 'TRUE')
    .reduce((acc, e) => acc + Number(e.Amount || 0), 0);

  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Store Expenses &amp; Cash/Bank Transfers (Operating Total: ${fmtINR(totalOperatingExpenses)})</span>
        <button class="btn btn-primary btn-sm" onclick="openExpenseModal()">+ Record Expense / Contra Transfer</button>
      </div>
      <div class="panel-body">
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Expense ID</th>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Payee</th>
                <th>Method</th>
                <th>Type</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${b.expenses.map(e => {
                const isContra = String(e.IsInternalTransfer) === 'TRUE';
                return `
                  <tr>
                    <td><strong>${esc(e.ExpenseID)}</strong></td>
                    <td>${fmtDate(e.Date)}</td>
                    <td>${esc(e.Category)}</td>
                    <td>${esc(e.Description)}</td>
                    <td>${esc(e.Payee || '-')}</td>
                    <td>${esc(e.PaymentMethod)}</td>
                    <td>
                      <span class="badge ${isContra ? 'badge-info' : 'badge-warning'}">
                        ${isContra ? 'Internal Transfer (Excluded from P&L)' : 'Operating Expense'}
                      </span>
                    </td>
                    <td><strong>${fmtINR(e.Amount)}</strong></td>
                  </tr>
                `;
              }).join('') || '<tr><td colspan="8">No expenses recorded yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function openExpenseModal() {
  openModal('Record Store Expense or Internal Cash/Bank Transfer', `
    <form onsubmit="submitExpenseForm(event)">
      <div class="form-grid">
        <div class="form-group">
          <label>Date *</label>
          <input type="date" name="Date" required value="${todayISO()}">
        </div>
        <div class="form-group">
          <label>Category *</label>
          <select name="Category" onchange="this.form.IsInternalTransfer.value=(this.value==='Internal Cash/Bank Transfer'?'TRUE':'FALSE')">
            <option value="Hamper Boxes, Ribbons & Packaging">Hamper Boxes, Ribbons &amp; Packaging</option>
            <option value="Utilities & Electricity">Utilities &amp; Electricity</option>
            <option value="Shop Rent">Shop Rent</option>
            <option value="Staff Salaries & Wages">Staff Salaries &amp; Wages</option>
            <option value="Courier & Delivery Charges">Courier &amp; Delivery Charges</option>
            <option value="Marketing & Exhibition Stall">Marketing &amp; Exhibition Stall</option>
            <option value="Internal Cash/Bank Transfer">Internal Cash/Bank Transfer (Contra)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Amount (₹) *</label>
          <input type="number" step="0.01" min="0.01" name="Amount" required>
        </div>
        <div class="form-group">
          <label>Payment Method *</label>
          <select name="PaymentMethod">
            <option value="CASH">CASH</option>
            <option value="UPI">UPI</option>
            <option value="BANK_TRANSFER">BANK_TRANSFER</option>
            <option value="CARD">CARD</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Description / Particulars *</label>
        <input type="text" name="Description" required placeholder="e.g. Velvet jewellery boxes & gift hamper baskets">
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>Payee / Vendor</label>
          <input type="text" name="Payee" placeholder="Optional payee name">
        </div>
        <div class="form-group">
          <label>Voucher / Bill Ref No</label>
          <input type="text" name="ReferenceNo">
        </div>
        <div class="form-group">
          <label>Count as Internal Contra Transfer?</label>
          <select name="IsInternalTransfer">
            <option value="FALSE">No — Operating Business Expense</option>
            <option value="TRUE">Yes — Internal Cash/Bank Transfer (Excluded from P&amp;L)</option>
          </select>
        </div>
      </div>
      <div class="modal-footer" style="padding:12px 0 0 0;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Entry</button>
      </div>
    </form>
  `);
}

async function submitExpenseForm(e) {
  e.preventDefault();
  showLoader(true);
  try {
    const payload = Object.fromEntries(new FormData(e.target).entries());
    await ApiAdapter.request('recordExpense', payload);
    closeModal();
    showToast('Expense entry recorded.');
    await refreshBundle();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}

/**
 * 10. PAYMENTS & ALLOCATIONS MODULE
 */
function renderPayments(container) {
  const b = AppState.bundle;
  container.innerHTML = `
    <div class="grid-2">
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Payments Register (Inward &amp; Outward)</span>
          <button class="btn btn-primary btn-sm" onclick="openPaymentModal()">+ Record Payment</button>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Payment No</th>
                <th>Date</th>
                <th>Party</th>
                <th>Type</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Ref</th>
              </tr>
            </thead>
            <tbody>
              ${b.payments.map(p => `
                <tr>
                  <td><strong>${esc(p.PaymentNo)}</strong></td>
                  <td>${fmtDate(p.Date)}</td>
                  <td>${esc(p.PartyName)}<br><small style="color:var(--text-muted)">${esc(p.PartyType)}</small></td>
                  <td><span class="badge ${p.PaymentType === 'INCOMING' ? 'badge-success' : 'badge-warning'}">${esc(p.PaymentType)}</span></td>
                  <td>${esc(p.PaymentMethod)}</td>
                  <td><strong>${fmtINR(p.Amount)}</strong></td>
                  <td><small>${esc(p.ReferenceNo || '-')}</small></td>
                </tr>
              `).join('') || '<tr><td colspan="7">No payments recorded.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Document Payment Allocations</span>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Allocation ID</th>
                <th>Date</th>
                <th>Doc Type</th>
                <th>Document No</th>
                <th>Allocated Amount</th>
              </tr>
            </thead>
            <tbody>
              ${(b.paymentAllocations || []).map(a => `
                <tr>
                  <td><small>${esc(a.AllocationID)}</small></td>
                  <td>${fmtDate(a.Date)}</td>
                  <td><span class="badge badge-info">${esc(a.DocumentType)}</span></td>
                  <td><strong>${esc(a.DocumentNo)}</strong></td>
                  <td><strong>${fmtINR(a.AllocatedAmount)}</strong></td>
                </tr>
              `).join('') || '<tr><td colspan="5">No payment allocations recorded.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function openPaymentModal() {
  const b = AppState.bundle;
  openModal('Record Customer Receipt or Supplier Payment', `
    <form onsubmit="submitPaymentForm(event)">
      <div class="form-grid">
        <div class="form-group">
          <label>Party Type *</label>
          <select name="PartyType" id="pmt-party-type" onchange="togglePaymentPartySelect()">
            <option value="CUSTOMER">Customer Receipt (Inward)</option>
            <option value="SUPPLIER">Supplier Payment (Outward)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Select Party *</label>
          <select name="PartyID" id="pmt-party-id" required onchange="syncPaymentPartyName(this)">
            ${b.customers.map(c => `<option value="${esc(c.CustomerID)}" data-name="${esc(c.Name)}">${esc(c.Name)} (Due: ${fmtINR(c.CachedBalance)})</option>`).join('')}
          </select>
          <input type="hidden" name="PartyName" id="pmt-party-name" value="${esc(b.customers[0]?.Name || '')}">
        </div>
        <div class="form-group">
          <label>Allocate to Invoice / PO No (Optional)</label>
          <input type="text" name="DocumentID" placeholder="e.g. INV-2026-27-0002 or PO-2026-27-0001">
        </div>
        <div class="form-group">
          <label>Amount (₹) *</label>
          <input type="number" step="0.01" min="0.01" name="Amount" required>
        </div>
        <div class="form-group">
          <label>Payment Method *</label>
          <select name="PaymentMethod">
            <option value="UPI">UPI</option>
            <option value="CASH">CASH</option>
            <option value="BANK_TRANSFER">BANK_TRANSFER</option>
            <option value="CARD">CARD</option>
          </select>
        </div>
        <div class="form-group">
          <label>Reference / UPI / Cheque No</label>
          <input type="text" name="ReferenceNo" placeholder="Optional reference">
        </div>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <input type="text" name="Notes">
      </div>
      <div class="modal-footer" style="padding:12px 0 0 0;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Payment &amp; Allocate</button>
      </div>
    </form>
  `);
}

function togglePaymentPartySelect() {
  const type = document.getElementById('pmt-party-type')?.value;
  const sel = document.getElementById('pmt-party-id');
  const nameInput = document.getElementById('pmt-party-name');
  if (!sel) return;
  const list = type === 'SUPPLIER' ? AppState.bundle.suppliers : AppState.bundle.customers;
  const idKey = type === 'SUPPLIER' ? 'SupplierID' : 'CustomerID';
  sel.innerHTML = list.map(p => `<option value="${esc(p[idKey])}" data-name="${esc(p.Name)}">${esc(p.Name)} (Due: ${fmtINR(p.CachedBalance)})</option>`).join('');
  if (nameInput && list[0]) nameInput.value = list[0].Name;
}

function syncPaymentPartyName(selectEl) {
  const opt = selectEl.options[selectEl.selectedIndex];
  const nameInput = document.getElementById('pmt-party-name');
  if (opt && nameInput) nameInput.value = opt.getAttribute('data-name') || '';
}

async function submitPaymentForm(e) {
  e.preventDefault();
  showLoader(true);
  const idempotencyKey = ApiAdapter.generateIdempotencyKey('PMT');
  try {
    const payload = Object.fromEntries(new FormData(e.target).entries());
    const res = await ApiAdapter.request('recordPayment', payload, idempotencyKey);
    closeModal();
    showToast(`Payment ${res.PaymentNo} recorded.`);
    await refreshBundle();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}

/**
 * 11. REPORTS MODULE (All 16 Reports)
 */
function renderReports(container) {
  const today = todayISO();
  const monthStart = today.slice(0, 8) + '01';

  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Business, Inventory, GST &amp; Financial Reports</span>
        <button class="btn btn-secondary btn-sm" onclick="exportActiveReportCSV()">Export Current Report CSV</button>
      </div>
      <div class="panel-body">
        <div class="form-grid" style="margin-bottom:16px;">
          <div class="form-group">
            <label>Report Type</label>
            <select id="rep-type" onchange="generateReportOutput()">
              <option value="DAILY_SALES">1. Daily Sales Summary</option>
              <option value="MONTHLY_SALES">2. Monthly Sales Summary</option>
              <option value="SALES_BY_PRODUCT">3. Sales by Product</option>
              <option value="SALES_BY_CATEGORY">4. Sales by Category</option>
              <option value="SALES_BY_PAYMENT">5. Sales by Payment Method</option>
              <option value="SALES_RETURNS">6. Sales Returns &amp; Refunds</option>
              <option value="PURCHASE_SUMMARY">7. Purchase Summary</option>
              <option value="STOCK_ON_HAND">8. Stock on Hand</option>
              <option value="STOCK_LEDGER">9. Stock Movement Ledger</option>
              <option value="LOW_STOCK">10. Low-Stock Report</option>
              <option value="STOCK_VALUATION">11. Stock Valuation Report</option>
              <option value="CUSTOMER_OUTSTANDING">12. Customer Outstanding (Credit / Udhaar)</option>
              <option value="SUPPLIER_OUTSTANDING">13. Supplier Outstanding Balances</option>
              <option value="EXPENSE_SUMMARY">14. Expense Summary (Excl. Contra)</option>
              <option value="GST_SUMMARY">15. GST Sales Summary</option>
              <option value="GROSS_PROFIT">16. Estimated Gross Profit Report</option>
            </select>
          </div>
          <div class="form-group">
            <label>From Date</label>
            <input type="date" id="rep-from" value="${monthStart}" onchange="generateReportOutput()">
          </div>
          <div class="form-group">
            <label>To Date</label>
            <input type="date" id="rep-to" value="${today}" onchange="generateReportOutput()">
          </div>
        </div>

        <div id="rep-note-banner" style="margin-bottom:12px;font-size:12px;color:var(--text-muted);"></div>
        <div class="table-responsive">
          <table>
            <thead id="rep-thead"></thead>
            <tbody id="rep-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  generateReportOutput();
}

function generateReportOutput() {
  const b = AppState.bundle;
  const type = document.getElementById('rep-type')?.value || 'DAILY_SALES';
  const from = document.getElementById('rep-from')?.value || '0000-01-01';
  const to = document.getElementById('rep-to')?.value || '9999-12-31';
  const thead = document.getElementById('rep-thead');
  const tbody = document.getElementById('rep-tbody');
  const noteEl = document.getElementById('rep-note-banner');
  if (!thead || !tbody) return;

  const inRange = (dStr) => {
    const d = String(dStr || '').slice(0, 10);
    return d >= from && d <= to;
  };

  const validSales = b.sales.filter(s => s.Status !== 'CANCELLED' && inRange(s.Date));
  const validSaleIds = new Set(validSales.map(s => s.InvoiceID));
  const validItems = b.saleItems.filter(si => validSaleIds.has(si.InvoiceID));

  let headers = [];
  let rows = [];
  let note = '';

  switch (type) {
    case 'DAILY_SALES': {
      headers = ['Date', 'Invoices Count', 'Discounts Given', 'Taxable Sales', 'GST Total', 'Grand Total', 'Collected', 'Credit Due'];
      const map = {};
      validSales.forEach(s => {
        const d = String(s.Date).slice(0, 10);
        if (!map[d]) map[d] = { count: 0, disc: 0, tax: 0, gst: 0, total: 0, paid: 0, due: 0 };
        map[d].count++;
        map[d].disc += Number(s.DiscountTotal || 0);
        map[d].tax += Number(s.TaxableAmount || 0);
        map[d].gst += Number(s.CGST || 0) + Number(s.SGST || 0) + Number(s.IGST || 0);
        map[d].total += Number(s.GrandTotal || 0);
        map[d].paid += Number(s.AmountPaid || 0);
        map[d].due += Number(s.BalanceDue || 0);
      });
      rows = Object.keys(map).sort().reverse().map(d => [
        fmtDate(d), map[d].count, fmtINR(map[d].disc), fmtINR(map[d].tax), fmtINR(map[d].gst), fmtINR(map[d].total), fmtINR(map[d].paid), fmtINR(map[d].due)
      ]);
      break;
    }
    case 'MONTHLY_SALES': {
      headers = ['Month (YYYY-MM)', 'Invoices', 'Discounts', 'Taxable Value', 'Total GST', 'Grand Total'];
      const map = {};
      validSales.forEach(s => {
        const m = String(s.Date).slice(0, 7);
        if (!map[m]) map[m] = { count: 0, disc: 0, taxable: 0, gst: 0, total: 0 };
        map[m].count++;
        map[m].disc += Number(s.DiscountTotal || 0);
        map[m].taxable += Number(s.TaxableAmount || 0);
        map[m].gst += Number(s.CGST || 0) + Number(s.SGST || 0) + Number(s.IGST || 0);
        map[m].total += Number(s.GrandTotal || 0);
      });
      rows = Object.keys(map).sort().reverse().map(m => [
        m, map[m].count, fmtINR(map[m].disc), fmtINR(map[m].taxable), fmtINR(map[m].gst), fmtINR(map[m].total)
      ]);
      break;
    }
    case 'SALES_BY_PRODUCT': {
      headers = ['SKU', 'Product Name', 'Qty Sold', 'Taxable Value', 'GST', 'Total Revenue'];
      const map = {};
      validItems.forEach(it => {
        if (!map[it.ProductID]) map[it.ProductID] = { sku: it.SKU, name: it.ProductName, qty: 0, taxable: 0, gst: 0, total: 0 };
        map[it.ProductID].qty += Number(it.Quantity || 0);
        map[it.ProductID].taxable += Number(it.TaxableValue || 0);
        map[it.ProductID].gst += Number(it.CGST || 0) + Number(it.SGST || 0) + Number(it.IGST || 0);
        map[it.ProductID].total += Number(it.LineTotal || 0);
      });
      rows = Object.values(map).map(r => [r.sku, r.name, r.qty, fmtINR(r.taxable), fmtINR(r.gst), fmtINR(r.total)]);
      break;
    }
    case 'SALES_BY_CATEGORY': {
      headers = ['Category', 'Units Sold', 'Taxable Sales', 'Total Revenue (Incl. GST)'];
      const prodCat = {};
      b.products.forEach(p => { prodCat[p.ProductID] = p.Category || 'Uncategorized'; });
      const map = {};
      validItems.forEach(it => {
        const cat = prodCat[it.ProductID] || 'General';
        if (!map[cat]) map[cat] = { qty: 0, taxable: 0, total: 0 };
        map[cat].qty += Number(it.Quantity || 0);
        map[cat].taxable += Number(it.TaxableValue || 0);
        map[cat].total += Number(it.LineTotal || 0);
      });
      rows = Object.keys(map).map(c => [c, map[c].qty, fmtINR(map[c].taxable), fmtINR(map[c].total)]);
      break;
    }
    case 'SALES_BY_PAYMENT': {
      headers = ['Payment Method', 'Transactions', 'Total Collected'];
      const map = {};
      b.payments.filter(p => p.PaymentType === 'INCOMING' && inRange(p.Date)).forEach(p => {
        const m = p.PaymentMethod || 'CASH';
        if (!map[m]) map[m] = { count: 0, amt: 0 };
        map[m].count++;
        map[m].amt += Number(p.Amount || 0);
      });
      rows = Object.keys(map).map(m => [m, map[m].count, fmtINR(map[m].amt)]);
      break;
    }
    case 'SALES_RETURNS': {
      headers = ['Return No', 'Date', 'Invoice No', 'Qty', 'Taxable Refund', 'GST Reversed', 'Total Refund', 'Condition'];
      rows = b.salesReturns.filter(r => inRange(r.Date)).map(r => [
        r.ReturnNo, fmtDate(r.Date), r.InvoiceNo, r.Quantity, fmtINR(r.TaxableRefund), fmtINR(r.TaxRefund), fmtINR(r.TotalRefund), r.Condition
      ]);
      break;
    }
    case 'PURCHASE_SUMMARY': {
      headers = ['PO Number', 'Date', 'Supplier', 'Invoice Ref', 'Status', 'Grand Total', 'Paid', 'Balance Due'];
      rows = b.purchases.filter(p => inRange(p.Date)).map(p => [
        p.PONumber, fmtDate(p.Date), p.SupplierName, p.SupplierInvoiceNo || '-', p.Status, fmtINR(p.GrandTotal), fmtINR(p.AmountPaid), fmtINR(p.BalanceDue)
      ]);
      break;
    }
    case 'STOCK_ON_HAND': {
      headers = ['SKU', 'Product Name', 'Category', 'Unit', 'Current Stock', 'Min Stock', 'Status'];
      rows = b.products.map(p => [
        p.SKU, p.Name, p.Category, p.Unit, p.CurrentStock, p.MinStock, Number(p.CurrentStock) <= Number(p.MinStock) ? 'LOW STOCK' : 'OK'
      ]);
      break;
    }
    case 'STOCK_LEDGER': {
      headers = ['Movement ID', 'Date', 'SKU', 'Product', 'Type', 'Qty Change', 'Reference', 'Reason'];
      rows = b.stockMovements.filter(m => inRange(m.Timestamp)).map(m => [
        m.MovementID, fmtDate(m.Timestamp), m.SKU, m.ProductName, m.MovementType, m.QtyChange, m.ReferenceDocNo, m.Reason
      ]);
      break;
    }
    case 'LOW_STOCK': {
      headers = ['SKU', 'Product Name', 'Current Stock', 'Min Required', 'Shortfall'];
      rows = b.products.filter(p => p.Active === 'TRUE' && Number(p.CurrentStock) <= Number(p.MinStock)).map(p => [
        p.SKU, p.Name, p.CurrentStock, p.MinStock, Number(p.MinStock) - Number(p.CurrentStock)
      ]);
      break;
    }
    case 'STOCK_VALUATION': {
      headers = ['SKU', 'Product Name', 'Stock on Hand', 'Purchase Cost', 'Total Valuation'];
      rows = b.products.map(p => [
        p.SKU, p.Name, p.CurrentStock, fmtINR(p.PurchaseCost), fmtINR(Math.max(0, Number(p.CurrentStock)) * Number(p.PurchaseCost))
      ]);
      break;
    }
    case 'CUSTOMER_OUTSTANDING': {
      headers = ['Customer ID', 'Customer Name', 'Phone', 'Credit Limit', 'Outstanding Balance'];
      rows = b.customers.filter(c => Number(c.CachedBalance) > 0).map(c => [
        c.CustomerID, c.Name, c.Phone, fmtINR(c.CreditLimit), fmtINR(c.CachedBalance)
      ]);
      break;
    }
    case 'SUPPLIER_OUTSTANDING': {
      headers = ['Supplier ID', 'Supplier Name', 'Phone', 'Payment Terms', 'Payable Balance'];
      rows = b.suppliers.filter(s => Number(s.CachedBalance) > 0).map(s => [
        s.SupplierID, s.Name, s.Phone, s.PaymentTerms, fmtINR(s.CachedBalance)
      ]);
      break;
    }
    case 'EXPENSE_SUMMARY': {
      headers = ['Expense ID', 'Date', 'Category', 'Description', 'Payment Method', 'Amount'];
      rows = b.expenses.filter(e => String(e.IsInternalTransfer) !== 'TRUE' && inRange(e.Date)).map(e => [
        e.ExpenseID, fmtDate(e.Date), e.Category, e.Description, e.PaymentMethod, fmtINR(e.Amount)
      ]);
      note = 'Note: Internal cash/bank contra transfers are excluded from operating business expenses.';
      break;
    }
    case 'GST_SUMMARY': {
      headers = ['Invoice No', 'Date', 'Customer GSTIN', 'Discount', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Invoice Total'];
      rows = validSales.map(s => [
        s.InvoiceNo, fmtDate(s.Date), s.CustomerGSTIN || 'Unregistered', fmtINR(s.DiscountTotal || 0), fmtINR(s.TaxableAmount), fmtINR(s.CGST), fmtINR(s.SGST), fmtINR(s.IGST), fmtINR(s.GrandTotal)
      ]);
      break;
    }
    case 'GROSS_PROFIT': {
      headers = ['Metric', 'Amount (₹)', 'Calculation Basis'];
      const grossTaxableSales = validSales.reduce((a, s) => a + Number(s.TaxableAmount || 0), 0);
      const totalDiscounts = validSales.reduce((a, s) => a + Number(s.DiscountTotal || 0), 0);
      const returnsTaxable = b.salesReturns.filter(r => inRange(r.Date)).reduce((a, r) => a + Number(r.TaxableRefund || 0), 0);
      const cogs = validItems.reduce((a, si) => a + (Number(si.Quantity || 0) * Number(si.UnitCostSnapshot || 0)), 0);
      const estGrossProfit = grossTaxableSales - returnsTaxable - cogs;
      rows = [
        ['1. Net Sales Revenue (Excl. GST, After ' + fmtINR(totalDiscounts) + ' Discounts)', fmtINR(grossTaxableSales), 'Sum of Invoice Taxable Amounts'],
        ['2. Less: Sales Returns (Excl. GST)', fmtINR(returnsTaxable), 'Controlled Reversals in Period'],
        ['3. Less: Estimated Cost of Goods Sold (COGS)', fmtINR(cogs), 'Sold Qty × Unit Cost Snapshot (Not Raw Purchases)'],
        ['4. Estimated Gross Profit', fmtINR(estGrossProfit), 'Net Taxable Sales − Returns − Est. COGS']
      ];
      note = 'Estimated Gross Profit is calculated strictly from sales excluding GST, less discounts, returns, and unit cost of goods sold.';
      break;
    }
  }

  if (noteEl) noteEl.textContent = note;
  thead.innerHTML = `<tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr>`;
  tbody.innerHTML = rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') ||
    `<tr><td colspan="${headers.length}">No records found for selected period.</td></tr>`;

  const csvLines = [
    headers.map(csvSafeCell).join(','),
    ...rows.map(r => r.map(csvSafeCell).join(','))
  ];
  AppState.lastReportCSV = {
    filename: `rang-creation-${type.toLowerCase()}-${todayISO()}.csv`,
    content: csvLines.join('\n')
  };
}

function exportActiveReportCSV() {
  downloadCSV(AppState.lastReportCSV.filename, AppState.lastReportCSV.content);
}

/**
 * 12. SETTINGS, ENDPOINT CONFIGURATION & SCHEDULED AUTOMATIONS
 */
function renderSettings(container) {
  const st = AppState.bundle.settings;
  const endpoint = ApiAdapter.getEndpointUrl();
  const emailHint = ApiAdapter.getUserEmailHint();

  container.innerHTML = `
    <div class="grid-2">
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Store Profile, GST &amp; Automation Settings</span>
        </div>
        <div class="panel-body">
          <form onsubmit="submitSettingsForm(event)">
            <div class="form-group">
              <label>Shop / Legal Business Name *</label>
              <input type="text" name="SHOP_NAME" required value="${esc(st.SHOP_NAME || 'Rang Creation By Ekta')}">
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label>GSTIN</label>
                <input type="text" name="SHOP_GSTIN" value="${esc(st.SHOP_GSTIN || '')}">
              </div>
              <div class="form-group">
                <label>Phone Number</label>
                <input type="text" name="SHOP_PHONE" value="${esc(st.SHOP_PHONE || '')}">
              </div>
              <div class="form-group">
                <label>Active Financial Year Prefix</label>
                <input type="text" name="FINANCIAL_YEAR" required value="${esc(st.FINANCIAL_YEAR || '2026-27')}">
              </div>
              <div class="form-group">
                <label>Negative Stock Policy</label>
                <select name="ALLOW_NEGATIVE_STOCK">
                  <option value="FALSE" ${st.ALLOW_NEGATIVE_STOCK !== 'TRUE' ? 'selected' : ''}>Block Sales Below Zero Stock</option>
                  <option value="TRUE" ${st.ALLOW_NEGATIVE_STOCK === 'TRUE' ? 'selected' : ''}>Allow Negative Stock (Authorised Override)</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Shop Address</label>
              <input type="text" name="SHOP_ADDRESS" value="${esc(st.SHOP_ADDRESS || '')}">
            </div>
            <div class="form-group">
              <label>Printable Invoice Footer Terms</label>
              <input type="text" name="INVOICE_TERMS" value="${esc(st.INVOICE_TERMS || '')}">
            </div>

            <hr style="margin:16px 0;border:none;border-top:1px solid var(--border);">
            <h4 style="margin-bottom:10px;">Scheduled Google Apps Script Automations (9:00 PM IST Daily)</h4>
            <div class="form-grid">
              <div class="form-group">
                <label>Daily Low-Stock Alert Email</label>
                <select name="AUTO_LOW_STOCK_EMAIL">
                  <option value="FALSE" ${st.AUTO_LOW_STOCK_EMAIL !== 'TRUE' ? 'selected' : ''}>Disabled</option>
                  <option value="TRUE" ${st.AUTO_LOW_STOCK_EMAIL === 'TRUE' ? 'selected' : ''}>Enabled</option>
                </select>
              </div>
              <div class="form-group">
                <label>Daily Sales Summary Email</label>
                <select name="AUTO_DAILY_SALES_EMAIL">
                  <option value="FALSE" ${st.AUTO_DAILY_SALES_EMAIL !== 'TRUE' ? 'selected' : ''}>Disabled</option>
                  <option value="TRUE" ${st.AUTO_DAILY_SALES_EMAIL === 'TRUE' ? 'selected' : ''}>Enabled</option>
                </select>
              </div>
              <div class="form-group">
                <label>Customer/Supplier Reminders</label>
                <select name="AUTO_PAYMENT_REMINDERS">
                  <option value="FALSE" ${st.AUTO_PAYMENT_REMINDERS !== 'TRUE' ? 'selected' : ''}>Disabled</option>
                  <option value="TRUE" ${st.AUTO_PAYMENT_REMINDERS === 'TRUE' ? 'selected' : ''}>Enabled</option>
                </select>
              </div>
              <div class="form-group">
                <label>Daily Google Drive Backup</label>
                <select name="AUTO_DAILY_BACKUP">
                  <option value="FALSE" ${st.AUTO_DAILY_BACKUP !== 'TRUE' ? 'selected' : ''}>Disabled</option>
                  <option value="TRUE" ${st.AUTO_DAILY_BACKUP === 'TRUE' ? 'selected' : ''}>Enabled</option>
                </select>
              </div>
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label>Owner Alert Email Recipient</label>
                <input type="email" name="ALERT_RECIPIENT_EMAIL" value="${esc(st.ALERT_RECIPIENT_EMAIL || '')}">
              </div>
              <div class="form-group">
                <label>Restricted Drive Backup Folder ID</label>
                <input type="text" name="BACKUP_FOLDER_ID" value="${esc(st.BACKUP_FOLDER_ID || '')}" placeholder="Google Drive Folder ID">
              </div>
            </div>
            <button type="submit" class="btn btn-primary" style="margin-top:8px;">Save Settings &amp; Sync Triggers</button>
          </form>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Apps Script Web App Connection &amp; Database Setup</span>
        </div>
        <div class="panel-body">
          <div class="form-group">
            <label>Google Apps Script Web App Deployment URL (For GitHub Pages / Google Sites)</label>
            <input type="url" id="conn-endpoint-url" value="${esc(endpoint)}" placeholder="https://script.google.com/macros/s/.../exec">
            <small style="color:var(--text-muted)">Leave empty to run in Local Sandbox mode or when served directly via Apps Script HtmlService.</small>
          </div>
          <div class="form-group">
            <label>Operator Google Account Email Hint (For RBAC Verification)</label>
            <input type="email" id="conn-email-hint" value="${esc(emailHint)}" placeholder="owner@shop.in">
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
            <button type="button" class="btn btn-primary" onclick="saveConnectionConfig()">Save Connection</button>
            <button type="button" class="btn btn-secondary" onclick="runDatabaseSetupUI()">Initialise / Verify 20 Sheets</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function submitSettingsForm(e) {
  e.preventDefault();
  showLoader(true);
  try {
    const settings = Object.fromEntries(new FormData(e.target).entries());
    const res = await ApiAdapter.request('saveSettings', { settings, syncTriggers: true });
    showToast(res.message || 'Settings saved.');
    await refreshBundle();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}

async function saveConnectionConfig() {
  const url = document.getElementById('conn-endpoint-url')?.value || '';
  const email = document.getElementById('conn-email-hint')?.value || '';
  ApiAdapter.setEndpointUrl(url);
  ApiAdapter.setUserEmailHint(email);
  showToast('Backend connection settings updated.');
  await refreshBundle();
}

async function runDatabaseSetupUI() {
  if (!confirm('Verify all 20 required Google Sheets, column headers, and seed records?')) return;
  showLoader(true);
  try {
    const res = await ApiAdapter.request('setupDatabase');
    showToast(res.message || 'Database verified.');
    await refreshBundle();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    showLoader(false);
  }
}