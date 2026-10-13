import assert from 'node:assert/strict';
import {descriptionIssue, nameIssue, phoneDigits, phoneIssue, serialFamily, serialIssue, serialKey, serialStatusMessage} from '../src/components/publicPortal.ts';

// Same keys as portal_serial_key in the database.
assert.equal(serialKey('SN: 83400-1902'), '834001902');
assert.equal(serialKey(' s/n 83105 c 1526 '), '83105C1526');
assert.equal(serialKey('No. de serie 832002677'), '832002677');
assert.equal(serialKey('EU-2270780'), 'EU2270780');

assert.equal(serialIssue(''), 'vacio');
assert.equal(serialIssue('9'), 'formato');
assert.equal(serialIssue('HOLAMUNDO'), 'formato');
assert.equal(serialIssue('0108435287131055'), 'producto');
assert.equal(serialIssue('07965'), 'incompleto');
assert.equal(serialIssue('834001902'), null);
assert.equal(serialIssue('A2000001'), null);
assert.equal(serialFamily('834001902'), 'BA400');
assert.equal(serialFamily('832002677'), 'BA200');
assert.equal(serialFamily('83105C1526'), 'A15');
assert.equal(serialFamily('EU2270780'), null);
assert.match(serialStatusMessage('no_encontrado', 'BA400'), /equipos BA400 registrados.*número de serie correcto/);
assert.match(serialStatusMessage('incompleto'), /REF 83105 y SN 01234 se escriben 8310501234/);
console.log('PASS: serial keys, format issues, model family and messages');

assert.equal(phoneDigits('+52 614 123 4567'), '6141234567');
assert.equal(phoneDigits('+52 1 614 123 4567'), '6141234567');
assert.equal(phoneDigits('(614) 123-4567 ext 2'), '6141234567');
assert.equal(phoneIssue('6141234567'), null);
for (const bad of ['0141234567', '1141234567', '5555555555', '614123456', '2345678901']) assert.ok(phoneIssue(bad), bad);
assert.equal(nameIssue('María López'), null);
assert.ok(nameIssue('12'));
assert.ok(nameIssue('Q1'));
assert.equal(descriptionIssue('No enciende la lámpara'), null);
assert.ok(descriptionIssue('falla'));
assert.ok(descriptionIssue('x'.repeat(3001)));
console.log('PASS: phone (pasted +52), contact name and description rules');
