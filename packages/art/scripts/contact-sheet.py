"""Rasterize the TS-generated art and measure pairwise alpha-mask distance.
Run from any directory: python packages/art/scripts/contact-sheet.py
Requires Node 22, rsvg-convert, ImageMagick and Pillow.
"""
import json
import re
from pathlib import Path
import subprocess
import tempfile
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
with tempfile.TemporaryDirectory(prefix='takes-art-') as temp:
    jobs_path = Path(temp) / 'jobs.json'
    subprocess.run(['node', '--experimental-strip-types', '--loader',
                    str(ROOT / 'packages/art/scripts/ts-esm-loader.mjs'),
                    str(ROOT / 'packages/art/scripts/contact-sheet.ts'), str(jobs_path)],
                   cwd=ROOT, check=True)
    for job in json.loads(jobs_path.read_text()):
        subprocess.run([job['command'], *job['args']], check=True)
    # Use identical black fill/outline on transparent canvas. Mean absolute
    # alpha difference / 255 measures differing silhouette area / canvas area.
    metrics = {}
    for size in (40, 64):
        masks = {}
        bounds = {}
        for source in sorted(Path(temp).glob('labeled-*.svg')):
            name = source.stem.removeprefix('labeled-')
            # Extract the piece path from the labeled tile; strip display transform.
            shape = re.search(r'<path[^>]+/>', source.read_text()).group()
            shape = re.sub(r'fill="[^"]*"', 'fill="black"', shape)
            shape = re.sub(r'stroke="[^"]*"', 'stroke="black"', shape)
            svg = Path(temp) / f'mask-{size}-{name}.svg'
            png = svg.with_suffix('.png')
            svg.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{shape}</svg>')
            subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), str(svg), '-o', str(png)], check=True)
            alpha = Image.open(png).convert('RGBA').getchannel('A')
            masks[name] = list(alpha.tobytes())
            bounds[name] = alpha.getbbox()
            # No clipped pixels, including the outline.
            assert all(alpha.getpixel((x,y)) == 0 for x in range(size) for y in (0,size-1))
            assert all(alpha.getpixel((x,y)) == 0 for y in range(size) for x in (0,size-1))
        pairs = []
        names = list(masks)
        for i, first in enumerate(names):
            for second in names[i+1:]:
                distance = sum(abs(a-b) for a,b in zip(masks[first], masks[second])) / (255*size*size)
                pairs.append({'pair': [first, second], 'distance': round(distance, 6)})
        pairs.sort(key=lambda item: item['distance'])
        assert pairs[0]['distance'] > .01, pairs[0]
        metrics[str(size)] = {'metric': 'mean absolute alpha difference / 255 over full canvas',
                              'minimum': pairs[0], 'bounds': bounds, 'pairs': pairs}
        print(f'{size}px minimum: {pairs[0]}')
    output = ROOT / 'docs/art/procedural-distinctness.json'
    output.write_text(json.dumps(metrics, indent=2) + '\n')
    print(f'wrote {output}')
