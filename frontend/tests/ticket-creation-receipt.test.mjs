import assert from 'node:assert/strict';
import {ticketCreationMessage} from '../src/components/ticketCreationReceipt.ts';
assert.match(ticketCreationMessage({numero_caso:'123',responsable:'Martha Carbajal'}),/123.*Martha Carbajal/);
assert.match(ticketCreationMessage({numero_caso:'123',responsable:null}),/Pendiente de asignación/);
assert.match(ticketCreationMessage(null),/levantado correctamente.*No fue posible consultar/);
console.log('PASS: assigned receipt, pending assignment, read failure without duplicate creation.');
