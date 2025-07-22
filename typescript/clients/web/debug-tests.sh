# arbitrum-vibekit/typescript/clients/web/debug-tests.sh
#!/bin/bash

echo "🔍 Debugging Playwright Tests"
echo "================================"

echo "📋 Playwright version:"
pnpm exec playwright --version

echo ""
echo "📋 Available test files:"
find tests -name "*.test.ts" -type f

echo ""
echo "📋 Playwright test discovery:"
pnpm exec playwright test --list 2>&1 | head -20

echo ""
echo "📋 Running simple test:"
pnpm exec playwright test --timeout=10000 --reporter=line auth.setup.ts