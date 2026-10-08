import assert from 'node:assert/strict';
import {metrics,specialists} from '../src/components/satisfaction/model.ts';
const rows=[{answered_at:'2026-10-01',satisfaction:5,speed:4,clarity:null,resolution:'total',specialist_id:'a',specialist_name:'A',area:'ingenieria'},{answered_at:'2026-10-01',satisfaction:2,speed:2,clarity:3,resolution:'partial',specialist_id:'a',specialist_name:'A',area:'ingenieria'},{answered_at:null,satisfaction:null,speed:null,clarity:null,resolution:null,specialist_id:'a',specialist_name:'A',area:'ingenieria'}];
const m=metrics(rows);assert.equal(m.csat,50);assert.equal(m.resolution,50);assert.equal(m.clarity,3);assert.equal(m.clarityCount,1);assert.equal(m.speed,3);assert.equal(m.followup,1);assert.equal(m.count,2);assert.equal(m.participation,200/3);assert.equal(metrics([]).csat,null);
assert.equal(specialists([...rows,{...rows[0],specialist_id:null}]).length,1);
assert.equal(specialists([...rows,{...rows[0],area:'quimica'}]).length,2);
console.log('PASS: actual denominators, unanswered exclusion, NA clarity, no-data nulls, missing assignee and area separation');
