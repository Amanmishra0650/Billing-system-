import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

test('new invoices enforce 9% CGST and 9% SGST and preserve saved totals', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yogi-tax-'));
  let server;
  try {
    const setup = spawnSync(process.execPath, [fileURLToPath(new URL('../setup.mjs', import.meta.url)), 'test', 'test-password-only'], { cwd: directory });
    assert.equal(setup.status, 0);
    server = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url))], { cwd: directory, env: { ...process.env, PORT: '32187' } });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000);
      server.stdout.on('data', data => { if (data.toString().includes('Billing app listening')) { clearTimeout(timer); resolve(); } });
      server.once('error', reject);
      server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    });
    const base = 'http://localhost:32187';
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'test', password: 'test-password-only' }) });
    assert.equal(login.status, 200);
    const headers = { 'Content-Type': 'application/json', Cookie: login.headers.get('set-cookie').split(';')[0] };
    for (const rate of [undefined, 250, 0]) {
      const preview = await (await fetch(`${base}/api/registration-preview`, { headers })).json();
      assert.match(preview.registration, /^YPC-UID-\d{6}$/);
      const response = await fetch(`${base}/api/invoices`, { method: 'POST', headers, body: JSON.stringify({ patient_name: 'Test only', payment_mode: 'CASH', paid_paise: 0, tax_rate_bps: rate, items: [{ description: 'Service', quantity: 1, unit_price_paise: 100000, type: 'Service' }] }) });
      assert.equal(response.status, 201);
      const invoice = await response.json();
      assert.equal(invoice.registration, `YPC-UID-${String(invoice.id).padStart(6, '0')}`);
      assert.equal(invoice.registration, preview.registration);
      assert.equal(invoice.tax_rate_bps, 900);
      assert.equal(invoice.cgst_paise, 9000);
      assert.equal(invoice.sgst_paise, 9000);
      assert.equal(invoice.total_paise, 118000);
      const saved = await (await fetch(`${base}/api/invoices/${invoice.id}`, { headers })).json();
      assert.equal(saved.total_paise, 118000);
      assert.equal(saved.registration, invoice.registration);
      const send = (suffix, data, authorized = true) => fetch(`${base}/api/invoices/${invoice.id}/${suffix}`, { method: 'POST', headers: authorized ? headers : { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      assert.equal((await send('payment-status', { status: 'paid' }, false)).status, 401);
      assert.equal((await send('payment-status', { status: 'invalid' })).status, 400);
      assert.equal((await send('payments', { amount_paise: 10000, mode: 'CASH' })).status, 201);
      for (const status of ['paid', 'paid', 'unpaid', 'unpaid']) {
        const changed = await send('payment-status', { status });
        assert.equal(changed.status, 200);
        const record = await changed.json();
        assert.equal(record.received_paise, status === 'paid' ? 118000 : 0);
        assert.equal(record.balance_paise, status === 'paid' ? 0 : 118000);
        assert.equal(record.payments.length, 1, 'original payment is preserved');
      }
      const reopened = await (await fetch(`${base}/api/invoices/${invoice.id}`, { headers })).json();
      assert.equal(reopened.received_paise, 0);
      assert.equal(reopened.payment_adjustments.length, 2, 'repeated status changes are idempotent');
      const later = await (await send('payments', { amount_paise: 5000, mode: 'CASH' })).json();
      assert.equal(later.received_paise, 5000);
      await send('payment-status', { status: 'unpaid' });
      assert.equal((await send('void', { reason: 'Test invoice only' })).status, 200);
      assert.equal((await send('payment-status', { status: 'paid' })).status, 409);
    }
  } finally {
    if (server && server.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited; }
    await rm(directory, { recursive: true, force: true });
  }
});
