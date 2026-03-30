#!/usr/bin/env python3
import base64, os
from PIL import Image

UH = '/Users/matheusbahiense/Desktop/uniquehub'
JSX = os.path.join(UH, 'src/UniqueHubApp.jsx')

# Convert new slide1 PNG to compressed JPEG base64
png_path = os.path.join(UH, 'new_slide1.png')
img = Image.open(png_path).convert('RGB')
w, h = img.size
ratio = 828 / w
new_h = int(h * ratio)
img = img.resize((828, new_h), Image.LANCZOS)
jpg_path = os.path.join(UH, 'new_slide1.jpg')
img.save(jpg_path, 'JPEG', quality=80, optimize=True)
with open(jpg_path, 'rb') as f:
    new_b64 = base64.b64encode(f.read()).decode()
size = os.path.getsize(jpg_path)
print(f'New slide 1: {w}x{h} -> 828x{new_h}, {size//1024}KB, {len(new_b64)} b64 chars')

# Read JSX
with open(JSX, 'r') as f:
    content = f.read()

lines = content.split('\n')
print(f'JSX: {len(lines)} lines')

# Find ONBOARD_SLIDES and replace only first img
start_idx = None
for i, line in enumerate(lines):
    if 'const ONBOARD_SLIDES = [' in line:
        start_idx = i
        break

if start_idx is None:
    print('ERROR: ONBOARD_SLIDES not found!')
    exit(1)

# Line after "const ONBOARD_SLIDES = [" is the first slide
slide1_line = start_idx + 1
old_line = lines[slide1_line]
print(f'Line {slide1_line + 1}: {old_line[:80]}...')

# Build new line
new_line = '{ img: "data:image/jpeg;base64,' + new_b64 + '" },'
lines[slide1_line] = new_line

content = '\n'.join(lines)
with open(JSX, 'w') as f:
    f.write(content)

print(f'Replaced slide 1 (line {slide1_line + 1})')
print(f'New JSX: {len(lines)} lines')
print('Done!')
