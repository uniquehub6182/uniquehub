#!/usr/bin/env python3
import base64, os
from PIL import Image

UH = '/Users/matheusbahiense/Desktop/uniquehub'
JSX = os.path.join(UH, 'src/UniqueHubApp.jsx')

# Convert PNGs to compressed JPEGs and get base64
slides_b64 = []
for i in [1, 2, 3]:
    png_path = os.path.join(UH, f'slide{i}.png')
    img = Image.open(png_path).convert('RGB')
    w, h = img.size
    ratio = 828 / w
    new_h = int(h * ratio)
    img = img.resize((828, new_h), Image.LANCZOS)
    jpg_path = os.path.join(UH, f'slide{i}.jpg')
    img.save(jpg_path, 'JPEG', quality=80, optimize=True)
    with open(jpg_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()
    slides_b64.append(b64)
    size = os.path.getsize(jpg_path)
    print(f'Slide {i}: {w}x{h} -> 828x{new_h}, {size//1024}KB, {len(b64)} b64 chars')

# Read JSX
with open(JSX, 'r') as f:
    content = f.read()

print(f'JSX file: {len(content)} chars, {content.count(chr(10))} lines')

# Find and replace ONBOARD_SLIDES
old_start = content.index('const ONBOARD_SLIDES = [')
old_end = content.index('];', old_start) + 2

new_slides = 'const ONBOARD_SLIDES = [\n'
for i, b64 in enumerate(slides_b64):
    new_slides += '{ img: "data:image/jpeg;base64,' + b64 + '" },\n'
new_slides += '];'

old_len = old_end - old_start
content = content[:old_start] + new_slides + content[old_end:]

with open(JSX, 'w') as f:
    f.write(content)

print(f'Replaced ONBOARD_SLIDES ({old_len} chars -> {len(new_slides)} chars)')
print(f'New JSX: {len(content)} chars, {content.count(chr(10))} lines')
print('Done!')
