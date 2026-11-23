// M1 Core ISA — faithful port of kit program/generator/subject/vm.mjs.
// IIFE so M3 can run it unchanged through eval in ESM strict mode (Gemini note).
// fs/path via process.getBuiltinModule (no bare require in ESM). No Date,
// no Math.random, no clock: deterministic. Reference VM is the source of truth.
(() => {
  const { readdirSync, readFileSync, writeFileSync, mkdirSync } = process.getBuiltinModule('fs'); // R5
  const { join } = process.getBuiltinModule('path'); // R5
  const enc = new TextEncoder();
  // [byte, immediate bytes, pops, pushes, name] — same table as vm.mjs OPS.
  const OPS = [
    [0x00, 0, 0, 0, 'HALT'], [0x01, 1, 0, 1, 'PUSH8'], [0x02, 4, 0, 1, 'PUSH32'], // R5
    [0x03, 0, 1, 0, 'POP'], [0x04, 0, 1, 2, 'DUP'], [0x05, 0, 2, 2, 'SWAP'],
    [0x06, 0, 2, 3, 'OVER'], [0x07, 0, 3, 3, 'ROT'],
    [0x10, 0, 2, 1, 'ADD'], [0x11, 0, 2, 1, 'SUB'], [0x12, 0, 2, 1, 'MUL'],
    [0x13, 0, 2, 1, 'DIV'], [0x14, 0, 2, 1, 'MOD'], [0x15, 0, 2, 1, 'DIVU'],
    [0x16, 0, 2, 1, 'MODU'], [0x17, 0, 1, 1, 'NEG'], [0x18, 0, 2, 1, 'AND'],
    [0x19, 0, 2, 1, 'OR'], [0x1a, 0, 2, 1, 'XOR'], [0x1b, 0, 1, 1, 'NOT'],
    [0x1c, 0, 2, 1, 'SHL'], [0x1d, 0, 2, 1, 'SHR'], [0x1e, 0, 2, 1, 'SHRU'],
    [0x20, 0, 2, 1, 'EQ'], [0x21, 0, 2, 1, 'LT'], [0x22, 0, 2, 1, 'LTU'],
    [0x30, 2, 0, 0, 'JMP'], [0x31, 2, 1, 0, 'JZ'], [0x32, 2, 1, 0, 'JNZ'],
    [0x33, 2, 0, 0, 'CALL'], [0x34, 0, 0, 0, 'RET'],
    [0x40, 0, 1, 1, 'LOAD'], [0x41, 0, 2, 0, 'STORE'],
    [0x50, 0, 1, 0, 'PRINT'], [0x51, 0, 1, 0, 'PUTC'],
    [0x52, 0, 0, 1, 'IN'], [0x53, 0, 1, 0, 'EXIT'],
  ];
  const BY = new Map(OPS.map((o) => [o[0], o]));
  function run(p, inp) {
    const n = p.length;
    const D = new Int32Array(256);
    let sp = 0;
    const C = new Int32Array(64);
    let csp = 0;
    const M = new Int32Array(256);
    const out = new Uint8Array(65536);
    let ol = 0, ip = 0, pc = 0, st = 0;
    const done = (e) => ({ o: out.slice(0, ol), e });
    for (;;) {
      if (st === 1000000) return done(10);
      if (pc < 0 || pc >= n) return done(9);
      const op = BY.get(p[pc]);
      if (op === undefined) return done(5);
      const name = op[4], imm = op[1], pops = op[2], pushes = op[3];
      if (pc + imm >= n) return done(9);
      st++;
      const next = pc + 1 + imm;
      if (sp < pops) return done(2);
      if (sp - pops + pushes > 256) return done(3);
      pc = next;
      switch (name) {
        case 'HALT': return done(0);
        case 'PUSH8': D[sp++] = (p[next - 1] << 24) >> 24; break;
        case 'PUSH32': D[sp++] = p[next - 4] | (p[next - 3] << 8) | (p[next - 2] << 16) | (p[next - 1] << 24); break;
        case 'POP': sp--; break;
        case 'DUP': D[sp] = D[sp - 1]; sp++; break;
        case 'SWAP': { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
        case 'OVER': D[sp] = D[sp - 2]; sp++; break;
        case 'ROT': { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
        case 'NEG': D[sp - 1] = -D[sp - 1] | 0; break;
        case 'NOT': D[sp - 1] = ~D[sp - 1]; break;
        case 'ADD': case 'SUB': case 'MUL': case 'DIV': case 'MOD': case 'DIVU': case 'MODU':
        case 'AND': case 'OR': case 'XOR': case 'SHL': case 'SHR': case 'SHRU':
        case 'EQ': case 'LT': case 'LTU': {
          const b = D[sp - 1], a = D[sp - 2];
          let r;
          switch (name) {
            case 'ADD': r = (a + b) | 0; break;
            case 'SUB': r = (a - b) | 0; break;
            case 'MUL': r = Math.imul(a, b); break;
            case 'DIV': if (b === 0) return done(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; break;
            case 'MOD': if (b === 0) return done(4); r = b === -1 ? 0 : a % b | 0; break;
            case 'DIVU': if (b === 0) return done(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
            case 'MODU': if (b === 0) return done(4); r = (a >>> 0) % (b >>> 0) | 0; break;
            case 'AND': r = a & b; break;
            case 'OR': r = a | b; break;
            case 'XOR': r = a ^ b; break;
            case 'SHL': r = a << (b & 31); break;
            case 'SHR': r = a >> (b & 31); break;
            case 'SHRU': r = (a >>> (b & 31)) | 0; break;
            case 'EQ': r = a === b ? 1 : 0; break;
            case 'LT': r = a < b ? 1 : 0; break;
            case 'LTU': r = a >>> 0 < b >>> 0 ? 1 : 0; break;
          }
          sp -= 2; D[sp++] = r; break;
        }
        case 'JMP': case 'JZ': case 'JNZ': {
          const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
          let take = true;
          if (name !== 'JMP') { const v = D[--sp]; take = name === 'JZ' ? v === 0 : v !== 0; }
          if (take) pc = next + rel;
          break;
        }
        case 'CALL':
          if (csp === 64) return done(7);
          C[csp++] = next; pc = p[next - 2] | (p[next - 1] << 8); break;
        case 'RET':
          if (csp === 0) return done(8);
          pc = C[--csp]; break;
        case 'LOAD': {
          const addr = D[sp - 1];
          if (addr < 0 || addr >= 256) return done(6);
          D[sp - 1] = M[addr]; break;
        }
        case 'STORE': {
          const addr = D[sp - 1], v = D[sp - 2];
          if (addr < 0 || addr >= 256) return done(6);
          sp -= 2; M[addr] = v; break;
        }
        case 'PRINT': {
          const bytes = enc.encode(String(D[sp - 1]));
          if (ol + bytes.length > 65536) return done(11);
          sp--; out.set(bytes, ol); ol += bytes.length; break;
        }
        case 'PUTC':
          if (ol + 1 > 65536) return done(11);
          out[ol++] = D[--sp] & 255; break;
        case 'IN': D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
        case 'EXIT': return done(D[--sp] & 255);
      }
    }
  }
  const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
  const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  for (const id of readdirSync(I).sort()) {
    const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
    mkdirSync(join(O, id), { recursive: true });
    writeFileSync(join(O, id, 'stdout.bin'), r.o);
    writeFileSync(join(O, id, 'exit.txt'), r.e + '\n');
  }
})();
