# Reproducibility

## Run the frozen candidate

Requires Node.js 22 with TypeScript support and the official token-radar-01 snapshot from the competition kit. No npm dependencies are required by the entrypoint.

```sh
git clone https://github.com/amitkumar-bit/alpha-radar-omega-token-radar-01.git
cd alpha-radar-omega-token-radar-01
git checkout f6bd53c7d47fdf07c2adf84ffa7920369953762b
node main.ts --input /path/to/snapshot.json --output out
```

Replace the placeholder with the actual snapshot path. Open `out/dashboard/index.html` in a browser. The entrypoint writes board.json, data.js, copies dashboard assets and committed screenshots, and builds dossier.json. It does not render new screenshots.

## Reference artifact digests

Reported in the immutable release audit; compare against the exact official snapshot and frozen commit.

| Artifact | SHA-256 |
|---|---|
| board.json | `ac83c8628d9963ddd24c83c7a85f5a2d97ea42331490daa3f6ec739c9fab2add` |
| data.js | `a16cdcf7ceaaa4ea4a3c95c972c2e617a0bcd4ce2ec1d302ea4c647727c5541e` |
| dossier.json | `1679ac75c5942c6e15a29e2eea26b761dc69de1468f9702a6bd32f59d0ba5a14` |

Linux: `sha256sum out/board.json out/data.js out/dossier.json`

PowerShell: `Get-FileHash out/board.json,out/data.js,out/dossier.json -Algorithm SHA256`

## Verification scope

The supplied audit reports deterministic Windows/Linux builds, 13 local official preflight passes, 20 targeted mutation checks (18 direct, 2 hook-simulated), and earlier V4.2 browser checks across 42 view/viewport combinations. Expanded V4.2.1 scripts were retained in the local workspace, not committed in the frozen candidate. The committed [browser test](https://github.com/amitkumar-bit/alpha-radar-omega-token-radar-01/blob/f6bd53c7d47fdf07c2adf84ffa7920369953762b/tools/v4_2_browser_test.mjs) and [mutation test](https://github.com/amitkumar-bit/alpha-radar-omega-token-radar-01/blob/f6bd53c7d47fdf07c2adf84ffa7920369953762b/tools/v4_2_regression_mutation.mjs) use workspace-specific paths and need adaptation for standalone execution.

The dossier text is reported at 65,501 of 65,536 bytes. The judge's smaller inspection window may omit parts of the frontend. Passing local preflight does not establish official scoring or final reward eligibility.

Do not commit private keys, credentials, or private transcript archives. Competition submission is a separate authorized action.
