import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Álgebra de fuentes de contexto DRI: aplicar y quitar SAT/BPL/Monitoreo/Asesoría sin pisar capturas manuales.
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, cacheDir: 'node_modules/.vite-dri-tests', server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };

const baseForm = () => ({
  equipmentModel: 'BA400', serialNumber: '', eventDate: '2026-10-10', eventType: 'qc_out_of_range', failureDirection: 'high',
  reagentLot: '', controlLot: 'MANUAL-CTRL', calibratorLot: '', calibratorName: '', controlLevel: 'not_applicable',
  selectedQcReferenceId: '', expectedValue: '', obtainedValue: '', reagentExpiryDate: '', reagentOpenedAt: '', ambientTemperatureC: '',
  observations: 'Nota del ingeniero.', failedReagentIds: ['GLU'], correctReagentIds: ['ALB'],
  reagentMeasurements: { GLU: { reagentId: 'GLU', obtainedValue: '120', blankAbsorbance: '', source: 'manual', updatedAt: '2026-10-10T00:00:00.000Z' } },
  serviceTests: [], evidenceItems: [],
  signals: { intermittentPattern: false, normalCurvesObserved: false, opticalRejectObserved: false, waterSensitivePattern: false },
  bplEvidence: null,
});

try {
  const { applyFormPatch, revertFormPatch, replaceTaggedObservationBlock, readTaggedObservationBlock, chainReceiptsAfterRemoval } = await vite.ssrLoadModule('/src/modules/dri/utils/contextSources.ts');

  const satPatch = {
    sourceKind: 'sat', sourceId: 'abc123', label: 'SAT demo',
    fields: { serialNumber: '834001234', controlLot: 'SAT-CTRL', reagentLot: 'SAT-RGT' },
    forceFields: ['serialNumber'],
    failedReagentIds: ['CHOL', 'ALB'], correctReagentIds: ['AST_GOT', 'GLU'],
    reagentMeasurements: {
      GLU: { reagentId: 'GLU', obtainedValue: '999', blankAbsorbance: '', source: 'auto_import', updatedAt: null, sourceResultId: 'r1' },
      CHOL: { reagentId: 'CHOL', obtainedValue: '250', blankAbsorbance: '', source: 'auto_import', updatedAt: null, sourceResultId: 'r2' },
    },
    signals: { normalCurvesObserved: true },
    observationBlock: { tag: 'SAT', text: 'reporte.A400\nCobertura: 10/12 archivos.' },
    evidenceItems: [{ id: 'sat-abc123', type: 'report', title: 'SAT', value: 'x', note: '' }],
    serviceTests: [{ utilityId: 'photometry', label: 'Photometry', result: 'abnormal', observedValue: '', notes: 'desde SAT' }],
  };

  const applied = applyFormPatch(baseForm(), satPatch, '2026-10-10T10:00:00.000Z');
  check('fill mode keeps manual control lot, fills empty reagent lot, forces serial', () => {
    assert.equal(applied.form.controlLot, 'MANUAL-CTRL');
    assert.equal(applied.form.reagentLot, 'SAT-RGT');
    assert.equal(applied.form.serialNumber, '834001234');
    assert.deepEqual(applied.receipt.fields.map((f) => f.key).sort(), ['reagentLot', 'serialNumber']);
  });
  check('failed wins over correct; manual failed GLU is not demoted to correct by the source', () => {
    assert.deepEqual([...applied.form.failedReagentIds].sort(), ['ALB', 'CHOL', 'GLU']);
    assert.deepEqual([...applied.form.correctReagentIds].sort(), ['AST_GOT']);
  });
  check('manual measurement with a value is preserved; new imported measurement is added', () => {
    assert.equal(applied.form.reagentMeasurements.GLU.obtainedValue, '120');
    assert.equal(applied.form.reagentMeasurements.CHOL.obtainedValue, '250');
    assert.equal(applied.receipt.measurements.length, 1);
  });
  check('tagged observation block is appended after manual text', () => {
    assert.match(applied.form.observations, /^Nota del ingeniero\.\n\n\[SAT:abc123\] reporte\.A400\nCobertura/);
    assert.equal(readTaggedObservationBlock(applied.form.observations, 'SAT').split('\n').length, 2);
  });
  check('reagent bottles from a source replace the case bottles and come back on revert', () => {
    const fixtureBottle = { testName: 'GLUCOSE', reagentId: 'GLU', reagentRole: 'R1', techniqueCode: '503', lot: '00002', expiresAt: '2027-10-31', barcode: 'FIX', bottleCount: 1, firstSeenAt: '2027-03-01T00:00:00.000Z', openedAt: '2027-03-01T00:00:00.000Z', lastSeenAt: null, pipettingCount: 10, lotFactsKey: null };
    const satBottle = { ...fixtureBottle, lot: '00005', expiresAt: '2028-03-31', barcode: 'SAT', lotFactsKey: '21503:0001935' };
    const withBottles = applyFormPatch({ ...baseForm(), reagentBottles: [fixtureBottle] }, { ...satPatch, reagentBottles: [satBottle] }, '2026-10-10T10:00:00.000Z');
    assert.equal(withBottles.form.reagentBottles.length, 1);
    assert.equal(withBottles.form.reagentBottles[0].barcode, 'SAT');
    assert.equal(withBottles.receipt.reagentBottlesApplied, true);
    const reverted = revertFormPatch(withBottles.form, withBottles.receipt);
    assert.deepEqual(reverted.reagentBottles, [fixtureBottle], 'previous bottles restored');
    const fresh = applyFormPatch(baseForm(), { ...satPatch, reagentBottles: [satBottle] }, '2026-10-10T10:00:00.000Z');
    assert.equal(revertFormPatch(fresh.form, fresh.receipt).reagentBottles, null, 'nothing before → null after');
    const replaced = { ...fresh.form, reagentBottles: [{ ...satBottle, barcode: 'OTHER' }] };
    assert.equal(revertFormPatch(replaced, fresh.receipt).reagentBottles[0].barcode, 'OTHER', 'bottles written by someone else are left alone');
  });
  check('a source with an empty bottle array clears demo bottles and gives them back on removal; null leaves them', () => {
    const demoBottle = { testName: 'GLUCOSE', reagentId: 'GLU', reagentRole: 'R1', techniqueCode: '503', lot: '00002', expiresAt: '2027-10-31', barcode: 'DEMO', bottleCount: 1, firstSeenAt: null, openedAt: null, lastSeenAt: null, pipettingCount: 0, lotFactsKey: null };
    const demo = { ...baseForm(), reagentBottles: [demoBottle] };
    const emptied = applyFormPatch(demo, { ...satPatch, reagentBottles: [] }, '2026-10-10T10:00:00.000Z');
    assert.equal(emptied.form.reagentBottles, null, 'SAT without barcodes owns the slot');
    assert.equal(emptied.receipt.reagentBottlesApplied, true);
    assert.deepEqual(revertFormPatch(emptied.form, emptied.receipt).reagentBottles, [demoBottle]);
    const untouched = applyFormPatch(demo, { ...satPatch, reagentBottles: null }, '2026-10-10T10:00:00.000Z');
    assert.deepEqual(untouched.form.reagentBottles, [demoBottle], 'sources without a bottle slot (BPL, Monitoreo) leave them');
    assert.equal(untouched.receipt.reagentBottlesApplied, false);
    const nothing = applyFormPatch(baseForm(), { ...satPatch, reagentBottles: [] }, '2026-10-10T10:00:00.000Z');
    assert.equal(nothing.receipt.reagentBottlesApplied, false, 'empty over empty records nothing');
  });
  check('apply → remove → apply again restores the pre-source bottles each time', () => {
    const demoBottle = { testName: 'GLUCOSE', reagentId: 'GLU', reagentRole: 'R1', techniqueCode: '503', lot: '00002', expiresAt: '2027-10-31', barcode: 'DEMO', bottleCount: 1, firstSeenAt: null, openedAt: null, lastSeenAt: null, pipettingCount: 0, lotFactsKey: null };
    const satBottle = { ...demoBottle, lot: '00005', barcode: 'SAT' };
    let form = { ...baseForm(), reagentBottles: [demoBottle] };
    for (let round = 0; round < 2; round += 1) {
      const applied = applyFormPatch(form, { ...satPatch, reagentBottles: [satBottle] }, '2026-10-10T10:00:00.000Z');
      assert.equal(applied.form.reagentBottles[0].barcode, 'SAT');
      form = revertFormPatch(applied.form, applied.receipt);
      assert.deepEqual(form.reagentBottles, [demoBottle], `round ${round}`);
    }
  });
  check('evidence item and service test are added with receipt ids', () => {
    assert.equal(applied.form.evidenceItems.length, 1);
    assert.equal(applied.form.serviceTests.length, 1);
    assert.equal(applied.receipt.serviceTestIds.length, 1);
    assert.equal(applied.form.signals.normalCurvesObserved, true);
  });

  const reverted = revertFormPatch(applied.form, applied.receipt);
  check('revert restores the original form exactly', () => {
    assert.deepEqual(reverted, baseForm());
  });

  // Manual edits after applying must survive the revert.
  const edited = {
    ...applied.form,
    reagentLot: 'MANUAL-RGT',
    correctReagentIds: [...applied.form.correctReagentIds.filter((id) => id !== 'AST_GOT')],
    failedReagentIds: [...applied.form.failedReagentIds, 'AST_GOT'],
    observations: `${applied.form.observations}\n\nSegunda nota manual.`,
  };
  const revertedAfterEdit = revertFormPatch(edited, applied.receipt);
  check('revert keeps manual edits made after the source was applied', () => {
    assert.equal(revertedAfterEdit.reagentLot, 'MANUAL-RGT');
    assert.ok(revertedAfterEdit.failedReagentIds.includes('AST_GOT'));
    assert.ok(!revertedAfterEdit.failedReagentIds.includes('CHOL'));
    assert.equal(revertedAfterEdit.observations, 'Nota del ingeniero.\n\nSegunda nota manual.');
    assert.equal(revertedAfterEdit.serialNumber, '');
  });

  // Two sources coexist: removing one leaves the other block intact.
  const bplPatch = { sourceKind: 'bpl', sourceId: '834001234', label: 'BPL', observationBlock: { tag: 'BPL', text: 'Evidencia del monitor · 12 eventos\nControles: 1 rechazada' }, failedReagentIds: ['LDH'] };
  const both = applyFormPatch(applied.form, bplPatch);
  const withoutSat = revertFormPatch(both.form, applied.receipt);
  check('removing SAT keeps the BPL block and BPL reagents', () => {
    assert.equal(readTaggedObservationBlock(withoutSat.observations, 'SAT'), null);
    assert.match(readTaggedObservationBlock(withoutSat.observations, 'BPL'), /12 eventos\nControles/);
    assert.ok(withoutSat.failedReagentIds.includes('LDH'));
    assert.ok(!withoutSat.failedReagentIds.includes('CHOL'));
  });
  check('replaceTaggedObservationBlock replaces in place and removes with null', () => {
    const text = 'a\n\n[SAT:1] uno\nlinea\n\n[BPL:2] dos';
    assert.equal(replaceTaggedObservationBlock(text, 'SAT', '[SAT:3] tres'), 'a\n\n[BPL:2] dos\n\n[SAT:3] tres');
    assert.equal(replaceTaggedObservationBlock(text, 'BPL', null), 'a\n\n[SAT:1] uno\nlinea');
  });

  // A manual line typed right under the block (Enter, no blank line) survives the revert; edited evidence survives too.
  const typedInside = {
    ...applied.form,
    observations: `${applied.form.observations}\nRevisé el filtro 505 nm, correcto.`,
    evidenceItems: applied.form.evidenceItems.map((item) => ({ ...item, note: 'nota manual sobre el reporte' })),
  };
  const revertedInside = revertFormPatch(typedInside, applied.receipt);
  check('revert keeps a manual line typed inside the source block and an edited source evidence item', () => {
    assert.equal(revertedInside.observations, 'Nota del ingeniero.\n\nRevisé el filtro 505 nm, correcto.');
    assert.equal(revertedInside.evidenceItems.length, 1);
    assert.equal(revertedInside.evidenceItems[0].note, 'nota manual sobre el reporte');
  });

  // Receipt chaining: BPL writes serial X, SAT overrides with Y; removing BPL then SAT must not resurrect X.
  const emptySerial = { ...baseForm(), serialNumber: '' };
  const bplFirst = applyFormPatch(emptySerial, { sourceKind: 'bpl', sourceId: 'X', label: 'BPL', fields: { serialNumber: 'X' }, forceFields: ['serialNumber'] });
  const satSecond = applyFormPatch(bplFirst.form, { sourceKind: 'sat', sourceId: 'Y', label: 'SAT', fields: { serialNumber: 'Y' }, forceFields: ['serialNumber'] });
  const afterBplRemoved = revertFormPatch(satSecond.form, bplFirst.receipt);
  const chainedSat = chainReceiptsAfterRemoval(satSecond.receipt, bplFirst.receipt);
  const afterBoth = revertFormPatch(afterBplRemoved, chainedSat);
  check('chained receipts restore the value prior to both sources', () => {
    assert.equal(afterBplRemoved.serialNumber, 'Y');
    assert.equal(afterBoth.serialNumber, '');
  });

  const replaced = applyFormPatch(baseForm(), { sourceKind: 'advisory', sourceId: 'adv1', label: 'Asesoría', failedReagentIds: ['CK'], replaceReagentSelection: true });
  check('replaceReagentSelection clears unmentioned reagents and revert brings them back', () => {
    assert.deepEqual(replaced.form.failedReagentIds, ['CK']);
    assert.deepEqual(replaced.form.correctReagentIds, []);
    assert.deepEqual(revertFormPatch(replaced.form, replaced.receipt), baseForm());
  });

  console.log(JSON.stringify({ checks: checks.length, passed: checks }, null, 2));
} finally {
  await vite.close();
}
