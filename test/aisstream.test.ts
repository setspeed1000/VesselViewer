import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanText, parseAisStreamMessage, parseAisTime, rateOfTurn } from '../shared/aisstream.js';

const NOW = Date.parse('2026-10-28T12:00:05Z');

/** Real aisstream.io message layout (see aisstream/ais-message-models). */
function positionReport(overrides: Record<string, unknown> = {}) {
  return {
    MessageType: 'PositionReport',
    MetaData: {
      MMSI: 259000420,
      MMSI_String: 259000420,
      ShipName: 'AUGUSTSON           ',
      latitude: 66.02695,
      longitude: 12.253821666666665,
      time_utc: '2026-10-28 12:00:01.318353 +0000 UTC',
    },
    Message: {
      PositionReport: {
        Cog: 308,
        CommunicationState: 81982,
        Latitude: 66.02695,
        Longitude: 12.253821666666665,
        MessageID: 1,
        NavigationalStatus: 15,
        PositionAccuracy: true,
        Raim: false,
        RateOfTurn: 4,
        RepeatIndicator: 0,
        Sog: 12.3,
        Spare: 0,
        SpecialManoeuvreIndicator: 0,
        Timestamp: 31,
        TrueHeading: 235,
        UserID: 259000420,
        Valid: true,
        ...overrides,
      },
    },
  };
}

test('parses a class A position report', () => {
  const [u] = parseAisStreamMessage(positionReport(), NOW);
  assert.deepEqual(u, {
    kind: 'position',
    mmsi: 259000420,
    aisClass: 'A',
    time: Date.parse('2026-10-28T12:00:01.318Z'),
    lat: 66.02695,
    lon: 12.253821666666665,
    sog: 12.3,
    cog: 308,
    heading: 235,
    rot: 0.7,
    metaName: 'AUGUSTSON',
  });
});

test('drops "not available" sentinel values', () => {
  const [u] = parseAisStreamMessage(
    positionReport({ Sog: 102.3, Cog: 360, TrueHeading: 511, RateOfTurn: -128, NavigationalStatus: 15 }),
    NOW,
  );
  assert.ok(u && u.kind === 'position');
  assert.equal(u.sog, undefined);
  assert.equal(u.cog, undefined);
  assert.equal(u.heading, undefined);
  assert.equal(u.rot, undefined);
  assert.equal(u.navStatus, undefined);
  assert.ok(!('sog' in u), 'undefined fields are omitted');
});

test('rejects unavailable or bogus positions', () => {
  assert.deepEqual(parseAisStreamMessage(positionReport({ Latitude: 91, Longitude: 181 }), NOW), []);
  assert.deepEqual(parseAisStreamMessage(positionReport({ Latitude: 0, Longitude: 0 }), NOW), []);
  assert.deepEqual(parseAisStreamMessage(positionReport({ Valid: false }), NOW), []);
  assert.deepEqual(parseAisStreamMessage({ error: 'Api Key Is Not Valid' }, NOW), []);
  assert.deepEqual(parseAisStreamMessage(null, NOW), []);
  assert.deepEqual(parseAisStreamMessage({ MessageType: 'PositionReport', Message: {} }, NOW), []);
});

test('parses ship static data', () => {
  const [u] = parseAisStreamMessage(
    {
      MessageType: 'ShipStaticData',
      MetaData: { MMSI: 211331640, ShipName: 'SEA STAR', time_utc: '2026-10-28 12:00:00 +0000 UTC' },
      Message: {
        ShipStaticData: {
          AisVersion: 0,
          CallSign: 'DMLA@@@',
          Destination: 'HAMBURG@@@@@@@@@@@@@',
          Dimension: { A: 150, B: 30, C: 12, D: 16 },
          Dte: false,
          Eta: { Day: 29, Hour: 14, Minute: 30, Month: 10 },
          FixType: 1,
          ImoNumber: 9305609,
          MaximumStaticDraught: 8.4,
          MessageID: 5,
          Name: 'SEA STAR@@@@@@@@@@@@',
          RepeatIndicator: 0,
          Spare: false,
          Type: 71,
          UserID: 211331640,
          Valid: true,
        },
      },
    },
    NOW,
  );
  assert.deepEqual(u, {
    kind: 'static',
    mmsi: 211331640,
    aisClass: 'A',
    time: Date.parse('2026-10-28T12:00:00Z'),
    name: 'SEA STAR',
    callSign: 'DMLA',
    imo: 9305609,
    shipType: 71,
    destination: 'HAMBURG',
    eta: { month: 10, day: 29, hour: 14, minute: 30 },
    draught: 8.4,
    dimA: 150,
    dimB: 30,
    dimC: 12,
    dimD: 16,
  });
});

test('parses class B static data report parts', () => {
  const base = { MessageType: 'StaticDataReport', MetaData: { MMSI: 235000001 } };
  const [a] = parseAisStreamMessage(
    {
      ...base,
      Message: {
        StaticDataReport: {
          UserID: 235000001,
          Valid: true,
          PartNumber: false,
          ReportA: { Valid: true, Name: 'LITTLE GULL' },
          ReportB: { Valid: false },
        },
      },
    },
    NOW,
  );
  assert.equal(a?.kind, 'static');
  assert.equal(a && 'name' in a ? a.name : undefined, 'LITTLE GULL');

  const [b] = parseAisStreamMessage(
    {
      ...base,
      Message: {
        StaticDataReport: {
          UserID: 235000001,
          Valid: true,
          PartNumber: true,
          ReportA: { Valid: false },
          ReportB: { Valid: true, ShipType: 37, CallSign: 'MABC1', Dimension: { A: 6, B: 4, C: 2, D: 1 } },
        },
      },
    },
    NOW,
  );
  assert.deepEqual(b, {
    kind: 'static',
    mmsi: 235000001,
    aisClass: 'B',
    time: NOW,
    shipType: 37,
    callSign: 'MABC1',
    dimA: 6,
    dimB: 4,
    dimC: 2,
    dimD: 1,
  });
});

test('extended class B report yields position and static parts', () => {
  const updates = parseAisStreamMessage(
    {
      MessageType: 'ExtendedClassBPositionReport',
      MetaData: { MMSI: 338000002 },
      Message: {
        ExtendedClassBPositionReport: {
          UserID: 338000002,
          Valid: true,
          Latitude: 47.6,
          Longitude: -122.4,
          Sog: 5.5,
          Cog: 90.5,
          TrueHeading: 91,
          Name: 'ORCA',
          Type: 36,
          Dimension: { A: 8, B: 3, C: 2, D: 2 },
        },
      },
    },
    NOW,
  );
  assert.equal(updates.length, 2);
  assert.equal(updates[0]?.kind, 'position');
  assert.equal(updates[0]?.aisClass, 'B');
  assert.equal(updates[1]?.kind, 'static');
});

test('parseAisTime handles aisstream formats', () => {
  assert.equal(parseAisTime('2022-12-29 18:22:32.318353 +0000 UTC'), Date.parse('2022-12-29T18:22:32.318Z'));
  assert.equal(parseAisTime('2022-12-29 18:22:32 +0000 UTC'), Date.parse('2022-12-29T18:22:32Z'));
  assert.equal(parseAisTime('2022-12-29 18:22:32.1 +0200 CEST'), Date.parse('2022-12-29T16:22:32.100Z'));
  assert.equal(parseAisTime('garbage'), undefined);
  assert.equal(parseAisTime(42), undefined);
});

test('falls back to receipt time when the reported time is implausible', () => {
  const [u] = parseAisStreamMessage(
    { ...positionReport(), MetaData: { MMSI: 259000420, time_utc: '2001-01-01 00:00:00 +0000 UTC' } },
    NOW,
  );
  assert.equal(u?.time, NOW);
});

test('rateOfTurn converts the AIS indicator', () => {
  assert.equal(rateOfTurn(0), 0);
  assert.equal(rateOfTurn(126), 708.7);
  assert.equal(rateOfTurn(-10), -4.5);
  assert.equal(rateOfTurn(127), undefined);
  assert.equal(rateOfTurn(-128), undefined);
});

test('cleanText strips AIS padding', () => {
  assert.equal(cleanText('  EVER  GIVEN@@@ '), 'EVER GIVEN');
  assert.equal(cleanText('@@@@'), undefined);
  assert.equal(cleanText(5), undefined);
});
