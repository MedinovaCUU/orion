import assert from 'node:assert/strict';
import { filterTicketsForViewer, isTicketVisibleToViewer, planningPeopleOnTicket } from '../src/components/ticketVisibility.ts';
const planning = (user_id, meta, id = user_id + '-plan') => ({ id, user_id, descripcion: `Cliente: Hospital\n[METADATA_PLANEACION]${JSON.stringify(meta)}` });
const tickets = [
  planning('vilchis', { ingeniero_csv: 'Ricardo Vilchis / Diego García García' }, 'plan-vilchis-diego'),
  planning('alfredo', { ingeniero_csv: 'Alfredo Acevedo' }, 'plan-alfredo'),
  planning('vilchis', { ingeniero_csv: 'Ricardo Vilchis', companions_csv: ['Alfredo Acevedo'] }, 'plan-companion'),
  planning(null, { ingeniero_csv: 'ALFREDO  ACEVEDO' }, 'plan-unaccented'),
  { id: 'support-assigned', user_id: null, descripcion: 'Falla de lectura' },
  { id: 'support-unassigned', user_id: null, descripcion: 'Error de bomba' },
  { id: 'support-own', user_id: 'alfredo', descripcion: 'Alta propia' },
];
const viewer = (overrides) => ({ userId: 'alfredo', role: 'tecnico', fullName: 'Alfredo Acevedo', assignedTicketIds: new Set(['support-assigned']), ...overrides });
const ids = (list) => list.map((ticket) => ticket.id);
assert.deepEqual(ids(filterTicketsForViewer(tickets, viewer())), ['plan-alfredo', 'plan-companion', 'plan-unaccented', 'support-assigned', 'support-own']);
assert.deepEqual(ids(filterTicketsForViewer(tickets, viewer({ userId: 'diego', fullName: 'Diego Garcia Garcia', assignedTicketIds: new Set() }))), ['plan-vilchis-diego']);
assert.deepEqual(ids(filterTicketsForViewer(tickets, viewer({ userId: 'vilchis', fullName: 'Ricardo Vilchis', assignedTicketIds: new Set() }))), ['plan-vilchis-diego', 'plan-companion']);
assert.equal(filterTicketsForViewer(tickets, viewer({ role: 'admin', userId: 'admin', fullName: 'Admin' })), tickets, 'admins keep every case');
assert.deepEqual(ids(filterTicketsForViewer(tickets, viewer({ userId: null }))), [], 'no session sees nothing');
assert.deepEqual(ids(filterTicketsForViewer(tickets, viewer({ fullName: null, assignedTicketIds: new Set() }))), ['plan-alfredo', 'support-own'], 'missing profile name still keeps own records');
assert.deepEqual(ids(filterTicketsForViewer(tickets, viewer({ userId: 'cliente', role: 'cliente', fullName: 'Laboratorio Norte', assignedTicketIds: new Set() }))), []);
assert.equal(isTicketVisibleToViewer({ id: 'x', user_id: null, descripcion: '[METADATA_PLANEACION]{"ingeniero_csv":"Alfredo"}' }, viewer()), false, 'first name alone is not the profile');
assert.equal(planningPeopleOnTicket('Sin metadatos'), null);
assert.deepEqual(planningPeopleOnTicket('[METADATA_PLANEACION]{"ingeniero_csv":"Ricardo Vilchis / Diego García García","companions_csv":["Alfredo Acevedo"]}'), ['Ricardo Vilchis', 'Diego García García', 'Alfredo Acevedo']);
assert.equal(isTicketVisibleToViewer({ id: 'y', user_id: null, descripcion: '[METADATA_PLANEACION]{"ingeniero_csv":"Vilchis, Ricardo"}' }, viewer()), false);
assert.equal(isTicketVisibleToViewer({ id: 'z', user_id: null, descripcion: '[METADATA_PLANEACION]{"ingeniero_csv":"Diego Garcia Garcia y Alfredo Acevedo"}' }, viewer()), true, 'conjunction lists');
console.log('PASS: technicians see assigned, own and planning cases that name them; admins see everything');
