import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItems } from '../items.mjs';

test('calculates line amount from quantity and unit price', () => {
  assert.deepEqual(normalizeItems([{ type:'Medicine', description:'Tablet A', quantity:3, unit_price_paise:12500 }]), [{ type:'Medicine', description:'Tablet A', quantity:3, unit_price_paise:12500, amount_paise:37500 }]);
});

test('keeps old invoices compatible as quantity one', () => {
  assert.deepEqual(normalizeItems([{ description:'Laser Treatment', amount_paise:2500000 }]), [{ type:'Treatment', description:'Laser Treatment', quantity:1, unit_price_paise:2500000, amount_paise:2500000 }]);
});

test('rejects zero quantity', () => {
  assert.throws(() => normalizeItems([{ type:'Medicine', description:'Tablet A', quantity:0, unit_price_paise:1000 }]), /valid quantity/i);
});
