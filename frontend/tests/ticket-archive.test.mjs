import assert from 'node:assert/strict';
import {
  ARCHIVE_PAGE_SIZE, EMPTY_ARCHIVE_CRITERIA, TICKET_INBOX_DAYS, archiveDatesInvalid, archiveHasCriteria,
  archivePageCount, archiveRpcArgs, inboxSince, isMissingRpc, unpackArchiveRows,
} from '../src/components/ticketArchive.ts';

const now = Date.parse('2026-10-13T18:00:00Z');
assert.equal(inboxSince(now), new Date(now - TICKET_INBOX_DAYS * 86_400_000).toISOString(), 'the inbox window is 30 days back');

assert.equal(archiveHasCriteria(EMPTY_ARCHIVE_CRITERIA), false, 'nothing to look for: no request');
assert.equal(archiveHasCriteria({ ...EMPTY_ARCHIVE_CRITERIA, query: ' B ' }), false, 'one character is not a search');
assert.equal(archiveHasCriteria({ ...EMPTY_ARCHIVE_CRITERIA, query: 'BI' }), true);
assert.equal(archiveHasCriteria({ ...EMPTY_ARCHIVE_CRITERIA, status: 'cerrados' }), true, 'a filter alone browses the archive');
assert.equal(archiveHasCriteria({ ...EMPTY_ARCHIVE_CRITERIA, from: '2024-01-01' }), true);
assert.equal(archiveDatesInvalid({ ...EMPTY_ARCHIVE_CRITERIA, from: '2025-02-01', to: '2025-01-01' }), true);
assert.equal(archiveDatesInvalid({ ...EMPTY_ARCHIVE_CRITERIA, from: '2025-01-01', to: '2025-01-01' }), false);

assert.deepEqual(archiveRpcArgs({ query: '  BIO-2471 ', status: 'cerrados', scope: 'soporte', from: '2024-01-01', to: '' }, 3), {
  p_query: 'BIO-2471', p_status: 'cerrados', p_scope: 'soporte', p_from: '2024-01-01', p_to: null, p_limit: ARCHIVE_PAGE_SIZE, p_offset: 2 * ARCHIVE_PAGE_SIZE,
});
assert.equal(archiveRpcArgs({ ...EMPTY_ARCHIVE_CRITERIA, query: 'x' }, 0).p_query, null, 'short words are not sent');
assert.equal(archiveRpcArgs(EMPTY_ARCHIVE_CRITERIA, 0).p_offset, 0, 'page numbers start at 1');

assert.equal(archivePageCount(0), 1);
assert.equal(archivePageCount(20), 1);
assert.equal(archivePageCount(21), 2);
assert.deepEqual(unpackArchiveRows([{ ticket: { id: 'a' }, total_count: '41' }, { ticket: { id: 'b' }, total_count: '41' }]), { tickets: [{ id: 'a' }, { id: 'b' }], total: 41 }, 'bigint totals arrive as text');
assert.deepEqual(unpackArchiveRows(null), { tickets: [], total: 0 });
assert.equal(isMissingRpc({ code: 'PGRST202' }), true, 'function not deployed yet');
assert.equal(isMissingRpc({ code: '42501' }), false, 'a permission error is a real error');
assert.equal(isMissingRpc(null), false);
console.log('PASS: ticket archive helpers — 30-day window, search activation, RPC arguments, paging and missing-function detection');
