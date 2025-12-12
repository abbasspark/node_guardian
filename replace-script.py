#!/usr/bin/env python3
import re

# Read the original file
with open('src/dashboard/server.ts', 'r') as f:
    content = f.read()

# Read the optimized script
with open('optimized-dashboard.js', 'r') as f:
    optimized = f.read()

# Find and replace the script section
pattern = r'(<script>\s*// WebSocket Connection.*?</script>)'
replacement = f'<script>\n{optimized}\n    </script>'

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

# Write back
with open('src/dashboard/server.ts', 'w') as f:
    f.write(new_content)

print("✅ Script section replaced with optimized version")
