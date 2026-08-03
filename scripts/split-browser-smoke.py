from pathlib import Path

path = Path('.github/workflows/ci.yml')
text = path.read_text()
old = '''  e2e-smoke:
    name: Browser smoke
    needs: quality
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Check out repository
        uses: actions/checkout@v7

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install locked dependencies
        run: npm ci

      - name: Install browsers
        run: npx playwright install --with-deps chromium firefox

      - name: Build production bundle
        env:
          VITE_FEATURE_SERVER_SYNC: "true"
          VITE_GEOMETRYOS_BASE_URL: http://127.0.0.1:4173/geometryos
        run: npm run build

      - name: Run browser smoke
        run: npm run e2e

'''
new = '''  e2e-smoke:
    name: Browser smoke (${{ matrix.browser }})
    needs: quality
    runs-on: ubuntu-latest
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix:
        browser: [chromium, firefox]

    steps:
      - name: Check out repository
        uses: actions/checkout@v7

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install locked dependencies
        run: npm ci

      - name: Install ${{ matrix.browser }}
        run: npx playwright install --with-deps ${{ matrix.browser }}

      - name: Build production bundle
        env:
          VITE_FEATURE_SERVER_SYNC: "true"
          VITE_GEOMETRYOS_BASE_URL: http://127.0.0.1:4173/geometryos
        run: npm run build

      - name: Run ${{ matrix.browser }} browser smoke
        run: |
          set -o pipefail
          npm run e2e -- --project=${{ matrix.browser }} 2>&1 \
            | tee browser-smoke-${{ matrix.browser }}.log

      - name: Upload browser smoke failure evidence
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: browser-smoke-${{ matrix.browser }}-failure-${{ github.sha }}
          path: |
            browser-smoke-${{ matrix.browser }}.log
            test-results
          if-no-files-found: warn
          retention-days: 7

'''
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected one browser smoke block, found {count}')
path.write_text(text.replace(old, new, 1))
