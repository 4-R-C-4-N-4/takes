import { describe, it, expect } from 'vitest';
import { parseClientMsg, isInviteCode } from './index.js';

describe('parseClientMsg', () => {
  it('accepts well-formed messages', () => {
    expect(parseClientMsg('{"t":"move","uci":"e2e4","ply":0}')).toEqual({ t: 'move', uci: 'e2e4', ply: 0 });
    expect(parseClientMsg('{"t":"move","uci":"e7e8x","ply":12}')).toEqual({ t: 'move', uci: 'e7e8x', ply: 12 });
    expect(parseClientMsg('{"t":"create_room","ruleset":"2026.1","color":"b"}')).toEqual({ t: 'create_room', ruleset: '2026.1', color: 'b' });
    expect(parseClientMsg('{"t":"create_room","ruleset":"2026.1","bot":"hard"}')).toEqual({ t: 'create_room', ruleset: '2026.1', bot: 'hard' });
    expect(parseClientMsg('{"t":"create_room","ruleset":"2026.1","bot":"godlike"}')).toBeNull();
    expect(parseClientMsg('{"t":"join_room","code":"ABCD2345"}')).toEqual({ t: 'join_room', code: 'ABCD2345' });
  });
  it('rejects malformed or hostile input', () => {
    for (const s of ['nope', '[]', 'null', '{"t":"move","uci":"e2e4"}', '{"t":"move","uci":"e2e4","ply":-1}', '{"t":"move","uci":"z9z9","ply":1}',
      '{"t":"join_room","code":"abcd2345"}', '{"t":"join_room","code":"ABCD0O11"}', '{"t":"create_room","ruleset":"x","color":"red"}', '{"t":"__proto__"}', 'x'.repeat(5000)])
      expect(parseClientMsg(s), s.slice(0, 40)).toBeNull();
  });
  it('invite codes', () => { expect(isInviteCode('23456789')).toBe(true); expect(isInviteCode('I2345678')).toBe(false); });
});
