import assert from 'node:assert/strict';
import { parseWhatsAppRecipients } from '../src/components/ticketWhatsAppModel.ts';
assert.deepEqual(parseWhatsAppRecipients('+52 6141772897\n+5216141772897;+1 (202) 555-0184'), ['+526141772897', '+12025550184']);
assert.throws(() => parseWhatsAppRecipients(''));
assert.throws(() => parseWhatsAppRecipients('+52 6141772897, not-a-phone'));
assert.throws(() => parseWhatsAppRecipients(Array.from({ length: 21 }, (_, i) => `+1202555${String(i).padStart(4, '0')}`).join('\n')));
console.log('PASS: recipient normalization, duplicates, invalid batches and batch limit');
