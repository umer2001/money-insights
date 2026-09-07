# MoneyInsight 💸

> **Privacy-First Bank Statement Standardization & Multi-Bank Consolidation Utility**

MoneyInsight is a fast, authentication-free web utility designed to standardize and consolidate financial statements across major Pakistani and international banking institutions. Drag and drop multiple statements (PDF, CSV, or Excel), automatically detect formats, audit cash flow reconciliation, and export consolidated reports into standardized Excel and CSV files.

---

## 🌟 Key Features

- **🛡️ 100% Privacy-First & Ephemeral**: Zero permanent database storage of personal identity, account numbers, or financial transactions. All processing is strictly ephemeral and client-accessible.
- **⚡ Format Auto-Detection**: Automatically detects bank statement formats, issuing tokens, and layout schemas from file headers and binary signatures.
- **🔑 Password-Protected PDF Support**: Seamless inline decryption for encrypted statements (e.g., HBL, easypaisa) without storing passwords.
- **📊 Unified Standard Schema**: Transforms differing statement column layouts into a clean, normalized schema:
  - `date`, `time`, `bank`, `account_id`, `currency`, `type`, `amount`, `signed_amount`, `debit`, `credit`, `description`, `transaction_id`, `extra`
- **🧮 Mathematical Audit & Balance Reconciliation**: Calculates debits, credits, net cash flow, and verifies continuity against statement opening and closing balances.
- **📦 Multi-Bank Currency Consolidation**: Combines transactions across multiple bank accounts into consolidated currency-wise workbooks (`PKR`, `USD`).
- **🌓 Dark & Light Theme**: Built-in modern theme toggle supporting light, dark, and system color preferences.

---

## 🏦 Supported Institutions

| Institution | Supported Formats | Password Protected | Currencies |
|---|---|:---:|:---:|
| **Habib Bank Limited (HBL)** | PDF (Mobile / Digital) | ✅ Supported | PKR |
| **United Bank Limited (UBL)** | PDF (Digital Statement) | — | PKR |
| **Allied Bank Limited (ABL)** | PDF (myABL / Branch) | — | PKR |
| **Faysal Bank Limited (FBL)** | PDF & Excel (.xls / OLE) | — | PKR |
| **SadaPay** | PDF | — | PKR |
| **easypaisa** | PDF | ✅ Supported | PKR |
| **NayaPay** | PDF & CSV | — | PKR |
| **Payoneer** | CSV | — | USD |

---

## 🛠️ Technology Stack

- **Frontend**: [React 19](https://react.dev/), [Vite](https://vitejs.dev/), [Refine](https://refine.dev/), [Tailwind CSS v4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/), Lucide Icons
- **Backend**: [Firebase Cloud Functions v2](https://firebase.google.com/docs/functions) (Node.js 22 runtime), `pdf-parse`, `xlsx`, `busboy`
- **CI/CD & Cloud Infrastructure**: [Firebase Hosting](https://firebase.google.com/docs/hosting), GitHub Actions

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v20 or v22 recommended)
- `pnpm` (v9+)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/umer2001/money-insights.git
cd money-insights
pnpm install
```

### 2. Run Local Development Server
```bash
pnpm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Run Parser Test Suite
Verify that all bank statement parsers, auto-detection rules, and balance reconciliations pass:
```bash
pnpm run test:parsers
```

### 4. Build for Production
```bash
pnpm run build
```

---

## 🚢 Deployment & CI/CD

### Firebase CLI Deployment
To deploy manually from your local machine:
```bash
pnpm run deploy            # Deploys both Hosting and Functions
pnpm run deploy:hosting    # Deploys Hosting only
pnpm run deploy:functions  # Deploys Cloud Functions only
```

### GitHub Actions CI/CD
Automated workflows are configured in `.github/workflows/`:
- **`firebase-hosting-merge.yml`**: On push or merge to `master`, builds frontend, runs tests, and deploys live to Firebase Hosting and Cloud Functions.
- **`firebase-hosting-pull-request.yml`**: Generates isolated preview channel URLs on pull requests.

---

## 🔒 Security & Privacy Guidelines

- No sensitive credentials, account numbers, or personal credentials are hardcoded into source files or configuration defaults.
- Encrypted PDFs are unlocked in-memory during request processing; credentials are never written to disk or persisted to databases.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
