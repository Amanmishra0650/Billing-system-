import test from 'node:test';
import assert from 'node:assert/strict';
import { printPaper } from '../public/print-ready.js';

test('printing waits for logo decoding and fonts before opening the PDF dialog', async () => {
  let ready, printed=false;
  const decoding=new Promise(resolve=>{ready=resolve;});
  const root={querySelectorAll:()=>[{decode:()=>decoding}],ownerDocument:{fonts:{ready:Promise.resolve()}}};
  const pending=printPaper(root,()=>{printed=true;});
  await Promise.resolve();
  assert.equal(printed,false);
  ready();await pending;
  assert.equal(printed,true);
});

test('a missing logo prevents printing a silently incomplete slip', async () => {
  const root={querySelectorAll:()=>[{decode:()=>Promise.reject(Error('missing image'))}],ownerDocument:{}};
  await assert.rejects(printPaper(root,()=>assert.fail('must not print')),/logo/i);
});

test('PDF printing uses the patient name as its title and restores the app title', async () => {
  const doc={title:'Yogi Piles Billing',fonts:{ready:Promise.resolve()}};
  const paper={querySelectorAll:()=>[],ownerDocument:doc};
  await printPaper(paper,()=>assert.equal(doc.title,'Aman Kumar Mishra'),{filename:'Aman Kumar Mishra'});
  assert.equal(doc.title,'Yogi Piles Billing');
  await assert.rejects(printPaper(paper,()=>{throw Error('cancelled');},{filename:'Aman'}));
  assert.equal(doc.title,'Yogi Piles Billing');
});

test('PDF filenames preserve Hindi names and remove invalid filename characters', async () => {
  const doc={title:'Billing'};
  const paper={querySelectorAll:()=>[],ownerDocument:doc};
  await printPaper(paper,()=>assert.equal(doc.title,'अमन मिश्रा'),{filename:'  अमन / मिश्रा:*?  '});
  assert.equal(doc.title,'Billing');
});
