import potrace from 'potrace'; import fs from 'fs';
for (const n of ['pawn','knight','bishop','rook','queen','wraith']) {
  potrace.trace(`out/${n}.png`, {turdSize: 20, optTolerance: 0.4}, (err, svg) => {
    if (err) throw err;
    const d = svg.match(/ d="([^"]+)"/)[1];
    const vb = svg.match(/width="(\d+)" height="(\d+)"/);
    const s = 100/ +vb[1];
    const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path transform="scale(${s.toFixed(5)})" d="${d}" fill="var(--piece-fill,#f4efe6)" stroke="var(--piece-stroke,#1b1b1b)" stroke-width="${(3/s).toFixed(2)}" stroke-linejoin="round" fill-rule="evenodd"/></svg>`;
    fs.writeFileSync(`out/${n}.svg`, out); console.log(n, out.length, 'bytes');
  });
}
