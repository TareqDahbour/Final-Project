/* =====================================================================
   SyberTeam — shared script.js
   Pure vanilla JavaScript. No network requests, no eval, no libraries.

   Sections
     1. Helpers (DOM, storage, formatting)
     2. Navbar
     3. Shared lab helpers (switch, banner, code panel, solved state)
     4. Home page
     5. Lab 1 — ReDoS
     6. Lab 2 — Business logic flaw
     7. Lab 3 — Client-side prototype pollution
     8. Bootstrap (page router, guarded by <body data-page="...">)
   ===================================================================== */
(function () {
  'use strict';

  // Snapshot of Object.prototype's own property names BEFORE anything can
  // pollute it. Lab 3 uses this to show (and clean up) pollution.
  var PROTO_BASELINE = Object.getOwnPropertyNames(Object.prototype);

  /* -------------------------------------------------------------------
     1. HELPERS
     ------------------------------------------------------------------- */
  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  // localStorage wrapper with an in-memory fallback (some browsers block
  // storage on file:// pages). The fallback object has no prototype so it
  // can never be affected by Lab 3's prototype pollution.
  var memoryStore = Object.create(null);
  var store = {
    get: function (key) {
      try { return window.localStorage.getItem('syb:' + key); }
      catch (err) { return key in memoryStore ? memoryStore[key] : null; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem('syb:' + key, value); }
      catch (err) { memoryStore[key] = value; }
    },
    remove: function (key) {
      try { window.localStorage.removeItem('syb:' + key); }
      catch (err) { delete memoryStore[key]; }
    }
  };

  function money(n) { return (n < 0 ? '-' : '') + '$' + Math.abs(n).toFixed(2); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clockTime() {
    var d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  /* -------------------------------------------------------------------
     2. NAVBAR
     ------------------------------------------------------------------- */
  var NAV_MAP = {
    'home': 'home',
    'redos-lesson': 'lab1', 'redos-lab': 'lab1',
    'logic-lesson': 'lab2', 'logic-lab': 'lab2',
    'proto-lesson': 'lab3', 'proto-lab': 'lab3'
  };

  function initNavbar() {
    var page = document.body.getAttribute('data-page');
    var activeKey = NAV_MAP[page];
    $$('.nav-links a').forEach(function (link) {
      if (link.getAttribute('data-nav') === activeKey) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
    });

    // Mobile menu toggle
    var toggle = $('.nav-toggle');
    var links = $('#nav-links');
    if (toggle && links) {
      toggle.addEventListener('click', function () {
        var open = links.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
      });
    }
  }

  /* -------------------------------------------------------------------
     3. SHARED LAB HELPERS
     ------------------------------------------------------------------- */
  var LAB_TEXT = {
    redos: {
      goal: 'Goal: make the username validator run for more than 2 seconds.',
      solved: 'ReDoS triggered: your input kept the regex engine busy past the 2 second limit, so the worker was terminated.'
    },
    logic: {
      goal: 'Goal: complete a checkout for much less than the goods are worth (or with a negative total).',
      solved: 'You completed a checkout with an illegitimate price. The shop trusted state it should have validated.'
    },
    proto: {
      goal: 'Goal: unlock the admin panel without ever sending isAdmin as a normal setting.',
      solved: 'Prototype pollution succeeded: the gadget read an isAdmin value that was inherited from Object.prototype.'
    }
  };

  function isSolved(lab) { return store.get('solved:' + lab) === '1'; }
  function markSolved(lab) { store.set('solved:' + lab, '1'); }
  function clearSolved(lab) { store.remove('solved:' + lab); }

  // Banner states: 'unsolved' | 'solved' | 'blocked'
  var BANNER_TITLES = { unsolved: 'Not solved', solved: 'Lab solved!', blocked: 'Attack blocked' };

  function setBanner(state, detail) {
    var banner = $('#status-banner');
    if (!banner) { return; }
    banner.setAttribute('data-state', state);
    $('.banner-title', banner).textContent = BANNER_TITLES[state];
    $('.banner-detail', banner).textContent = detail || '';
  }

  // Shows the persistent state (solved / not solved) for a lab.
  function renderBanner(lab) {
    if (isSolved(lab)) { setBanner('solved', LAB_TEXT[lab].solved); }
    else { setBanner('unsolved', LAB_TEXT[lab].goal); }
  }

  // Updates the "Active code" panel.
  function setCodePanel(code, fixed) {
    var codeEl = $('#active-code');
    var badge = $('#code-mode');
    if (codeEl) { codeEl.textContent = code; }
    if (badge) {
      badge.textContent = fixed ? 'Fixed code' : 'Vulnerable code';
      badge.classList.toggle('badge-solid', fixed);
    }
  }

  // The accessible "Fix the vulnerability" switch (role="switch").
  // OFF = vulnerable path, ON = patched path. State is saved per lab.
  function initFixSwitch(lab, onChange) {
    var button = $('#fix-switch');
    var label = $('#fix-switch-state');
    var fixed = store.get('fixed:' + lab) === '1';

    function render() {
      button.setAttribute('aria-checked', String(fixed));
      label.textContent = fixed ? 'ON — patched code' : 'OFF — vulnerable code';
    }
    function set(value, silent) {
      fixed = !!value;
      store.set('fixed:' + lab, fixed ? '1' : '0');
      render();
      if (!silent && onChange) { onChange(fixed); }
    }
    button.addEventListener('click', function () { set(!fixed); });
    render();
    return { isFixed: function () { return fixed; }, set: set };
  }

  /* -------------------------------------------------------------------
     4. HOME PAGE
     ------------------------------------------------------------------- */
  function initHome() {
    // Show a small "Solved" tag on lab cards the visitor already completed.
    $$('.lab-card[data-lab]').forEach(function (card) {
      var tag = $('.solved-tag', card);
      if (tag && isSolved(card.getAttribute('data-lab'))) { tag.hidden = false; }
    });
  }

  /* -------------------------------------------------------------------
     5. LAB 1 — ReDoS
     ------------------------------------------------------------------- */
  var REDOS_VULN_CODE =
    '// VULNERABLE: nested quantifier (x+)+ causes catastrophic backtracking.\n' +
    'const USERNAME_RE = /^([a-z0-9]+)+$/i;\n' +
    '\n' +
    'function isValidUsername(name) {\n' +
    '  return USERNAME_RE.test(name);   // no length limit, runs on any input\n' +
    '}\n' +
    '\n' +
    '// "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!" almost matches, so the engine\n' +
    '// tries ~2^n ways to split the a\'s between the inner and outer "+".';

  var REDOS_FIXED_CODE =
    '// FIXED: 1) hard length limit, 2) linear-time regex (no nested quantifier).\n' +
    'const MAX_LEN = 20;\n' +
    'const USERNAME_RE = /^[a-z0-9]+$/i;\n' +
    '\n' +
    'function isValidUsername(name) {\n' +
    '  if (name.length > MAX_LEN) return false;   // reject before any regex runs\n' +
    '  return USERNAME_RE.test(name);             // O(n): one pass, no backtracking\n' +
    '}';

  // Source of the Web Worker. It is turned into a Blob URL at runtime so the
  // lab works from file:// without a separate worker file. The worker holds
  // the (dangerous) regex, so a hang can only ever block the worker thread.
  var REDOS_WORKER_SRC =
    'self.onmessage = function (e) {\n' +
    '  var data = e.data;\n' +
    '  var start = performance.now();\n' +
    '  var ok;\n' +
    '  if (data.mode === "vulnerable") {\n' +
    '    ok = /^([a-z0-9]+)+$/i.test(data.input);\n' +
    '  } else {\n' +
    '    ok = /^[a-z0-9]+$/i.test(data.input);\n' +
    '  }\n' +
    '  self.postMessage({ ok: ok, ms: performance.now() - start });\n' +
    '};';

  function initReDoSLab() {
    var LAB = 'redos';
    var THRESHOLD_MS = 2000;   // lab is solved when the regex runs longer than this
    var MAX_LEN = 20;          // limit enforced by the fixed validator

    var form = $('#redos-form');
    var input = $('#username');
    var btnTest = $('#btn-test');
    var btnStop = $('#btn-stop');
    var btnSafe = $('#btn-safe');
    var btnAttack = $('#btn-attack');
    var outLen = $('#out-length');
    var outTime = $('#out-time');
    var outResult = $('#out-result');
    var btnReset = $('#reset-lab');

    var worker = null;
    var workerUrl = null;
    var timeoutId = null;
    var tickerId = null;
    var startedAt = 0;
    var modeAtStart = false;

    var sw = initFixSwitch(LAB, onModeChange);

    function onModeChange(fixed) {
      setCodePanel(fixed ? REDOS_FIXED_CODE : REDOS_VULN_CODE, fixed);
      renderBanner(LAB);
    }

    function updateLength() { outLen.textContent = String(input.value.length); }

    function setRunning(running) {
      btnTest.disabled = running;
      btnStop.disabled = !running;
    }

    // Stops the worker and all timers. Safe to call at any time.
    function cleanup() {
      clearTimeout(timeoutId);
      clearInterval(tickerId);
      timeoutId = null;
      tickerId = null;
      if (worker) { worker.terminate(); worker = null; }
      if (workerUrl) { URL.revokeObjectURL(workerUrl); workerUrl = null; }
      setRunning(false);
    }

    function startWorker() {
      var blob = new Blob([REDOS_WORKER_SRC], { type: 'text/javascript' });
      workerUrl = URL.createObjectURL(blob);
      return new Worker(workerUrl);
    }

    function runTest() {
      if (worker) { return; }
      var text = input.value;
      var fixed = sw.isFixed();
      updateLength();

      if (text.length === 0) {
        outTime.textContent = '—';
        outResult.textContent = 'Enter a username first.';
        return;
      }

      // FIXED path, step 1: the length limit rejects long input immediately.
      if (fixed && text.length > MAX_LEN) {
        outTime.textContent = '0.00 ms (regex never ran)';
        outResult.textContent = 'Rejected: longer than ' + MAX_LEN + ' characters.';
        setBanner('blocked', 'The patched validator rejects inputs longer than ' + MAX_LEN +
          ' characters before any regex runs, and its regex has no nested quantifier, so it can never backtrack exponentially.');
        return;
      }

      try {
        worker = startWorker();
      } catch (err) {
        worker = null;
        outResult.textContent = 'Web Workers are not available in this browser, so the lab cannot run safely.';
        return;
      }

      modeAtStart = fixed;
      startedAt = performance.now();
      setRunning(true);
      outResult.textContent = 'Running in a Web Worker…';

      worker.onmessage = function (event) {
        var data = event.data;
        cleanup();
        outTime.textContent = data.ms.toFixed(2) + ' ms';
        outResult.textContent = data.ok ? 'Valid username' : 'Invalid username';
        if (modeAtStart && !data.ok && text.length >= 15) {
          setBanner('blocked', 'A near-miss input finished in ' + data.ms.toFixed(2) +
            ' ms. The patched regex is linear-time, so there is no backtracking to exploit.');
        }
      };
      worker.onerror = function () {
        cleanup();
        outResult.textContent = 'The worker reported an error.';
      };
      worker.postMessage({ mode: fixed ? 'fixed' : 'vulnerable', input: text });

      // Live timer while the worker runs
      tickerId = setInterval(function () {
        outTime.textContent = (performance.now() - startedAt).toFixed(0) + ' ms (running…)';
      }, 50);

      // Safety net: kill the worker once it exceeds the threshold
      timeoutId = setTimeout(function () {
        cleanup();
        outTime.textContent = '> ' + THRESHOLD_MS + ' ms (timed out)';
        outResult.textContent = 'Worker terminated: the regex was still running.';
        if (!modeAtStart) {
          markSolved(LAB);
          setBanner('solved', 'ReDoS triggered: ' + LAB_TEXT.redos.solved);
        }
      }, THRESHOLD_MS);
    }

    function stopTest() {
      if (!worker) { return; }
      var elapsed = performance.now() - startedAt;
      cleanup();
      outTime.textContent = elapsed.toFixed(0) + ' ms (stopped)';
      outResult.textContent = 'Stopped by you. The lab is only solved if the regex runs past ' + THRESHOLD_MS + ' ms.';
    }

    function resetLab() {
      cleanup();
      input.value = '';
      outLen.textContent = '0';
      outTime.textContent = '—';
      outResult.textContent = 'Ready.';
      clearSolved(LAB);
      sw.set(false, true);
      onModeChange(false);
    }

    form.addEventListener('submit', function (event) { event.preventDefault(); runTest(); });
    btnStop.addEventListener('click', stopTest);
    btnReset.addEventListener('click', resetLab);
    input.addEventListener('input', updateLength);
    // Helper buttons only FILL the input. The user still has to press Test.
    btnSafe.addEventListener('click', function () { input.value = 'alice2026'; updateLength(); input.focus(); });
    btnAttack.addEventListener('click', function () {
      input.value = new Array(36).join('a') + '!';   // 35 "a" characters + "!"
      updateLength();
      input.focus();
    });
    window.addEventListener('pagehide', cleanup);

    setRunning(false);
    onModeChange(sw.isFixed());
  }

  /* -------------------------------------------------------------------
     6. LAB 2 — BUSINESS LOGIC FLAW
     ------------------------------------------------------------------- */
  var LOGIC_VULN_CODE =
    '// VULNERABLE: the client-side "app" trusts quantities, coupons and its own state.\n' +
    'function addToCart(id, rawQty) {\n' +
    '  const qty = Number(rawQty);          // -5? 0.01? both accepted\n' +
    '  line.qty += qty;\n' +
    '}\n' +
    'function applyCoupon(code) {\n' +
    '  if (code === "SAVE20") coupons++;    // can be applied again and again\n' +
    '}\n' +
    'function total() {                     // total = price * qty * 0.8^coupons\n' +
    '  return subtotal * Math.pow(0.8, coupons);\n' +
    '}\n' +
    'function placeOrder() {\n' +
    '  // uses the total locked at "review" time, even if the cart changed since\n' +
    '  const charge = reviewed ? reviewed.total : total();\n' +
    '  wallet -= charge;                    // a negative charge CREDITS the wallet\n' +
    '}';

  var LOGIC_FIXED_CODE =
    '// FIXED: validate every input and re-derive every number from trusted data.\n' +
    'function parseQty(raw) {\n' +
    '  if (!/^\\d+$/.test(String(raw).trim())) return null;   // whole numbers only\n' +
    '  const n = Number(raw);\n' +
    '  return n >= 1 && n <= MAX_QTY ? n : null;               // 1..5\n' +
    '}\n' +
    'function applyCoupon(code) {\n' +
    '  if (coupons >= 1) throw new Error("Coupon already used");  // single-use\n' +
    '}\n' +
    'function total() {                    // prices come from the trusted list\n' +
    '  return sum(cart, l => TRUSTED_PRICES[l.id] * l.qty) * (coupons ? 0.8 : 1);\n' +
    '}\n' +
    'function placeOrder() {\n' +
    '  if (!reviewed) throw new Error("Review step required");   // workflow order\n' +
    '  validateCart();                                            // re-check everything\n' +
    '  if (total() !== reviewed.total) throw new Error("Cart changed after review");\n' +
    '  wallet -= total();\n' +
    '}\n' +
    '// Any cart or coupon change also invalidates the review.';

  function initLogicLab() {
    var LAB = 'logic';
    var PRODUCTS = [
      { id: 'sticker', name: 'Sticker Pack', price: 5 },
      { id: 'cable', name: 'USB-C Cable', price: 15 },
      { id: 'headphones', name: 'Headphones', price: 80 },
      { id: 'laptop', name: 'Laptop Pro', price: 500 }
    ];
    // The "server-side" trusted price list used by the patched code.
    var TRUSTED_PRICES = Object.create(null);
    PRODUCTS.forEach(function (p) { TRUSTED_PRICES[p.id] = p.price; });

    var START_BALANCE = 100;
    var MAX_QTY = 5;
    var COUPON_CODE = 'SAVE20';
    var COUPON_RATE = 0.8;

    var productList = $('#product-list');
    var cartBody = $('#cart-body');
    var cartEmpty = $('#cart-empty');
    var couponForm = $('#coupon-form');
    var couponInput = $('#coupon-input');
    var btnReview = $('#btn-review');
    var btnPlace = $('#btn-place');
    var outTotal = $('#out-total');
    var outCoupons = $('#out-coupons');
    var outBalance = $('#out-balance');
    var outReview = $('#out-review');
    var logEl = $('#order-log');
    var btnReset = $('#reset-lab');

    var state = freshState();
    var sw = initFixSwitch(LAB, onModeChange);

    function freshState() { return { cart: [], coupons: 0, reviewed: null, balance: START_BALANCE }; }

    function onModeChange(fixed) {
      setCodePanel(fixed ? LOGIC_FIXED_CODE : LOGIC_VULN_CODE, fixed);
      renderBanner(LAB);
      log('info', 'Mode switched to ' + (fixed ? 'PATCHED' : 'VULNERABLE') + ' code.');
      render();
    }

    /* ----- order log ----- */
    function log(kind, message) {
      var li = document.createElement('li');
      li.className = kind;
      var tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = clockTime();
      li.appendChild(tag);
      li.appendChild(document.createTextNode(' ' + message));
      logEl.appendChild(li);
      logEl.scrollTop = logEl.scrollHeight;
    }

    // Records a rejection. "security" rejections also raise the Attack blocked banner.
    function deny(message, security) {
      log('deny', 'REJECTED: ' + message);
      if (security) { setBanner('blocked', message); }
    }

    /* ----- shared helpers ----- */
    function findProduct(id) {
      for (var i = 0; i < PRODUCTS.length; i++) { if (PRODUCTS[i].id === id) { return PRODUCTS[i]; } }
      return null;
    }
    function findLine(id) {
      for (var i = 0; i < state.cart.length; i++) { if (state.cart[i].id === id) { return state.cart[i]; } }
      return null;
    }
    function invalidateReview(reason) {
      if (state.reviewed) {
        state.reviewed = null;
        log('info', 'Review invalidated (' + reason + '). The order must be reviewed again.');
      }
    }

    /* ----- totals ----- */
    // VULNERABLE: uses prices stored in the cart, any quantity, and 0.8^coupons.
    function totalVulnerable() {
      var subtotal = 0;
      state.cart.forEach(function (l) { subtotal += l.price * l.qty; });
      return round2(subtotal * Math.pow(COUPON_RATE, state.coupons));
    }
    // FIXED: prices come from the trusted list, at most one coupon.
    function totalFixed() {
      var subtotal = 0;
      state.cart.forEach(function (l) { subtotal += TRUSTED_PRICES[l.id] * l.qty; });
      return round2(state.coupons > 0 ? subtotal * COUPON_RATE : subtotal);
    }
    function currentTotal() { return sw.isFixed() ? totalFixed() : totalVulnerable(); }

    // What an honest shopper owes for this cart: positive items rounded up to
    // whole units, at most one coupon. Used only to judge "illegitimate price".
    function legitimateTotal() {
      var sum = 0;
      state.cart.forEach(function (l) { sum += TRUSTED_PRICES[l.id] * Math.ceil(Math.max(l.qty, 0)); });
      return round2(state.coupons > 0 ? sum * COUPON_RATE : sum);
    }

    // FIXED: quantity must be a whole number from 1 to MAX_QTY.
    function parseQtyFixed(raw) {
      var s = String(raw).trim();
      if (!/^\d+$/.test(s)) { return null; }
      var n = Number(s);
      return (n >= 1 && n <= MAX_QTY) ? n : null;
    }
    // FIXED: re-validate the whole cart. Returns an error string or null.
    function validateCartFixed() {
      for (var i = 0; i < state.cart.length; i++) {
        var l = state.cart[i];
        if (!(Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= MAX_QTY)) {
          return 'Cart contains an invalid quantity (' + l.qty + ' × ' + l.name + '). Quantities must be whole numbers from 1 to ' + MAX_QTY + '.';
        }
      }
      if (state.coupons > 1) { return 'Coupon ' + COUPON_CODE + ' was applied ' + state.coupons + ' times. It is single-use.'; }
      return null;
    }

    /* ----- actions ----- */
    function addToCart(id, raw) {
      var product = findProduct(id);
      if (!product) { return; }
      var line = findLine(id);

      if (sw.isFixed()) {
        var qty = parseQtyFixed(raw);
        if (qty === null) {
          deny('Quantity "' + raw + '" is not allowed. Use a whole number from 1 to ' + MAX_QTY + '.', true);
          return;
        }
        var next = (line ? line.qty : 0) + qty;
        if (next > MAX_QTY) {
          deny('You can buy at most ' + MAX_QTY + ' units of ' + product.name + ' per order.', true);
          return;
        }
        if (line) { line.qty = next; } else { state.cart.push({ id: id, name: product.name, price: product.price, qty: qty }); }
        invalidateReview('cart changed');
        log('ok', 'Added ' + qty + ' × ' + product.name + ' (validated).');
      } else {
        var q = Number(raw);
        if (raw === '' || !isFinite(q)) { log('deny', 'REJECTED: "' + raw + '" is not a number.'); return; }
        if (line) { line.qty += q; } else { state.cart.push({ id: id, name: product.name, price: product.price, qty: q }); }
        log('ok', 'Added ' + q + ' × ' + product.name + ' (quantity trusted as-is).');
      }
      render();
    }

    function removeLine(id) {
      var idx = -1;
      state.cart.forEach(function (l, i) { if (l.id === id) { idx = i; } });
      if (idx < 0) { return; }
      var removed = state.cart.splice(idx, 1)[0];
      log('ok', 'Removed ' + removed.name + ' from the cart.');
      if (sw.isFixed()) { invalidateReview('cart changed'); }
      render();
    }

    function applyCoupon(raw) {
      var code = String(raw).trim().toUpperCase();
      if (code !== COUPON_CODE) { log('deny', 'REJECTED: unknown coupon "' + raw + '". Try ' + COUPON_CODE + '.'); return; }
      if (sw.isFixed()) {
        if (state.coupons >= 1) {
          deny('Coupon ' + COUPON_CODE + ' is single-use and has already been applied to this order.', true);
          return;
        }
        state.coupons = 1;
        invalidateReview('coupon changed');
        log('ok', 'Coupon ' + COUPON_CODE + ' applied once (20% off).');
      } else {
        state.coupons += 1;
        log('ok', 'Coupon ' + COUPON_CODE + ' applied (now ' + state.coupons + ' times). No single-use check.');
      }
      render();
    }

    function reviewOrder() {
      if (sw.isFixed()) {
        if (state.cart.length === 0) { deny('Your cart is empty.', false); return; }
        var err = validateCartFixed();
        if (err) { deny(err, true); return; }
        state.reviewed = { total: totalFixed() };
        log('ok', 'Order reviewed. Total ' + money(state.reviewed.total) + ' recalculated from the trusted price list.');
      } else {
        state.reviewed = { total: totalVulnerable() };
        log('ok', 'Order reviewed. Total locked at ' + money(state.reviewed.total) + ' (the app will not re-check it).');
      }
      render();
    }

    function finishOrder(charge) {
      var legit = legitimateTotal();
      var solvedNow = !sw.isFixed() && charge < legit - 0.005;
      state.balance = round2(state.balance - charge);
      log('ok', 'ORDER PLACED. Charged ' + money(charge) + '. Wallet is now ' + money(state.balance) + '.');
      state.cart = [];
      state.coupons = 0;
      state.reviewed = null;
      if (solvedNow) {
        markSolved(LAB);
        setBanner('solved', 'You paid ' + money(charge) + ' for goods worth at least ' + money(legit) + '. ' + LAB_TEXT.logic.solved);
        log('info', 'Illegitimate price detected: paid ' + money(charge) + ', honest price ' + money(legit) + '.');
      }
      render();
    }

    function placeOrder() {
      if (sw.isFixed()) {
        if (state.cart.length === 0) { deny('Your cart is empty.', false); return; }
        var err = validateCartFixed();
        if (err) { deny(err, true); return; }
        if (!state.reviewed) { deny('Workflow violation: the order must be reviewed before payment.', true); return; }
        var total = totalFixed();
        if (total !== state.reviewed.total) {
          deny('Price mismatch: the total was ' + money(state.reviewed.total) + ' at review but is ' + money(total) + ' now. Review the order again.', true);
          return;
        }
        if (total > state.balance) { deny('Insufficient funds: total ' + money(total) + ', wallet ' + money(state.balance) + '.', false); return; }
        finishOrder(total);
      } else {
        // VULNERABLE: trusts the locked total, or whatever the cart says right now.
        var charge = state.reviewed ? state.reviewed.total : totalVulnerable();
        if (charge > state.balance) { log('deny', 'REJECTED: insufficient funds (total ' + money(charge) + ', wallet ' + money(state.balance) + ').'); return; }
        finishOrder(charge);
      }
    }

    /* ----- rendering ----- */
    function renderProducts() {
      productList.textContent = '';
      PRODUCTS.forEach(function (p) {
        var item = document.createElement('div');
        item.className = 'product';

        var name = document.createElement('span');
        name.className = 'p-name';
        name.textContent = p.name;
        var price = document.createElement('span');
        price.className = 'p-price';
        price.textContent = money(p.price);

        var controls = document.createElement('div');
        controls.className = 'p-controls';
        var qty = document.createElement('input');
        qty.type = 'number';
        qty.step = 'any';
        qty.value = '1';
        qty.className = 'input qty';
        qty.setAttribute('aria-label', 'Quantity of ' + p.name);
        qty.setAttribute('data-qty', p.id);
        var add = document.createElement('button');
        add.type = 'button';
        add.className = 'btn btn-outline btn-sm';
        add.setAttribute('data-add', p.id);
        add.textContent = 'Add to cart';
        controls.appendChild(qty);
        controls.appendChild(add);

        item.appendChild(name);
        item.appendChild(price);
        item.appendChild(controls);
        productList.appendChild(item);
      });
    }

    function render() {
      // Cart rows
      cartBody.textContent = '';
      state.cart.forEach(function (l) {
        var unit = sw.isFixed() ? TRUSTED_PRICES[l.id] : l.price;
        var tr = document.createElement('tr');
        [l.name, String(l.qty), money(round2(unit * l.qty))].forEach(function (text, i) {
          var td = document.createElement('td');
          if (i > 0) { td.className = 'num'; }
          td.textContent = text;
          tr.appendChild(td);
        });
        var tdBtn = document.createElement('td');
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'btn btn-outline btn-sm';
        rm.setAttribute('data-remove', l.id);
        rm.setAttribute('aria-label', 'Remove ' + l.name);
        rm.textContent = 'Remove';
        tdBtn.appendChild(rm);
        tr.appendChild(tdBtn);
        cartBody.appendChild(tr);
      });
      cartEmpty.hidden = state.cart.length > 0;

      outTotal.textContent = money(currentTotal());
      outCoupons.textContent = String(state.coupons);
      outBalance.textContent = money(state.balance);
      outReview.textContent = state.reviewed ? 'Reviewed (locked at ' + money(state.reviewed.total) + ')' : 'Not reviewed';
    }

    function resetLab() {
      state = freshState();
      logEl.textContent = '';
      clearSolved(LAB);
      sw.set(false, true);
      setCodePanel(LOGIC_VULN_CODE, false);
      renderBanner(LAB);
      log('info', 'Lab reset. Wallet ' + money(START_BALANCE) + ', cart empty.');
      render();
    }

    /* ----- events (no inline handlers) ----- */
    productList.addEventListener('click', function (event) {
      var btn = event.target.closest('button[data-add]');
      if (!btn) { return; }
      var id = btn.getAttribute('data-add');
      var qtyInput = $('input[data-qty="' + id + '"]', productList);
      addToCart(id, qtyInput.value);
    });
    cartBody.addEventListener('click', function (event) {
      var btn = event.target.closest('button[data-remove]');
      if (btn) { removeLine(btn.getAttribute('data-remove')); }
    });
    couponForm.addEventListener('submit', function (event) {
      event.preventDefault();
      applyCoupon(couponInput.value);
    });
    btnReview.addEventListener('click', reviewOrder);
    btnPlace.addEventListener('click', placeOrder);
    btnReset.addEventListener('click', resetLab);

    renderProducts();
    setCodePanel(sw.isFixed() ? LOGIC_FIXED_CODE : LOGIC_VULN_CODE, sw.isFixed());
    renderBanner(LAB);
    log('info', 'Shop ready. Wallet ' + money(START_BALANCE) + '. Coupon code: ' + COUPON_CODE + '. Mode: ' + (sw.isFixed() ? 'PATCHED' : 'VULNERABLE') + '.');
    render();
  }

  /* -------------------------------------------------------------------
     7. LAB 3 — CLIENT-SIDE PROTOTYPE POLLUTION
     ------------------------------------------------------------------- */
  var PROTO_VULN_CODE =
    '// VULNERABLE: recursive merge walks into "__proto__" / "constructor.prototype".\n' +
    'function merge(target, source) {\n' +
    '  for (const key in source) {\n' +
    '    if (typeof source[key] === "object" && source[key] !== null) {\n' +
    '      if (typeof target[key] !== "object") target[key] = {};\n' +
    '      merge(target[key], source[key]);   // target["__proto__"] IS Object.prototype\n' +
    '    } else {\n' +
    '      target[key] = source[key];\n' +
    '    }\n' +
    '  }\n' +
    '  return target;\n' +
    '}\n' +
    '\n' +
    'const config = merge({ theme: "light" }, userInput);\n' +
    '// Gadget: reads a property that was never set on config itself.\n' +
    'if (config.isAdmin) showAdminPanel();';

  var PROTO_FIXED_CODE =
    '// FIXED: block dangerous keys, only copy own keys, use a prototype-less target.\n' +
    'const FORBIDDEN = ["__proto__", "constructor", "prototype"];\n' +
    '\n' +
    'function safeMerge(target, source) {\n' +
    '  for (const key of Object.keys(source)) {      // own enumerable keys only\n' +
    '    if (FORBIDDEN.includes(key)) continue;       // never walk into the prototype\n' +
    '    const value = source[key];\n' +
    '    if (typeof value === "object" && value !== null) {\n' +
    '      if (typeof target[key] !== "object") target[key] = Object.create(null);\n' +
    '      safeMerge(target[key], value);\n' +
    '    } else {\n' +
    '      target[key] = value;\n' +
    '    }\n' +
    '  }\n' +
    '  return target;\n' +
    '}\n' +
    '\n' +
    'const config = safeMerge(Object.create(null), userInput);   // no prototype to inherit from\n' +
    'if (config.isAdmin) showAdminPanel();                        // undefined: gadget stays shut';

  function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  // Defines an OWN property, even for the name "__proto__". A plain
  // assignment would change the prototype instead; defineProperty does not.
  function defineOwn(obj, key, value) {
    Object.defineProperty(obj, key, { value: value, enumerable: true, writable: true, configurable: true });
  }

  function safeDecode(text) {
    try { return decodeURIComponent(text.replace(/\+/g, ' ')); }
    catch (err) { return text; }
  }

  // Parses "a=1&b[c]=2&__proto__[x]=true" into a nested object. The name
  // "__proto__" becomes an own key, exactly like JSON.parse would create it.
  function parseQueryString(raw) {
    var tree = {};
    var text = raw.trim().replace(/^[?#]/, '');
    if (!text) { return tree; }
    text.split('&').forEach(function (pair) {
      if (!pair) { return; }
      var eq = pair.indexOf('=');
      var key = safeDecode(eq < 0 ? pair : pair.slice(0, eq));
      var rawValue = safeDecode(eq < 0 ? '' : pair.slice(eq + 1));
      var value = rawValue === 'true' ? true : rawValue === 'false' ? false : rawValue;
      var path = key.replace(/\]/g, '').split('[').filter(function (p) { return p !== ''; });
      if (path.length === 0) { return; }
      var cursor = tree;
      for (var i = 0; i < path.length - 1; i++) {
        var k = path[i];
        if (!hasOwn(cursor, k) || typeof cursor[k] !== 'object' || cursor[k] === null) { defineOwn(cursor, k, {}); }
        cursor = cursor[k];
      }
      defineOwn(cursor, path[path.length - 1], value);
    });
    return tree;
  }

  // VULNERABLE deep merge (the classic bug).
  function vulnerableMerge(target, source) {
    for (var key in source) {
      var value = source[key];
      if (typeof value === 'object' && value !== null) {
        var current = target[key];
        if (!(current !== null && (typeof current === 'object' || typeof current === 'function'))) {
          target[key] = {};
        }
        vulnerableMerge(target[key], value);
      } else {
        target[key] = value;
      }
    }
    return target;
  }

  var FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

  // FIXED deep merge: own keys only, forbidden keys skipped and reported.
  function safeMerge(target, source, onBlocked) {
    Object.keys(source).forEach(function (key) {
      if (FORBIDDEN_KEYS.indexOf(key) !== -1) { onBlocked(key); return; }
      var value = source[key];
      if (typeof value === 'object' && value !== null) {
        if (typeof target[key] !== 'object' || target[key] === null) { target[key] = Object.create(null); }
        safeMerge(target[key], value, onBlocked);
      } else {
        target[key] = value;
      }
    });
    return target;
  }

  // Names of properties that exist on Object.prototype now but not at page load.
  function pollutedKeys() {
    return Object.getOwnPropertyNames(Object.prototype).filter(function (k) { return PROTO_BASELINE.indexOf(k) === -1; });
  }

  function initProtoLab() {
    var LAB = 'proto';
    var DEFAULTS = { theme: 'light', language: 'en', showTips: true };

    var form = $('#proto-form');
    var input = $('#proto-input');
    var btnBenign = $('#btn-benign');
    var btnUrl = $('#btn-url');
    var outParsed = $('#out-parsed');
    var outConfig = $('#out-config');
    var outGadget = $('#out-gadget');
    var outProto = $('#out-proto');
    var adminPanel = $('#admin-panel');
    var lockedPanel = $('#locked-panel');
    var outNote = $('#out-note');
    var btnReset = $('#reset-lab');

    var sw = initFixSwitch(LAB, onModeChange);

    function onModeChange(fixed) {
      setCodePanel(fixed ? PROTO_FIXED_CODE : PROTO_VULN_CODE, fixed);
      renderBanner(LAB);
      renderProtoState();
    }

    // Live view of Object.prototype
    function renderProtoState() {
      var keys = pollutedKeys();
      var lines = [];
      if (keys.length === 0) {
        lines.push('Object.prototype is clean.');
      } else {
        lines.push('POLLUTED keys on Object.prototype:');
        keys.forEach(function (k) {
          var shown;
          try { shown = JSON.stringify(Object.prototype[k]); } catch (err) { shown = String(Object.prototype[k]); }
          lines.push('  ' + k + ' = ' + shown);
        });
        if (sw.isFixed()) { lines.push('(left over from an earlier attack: use "Reset lab" to clean it)'); }
      }
      lines.push('');
      lines.push('Probe: ({}).isAdmin  →  ' + String(({}).isAdmin));
      outProto.textContent = lines.join('\n');
    }

    function showJson(el, obj) {
      try { el.textContent = JSON.stringify(obj, null, 2); }
      catch (err) { el.textContent = String(obj); }
    }

    // Accepts a query string (?a=1&__proto__[x]=y) or a JSON object.
    function parseUserInput(text) {
      var trimmed = text.trim();
      if (trimmed.charAt(0) === '{') { return JSON.parse(trimmed); }   // JSON.parse makes "__proto__" an own key
      return parseQueryString(trimmed);
    }

    // The app strips a top-level "isAdmin" from user input. It does NOT look at
    // nested keys, which is exactly what the pollution payload abuses.
    function sanitizeTopLevel(obj) {
      if (hasOwn(obj, 'isAdmin')) {
        delete obj.isAdmin;
        return true;
      }
      return false;
    }

    function lockAdminPanel() { adminPanel.hidden = true; lockedPanel.hidden = false; }
    function unlockAdminPanel() { adminPanel.hidden = false; lockedPanel.hidden = true; }

    function applySettings(text, source) {
      var fixed = sw.isFixed();
      outNote.textContent = '';
      lockAdminPanel();

      var userObj;
      try {
        userObj = parseUserInput(text);
      } catch (err) {
        outParsed.textContent = 'Could not parse input: ' + err.message;
        outConfig.textContent = '';
        outGadget.textContent = '';
        renderProtoState();
        return;
      }
      if (userObj === null || typeof userObj !== 'object' || Array.isArray(userObj)) {
        outParsed.textContent = 'Input must be an object, e.g. theme=dark or {"theme":"dark"}.';
        return;
      }

      showJson(outParsed, userObj);
      if (sanitizeTopLevel(userObj)) {
        outNote.textContent = 'The app removed a top-level "isAdmin" key from your input. Direct privilege escalation is not allowed.';
      }

      // Build the config with the vulnerable or the patched merge.
      var config;
      var blocked = [];
      if (!fixed) {
        config = vulnerableMerge({ theme: DEFAULTS.theme, language: DEFAULTS.language, showTips: DEFAULTS.showTips }, userObj);
      } else {
        config = Object.create(null);                       // no prototype: nothing to inherit
        Object.keys(DEFAULTS).forEach(function (k) { config[k] = DEFAULTS[k]; });
        safeMerge(config, userObj, function (key) { if (blocked.indexOf(key) === -1) { blocked.push(key); } });
      }
      showJson(outConfig, config);

      // THE GADGET: reads config.isAdmin, which the user can never set directly.
      var value = config.isAdmin;
      var origin = hasOwn(config, 'isAdmin') ? 'own property' : (value === undefined ? 'not set' : 'inherited from the prototype chain');
      outGadget.textContent = 'config.isAdmin = ' + String(value) + '  (' + origin + ')';

      if (value) {
        unlockAdminPanel();
        if (!fixed) {
          markSolved(LAB);
          setBanner('solved', LAB_TEXT.proto.solved);
        }
      }

      if (fixed && blocked.length > 0) {
        setBanner('blocked', 'The patched merge skipped the forbidden key(s) ' + blocked.map(function (k) { return '"' + k + '"'; }).join(', ') +
          ' and builds config on a prototype-less object, so Object.prototype stays clean and the gadget never fires.');
      } else if (!value) {
        renderBanner(LAB);
      }

      renderProtoState();
    }

    function resetLab() {
      // Remove every property that was added to Object.prototype
      pollutedKeys().forEach(function (k) { try { delete Object.prototype[k]; } catch (err) { /* ignore */ } });
      input.value = '';
      outParsed.textContent = '';
      outConfig.textContent = '';
      outGadget.textContent = '';
      outNote.textContent = '';
      lockAdminPanel();
      clearSolved(LAB);
      sw.set(false, true);
      // Drop the payload from the address bar so a reload does not re-apply it.
      try { window.history.replaceState(null, '', window.location.pathname); } catch (err) { /* file:// may refuse */ }
      onModeChange(false);
    }

    form.addEventListener('submit', function (event) { event.preventDefault(); applySettings(input.value, 'form'); });
    btnBenign.addEventListener('click', function () { input.value = 'theme=dark&language=ar'; input.focus(); });
    btnUrl.addEventListener('click', function () {
      var text = input.value.trim();
      if (text.charAt(0) === '{') {
        outNote.textContent = 'URL mode needs a query string such as ?theme=dark, not JSON.';
        return;
      }
      window.location.search = '?' + text.replace(/^[?#]/, '');   // page reloads and reads location.search
    });
    btnReset.addEventListener('click', resetLab);

    // Editing only the #hash in the address bar does not reload the page,
    // so listen for it and apply the new payload.
    window.addEventListener('hashchange', function () {
      var hash = window.location.hash;
      if (hash && hash.length > 1) {
        input.value = hash;
        outNote.textContent = 'Settings were read from the address bar (location.hash).';
        applySettings(hash, 'url');
      }
    });

    // Support payloads delivered through the URL (?query or #hash).
    var fromUrl = window.location.search || window.location.hash;
    onModeChange(sw.isFixed());
    lockAdminPanel();
    if (fromUrl && fromUrl.length > 1) {
      input.value = fromUrl;
      outNote.textContent = 'Settings were read from the address bar (' + (window.location.search ? 'location.search' : 'location.hash') + ').';
      applySettings(fromUrl, 'url');
    }
  }

  /* -------------------------------------------------------------------
     8. BOOTSTRAP
     ------------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    initNavbar();
    var page = document.body.getAttribute('data-page');
    if (page === 'home') { initHome(); }
    else if (page === 'redos-lab') { initReDoSLab(); }
    else if (page === 'logic-lab') { initLogicLab(); }
    else if (page === 'proto-lab') { initProtoLab(); }
  });
})();
