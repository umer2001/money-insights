# AGENTS.md

## Project Overview
**FBR-return (Bank Statement Standardization & Consolidation Utility)** is a public, privacy-first, authentication-free web utility (analogous to Smallpdf or iLovePDF). It allows users to drop financial statements (PDF, CSV, Excel) from various Pakistani and international institutions (Allied Bank, Faysal Bank, NayaPay, SadaPay, easypaisa, Payoneer), automatically detects statement formats, extracts and standardizes transaction records into a unified schema, and provides instant consolidation and export into standardized Excel and CSV files.

---

## Architectural Blueprint

```
fbr-return/
├── src/                          # Refine (Vite + shadcn) Frontend Application (at repository root)
│   ├── components/               # UI components (Dropzone, DataGrid, SummaryCards, PasswordModal)
│   ├── pages/                    # Refine pages / views (Converter, Consolidated View)
│   ├── lib/                      # Firebase client SDK, utility helpers, api client
│   └── ...
├── functions/                    # Firebase Cloud Functions (v2)
│   ├── src/
│   │   ├── parsers/              # Bank statement parsers (ABL, FBL, NayaPay, Payoneer, SadaPay, EasyPaisa)
│   │   ├── utils/                # CSV / Excel generators, date utils, transaction validator
│   │   ├── services/             # Storage management, cleanup, auto-detection service
│   │   └── index.ts / index.js   # Cloud Function endpoints (parse, consolidate, auto-detect, download)
│   ├── package.json
│   └── ...
├── firebase.json                 # Firebase Hosting & Cloud Functions configuration
├── storage.rules                 # Firebase Storage security rules (public ephemeral upload/download)
├── pnpm-workspace.yaml           # pnpm workspace configuration
└── AGENTS.md                     # Agent developer guidelines and architecture specs
```

### Key Components
1. **Frontend (`/`)**:
   - Built with **Refine** (`refine-app` with `vite-shadcn` preset).
   - Styled with Tailwind CSS and Radix/shadcn primitives.
   - Beautiful, responsive Smallpdf-style unified drag-and-drop zone.
   - Interactive transaction preview table (Refine table / TanStack table) with validation badges.
   - Inline/modal password prompt for encrypted PDFs (e.g. easypaisa).
   - Export actions: Download individual standardized CSV/Excel or consolidated currency-wise files.

2. **Backend (`functions/`)**:
   - Node.js runtime (v22 / v20 compatible).
   - Modular parsers extending a common `BaseParser` class.
   - Format auto-detection engine inspecting file magic bytes, MIME types, and header tokens.
   - Transaction validation engine ensuring debits, credits, and balances reconcile.

3. **Storage & Privacy (Ephemeral Model)**:
   - Statements uploaded with unique session IDs to Firebase Storage.
   - Short TTL auto-expiry policy (1 hour lifecycle) or immediate cleanup upon export generation.
   - Zero permanent database storage of user financial transactions or personal identity information.

4. **Hosting & Routing (`firebase.json`)**:
   - Single-page application hosted via **Firebase Hosting**.
   - API rewrites route `/api/**` calls directly to Cloud Functions.

---

## Technical Stack & Tooling

| Domain | Technology | Notes |
|---|---|---|
| **Package Manager** | `pnpm` | Use `pnpm.cmd` on Windows to respect execution policies |
| **Frontend Framework** | Refine + Vite + React + TypeScript | Initialized with `@refinedev/cli` / `refine-app` |
| **UI Design System** | Tailwind CSS + shadcn/ui | High visual polish, rich states, accessible |
| **Serverless Backend** | Firebase Cloud Functions (v2) | Modular Node.js handlers |
| **File Processing** | `pdf-parse`, `xlsx`, `csv-parser` / custom streams | Fast, memory-efficient streaming |
| **Hosting & Infra** | Firebase Hosting & Firebase Storage | Public endpoints, rewrite rules for API |

---

## Command & Workflow Standards for AI Agents

### 1. Windows PowerShell Compatibility
- On Windows systems with restricted PowerShell execution policies, **never call raw `.ps1` wrappers** (such as `pnpm` or `npx` directly if they invoke `.ps1`).
- Always invoke the `.cmd` executable:
  - `pnpm.cmd <command>`
  - `npx.cmd <package>`
  - `npm.cmd <command>`

### 2. Dependency Management
- Use `pnpm.cmd add <pkg>` or `pnpm.cmd add -D <pkg>`.
- Root package manages the frontend; `functions/` has its own isolated dependencies or workspace link.
- Never mix `npm` / `yarn` lockfiles with `pnpm-lock.yaml`. Remove legacy `package-lock.json` once migration completes.

### 3. Coding Conventions
- **TypeScript**: Strict type definitions for Transaction records, Bank configs, and API payloads.
- **Privacy & Security**: Never log plaintext account numbers, passwords, or transaction amounts in Cloud Function logs.
- **Standard Schema Columns**:
  ```typescript
  export interface StandardTransaction {
    date: string;          // YYYY-MM-DD
    time: string;          // HH:mm:ss (or empty)
    bank: string;          // e.g., 'ABL', 'SadaPay', 'EasyPaisa'
    account_id: string;    // Masked/anonymized where appropriate
    currency: string;      // 'PKR', 'USD', etc.
    type: 'DEBIT' | 'CREDIT';
    amount: number;        // Absolute amount
    signed_amount: number; // Negative for DEBIT, positive for CREDIT
    debit: number;         // Positive debit amount or 0
    credit: number;        // Positive credit amount or 0
    description: string;   // Cleaned transaction description
    transaction_id: string;
    extra?: Record<string, unknown>;
  }
  ```
- **Error Handling**: Every parser must throw typed errors (e.g. `InvalidPasswordError`, `UnrecognizedFormatError`, `CorruptedFileError`) that map directly to friendly UI banners in Refine.

---

## Testing & Verification
- Keep fixture statements in test folders (ignored in git) to validate conversion logic.
- Before committing or deploying, run:
  1. `pnpm.cmd run build` in root (frontend verification)
  2. `pnpm.cmd run build` or `npm.cmd test` in `functions/` (Cloud Functions verification)
  3. Validate using Firebase Local Emulator Suite (`firebase emulators:start`) before production deployment.
