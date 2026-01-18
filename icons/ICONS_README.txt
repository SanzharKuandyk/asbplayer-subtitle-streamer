EXTENSION ICONS
===============

The extension requires 3 icon sizes:
- icon16.png (16x16 pixels)
- icon48.png (48x48 pixels)
- icon128.png (128x128 pixels)

QUICK SETUP (For Development)
------------------------------

Option 1: Download placeholder icons
You can use any PNG image and rename it to the required sizes.
Simple subtitle/text-related icons work well.

Option 2: Create with ImageMagick (if installed)
convert -size 16x16 xc:#4285f4 -fill white -gravity center -pointsize 10 -annotate +0+0 "S" icon16.png
convert -size 48x48 xc:#4285f4 -fill white -gravity center -pointsize 32 -annotate +0+0 "S" icon48.png
convert -size 128x128 xc:#4285f4 -fill white -gravity center -pointsize 96 -annotate +0+0 "S" icon128.png

Option 3: Create with online tool
1. Go to: https://www.favicon-generator.org/
2. Upload any image
3. Generate and download icons
4. Rename to icon16.png, icon48.png, icon128.png

Option 4: Use SVG (Temporary)
For development, you can temporarily modify manifest.json to use SVG:
"icons": {
  "16": "icons/icon.svg",
  "48": "icons/icon.svg",
  "128": "icons/icon.svg"
}

RECOMMENDED ICON DESIGN
-----------------------
- Simple subtitle/text symbol
- Blue background (#4285f4)
- White text/symbol
- Clear at 16x16 size

NOTE: The extension will work without icons, but Chrome will show a warning
and use a default icon placeholder.
