#!/usr/bin/env bash
# Genera un repo git chico y determinístico para probar trazo.
#
# Uso: fixtures/create-demo-repo.sh [target_dir]
#   target_dir por defecto: <repo de trazo>/../trazo-demo  (hermano del repo)
#
# Borra y recrea SOLO target_dir. Mismas fechas fijas en cada commit, así que
# re-ejecutarlo da los mismos SHAs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_ARG="${1-$SCRIPT_DIR/../../trazo-demo}"

if [[ -z "$TARGET_ARG" || "$TARGET_ARG" == "/" ]]; then
  echo "error: target vacío o '/', me niego" >&2
  exit 1
fi

PARENT="$(cd "$(dirname "$TARGET_ARG")" && pwd)"
TARGET="$PARENT/$(basename "$TARGET_ARG")"

if [[ "$TARGET" == "/" || "$TARGET" == "$HOME" || "$TARGET" == "$PARENT" || "$TARGET" == "$SCRIPT_DIR"* ]]; then
  echo "error: target peligroso ($TARGET), me niego" >&2
  exit 1
fi

rm -rf "$TARGET"
mkdir -p "$TARGET"
cd "$TARGET"

git init -q -b main
git config user.name "Sebastian Maciel"
git config user.email "4841148+SebastianMaciel@users.noreply.github.com"
git config commit.gpgsign false
git config core.autocrlf false
git config core.hooksPath .git/no-hooks

# w <path>: escribe stdin en <path>, creando directorios.
w() {
  mkdir -p "$(dirname "$1")"
  cat > "$1"
}

# commit <fecha ISO> <mensaje>
commit() {
  git add -A
  GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1" git commit -q -m "$2"
}

branch() {
  git checkout -q -b "$1" main
}

########################################################################
# main #1: estructura base, money, cart, copy
########################################################################

w package.json <<'EOF'
{
  "name": "checkout-demo",
  "version": "0.3.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
EOF

w tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
EOF

w .gitignore <<'EOF'
node_modules
dist
EOF

w src/config.ts <<'EOF'
export const IVA_RATE = 0.21;
export const MAX_INSTALLMENTS = 12;

export const INSTALLMENT_PLANS = [
  { count: 1, surchargeRate: 0 },
  { count: 3, surchargeRate: 0.1 },
  { count: 6, surchargeRate: 0.2 },
  { count: 12, surchargeRate: 0.45 },
];

export const SHOP = {
  name: "Almacén Demo",
  email: "ventas@example.com",
  cuit: "30-00000000-0",
};
EOF

w src/money.ts <<'EOF'
/** Montos internos siempre en centavos enteros. */
export type Cents = number;

/** Convierte un monto en pesos (con decimales) a centavos. */
export function toCents(amount: number): Cents {
  return Math.floor(amount * 100);
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

/**
 * Parsea montos escritos al estilo argentino: "19,99", "$ 300", "1.234,56".
 * Devuelve pesos (no centavos).
 */
export function parseARS(input: string): number {
  const clean = input.replace(/[$\s]/g, "").replace(",", ".");
  const value = parseFloat(clean);
  if (Number.isNaN(value)) {
    throw new Error(`Monto inválido: ${input}`);
  }
  return value;
}

/** 123456 -> "$ 1.234,56" */
export function formatARS(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const pesos = Math.floor(abs / 100);
  const decimals = String(abs % 100).padStart(2, "0");
  const thousands = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}$ ${thousands},${decimals}`;
}

export function addCents(...values: Cents[]): Cents {
  return values.reduce((acc, v) => acc + v, 0);
}

export function percentOf(cents: Cents, percent: number): Cents {
  return Math.floor((cents * percent) / 100);
}
EOF

w src/money.test.ts <<'EOF'
import { describe, expect, it } from "vitest";
import { formatARS, parseARS, toCents } from "./money";

describe("toCents", () => {
  it("convierte pesos enteros", () => {
    expect(toCents(10)).toBe(1000);
  });

  it("convierte pesos con decimales", () => {
    expect(toCents(12.5)).toBe(1250);
  });
});

describe("parseARS", () => {
  it("acepta coma decimal", () => {
    expect(parseARS("12,50")).toBe(12.5);
  });

  it("ignora el signo $ y espacios", () => {
    expect(parseARS("$ 300")).toBe(300);
  });

  it("rechaza texto que no es un monto", () => {
    expect(() => parseARS("gratis")).toThrow();
  });
});

describe("formatARS", () => {
  it("usa punto de miles y coma decimal", () => {
    expect(formatARS(123456)).toBe("$ 1.234,56");
  });

  it("formatea negativos", () => {
    expect(formatARS(-1999)).toBe("-$ 19,99");
  });
});
EOF

w src/cart.ts <<'EOF'
import { Cents, addCents, percentOf, toCents } from "./money";

export interface CartItem {
  sku: string;
  name: string;
  /** Precio unitario en pesos, tal cual viene del catálogo. */
  unitPrice: number;
  quantity: number;
}

export interface CartTotals {
  subtotal: Cents;
  discount: Cents;
  total: Cents;
}

export function lineTotal(item: CartItem): Cents {
  return toCents(item.unitPrice) * item.quantity;
}

export function cartTotals(items: CartItem[], discountPercent = 0): CartTotals {
  const subtotal = addCents(...items.map(lineTotal));
  const discount = percentOf(subtotal, discountPercent);
  return { subtotal, discount, total: subtotal - discount };
}
EOF

w src/copy.ts <<'EOF'
export const COPY = {
  checkout: {
    title: "Finalizá tu compra",
    payButton: "Pagar",
    installmentsLabel: "Cuotas",
    success: (count: number, amount: string) =>
      count === 1 ? `Listo! Pagaste ${amount}.` : `Listo! Vas a pagar ${count} cuotas de ${amount}.`,
  },
  errors: {
    invalidEmail: "El email no es valido",
    emptyCart: "Tu carrito esta vacio",
    invalidAmount: "Hay un precio que no pudimos leer",
    invalidInstallments: "Cantidad de cuotas invalida",
    planUnavailable: "Ese plan de cuotas no esta disponible",
  },
  invoice: {
    header: "Factura B",
    customer: "Cliente",
    discount: "Descuento",
    surcharge: "Recargo por cuotas",
    net: "Neto gravado",
    tax: "IVA 21%",
    total: "Total",
  },
} as const;
EOF

commit "2026-10-01T10:00:00-03:00" "chore: estructura inicial del checkout (money, carrito, textos)"

########################################################################
# main #2: cuotas, factura y endpoint
########################################################################

w src/installments.ts <<'EOF'
import { INSTALLMENT_PLANS, MAX_INSTALLMENTS } from "./config";
import { Cents, fromCents, toCents } from "./money";

export interface InstallmentQuote {
  count: number;
  surchargeRate: number;
  surcharge: Cents;
  total: Cents;
  perInstallment: Cents;
  lastInstallment: Cents;
}

export function isValidInstallmentCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= MAX_INSTALLMENTS;
}

export function quoteInstallments(amount: Cents, count: number): InstallmentQuote {
  const plan = INSTALLMENT_PLANS.find((p) => p.count === count);
  if (!plan) {
    throw new Error(`No hay plan de ${count} cuotas`);
  }

  const surcharge = toCents(fromCents(amount) * plan.surchargeRate);
  const total = amount + surcharge;
  const perInstallment = Math.floor(total / count);
  const lastInstallment = total - perInstallment * (count - 1);

  return {
    count,
    surchargeRate: plan.surchargeRate,
    surcharge,
    total,
    perInstallment,
    lastInstallment,
  };
}
EOF

w src/installments.test.ts <<'EOF'
import { describe, expect, it } from "vitest";
import { isValidInstallmentCount, quoteInstallments } from "./installments";

describe("quoteInstallments", () => {
  it("1 cuota no tiene recargo", () => {
    const q = quoteInstallments(100000, 1);
    expect(q.surcharge).toBe(0);
    expect(q.total).toBe(100000);
    expect(q.perInstallment).toBe(100000);
  });

  it("3 cuotas suman 10% de recargo", () => {
    const q = quoteInstallments(100000, 3);
    expect(q.surcharge).toBe(10000);
    expect(q.total).toBe(110000);
    expect(q.perInstallment * 2 + q.lastInstallment).toBe(110000);
  });

  it("rechaza planes que no existen", () => {
    expect(() => quoteInstallments(1000, 5)).toThrow();
  });
});

describe("isValidInstallmentCount", () => {
  it("acepta de 1 a 12", () => {
    expect(isValidInstallmentCount(1)).toBe(true);
    expect(isValidInstallmentCount(12)).toBe(true);
  });

  it("rechaza 0, 13 y decimales", () => {
    expect(isValidInstallmentCount(0)).toBe(false);
    expect(isValidInstallmentCount(13)).toBe(false);
    expect(isValidInstallmentCount(2.5)).toBe(false);
  });
});
EOF

w src/invoice.ts <<'EOF'
import { CartItem, cartTotals, lineTotal } from "./cart";
import { IVA_RATE, SHOP } from "./config";
import { COPY } from "./copy";
import { InstallmentQuote } from "./installments";
import { Cents, formatARS, fromCents, toCents } from "./money";

export interface InvoiceLine {
  description: string;
  amount: Cents;
}

export interface Invoice {
  number: string;
  issuedAt: string;
  customerEmail: string;
  lines: InvoiceLine[];
  net: Cents;
  tax: Cents;
  total: Cents;
}

export interface InvoiceInput {
  number: string;
  issuedAt: string;
  customerEmail: string;
  items: CartItem[];
  discountPercent: number;
  quote?: InstallmentQuote;
}

/** Precio final con IVA incluido -> neto gravado. */
export function netFromGross(gross: Cents): Cents {
  return toCents(fromCents(gross) / (1 + IVA_RATE));
}

export function buildInvoice(input: InvoiceInput): Invoice {
  const totals = cartTotals(input.items, input.discountPercent);
  const lines: InvoiceLine[] = input.items.map((item) => ({
    description: `${item.quantity} x ${item.name}`,
    amount: lineTotal(item),
  }));

  if (totals.discount > 0) {
    lines.push({ description: COPY.invoice.discount, amount: -totals.discount });
  }

  let total = totals.total;
  if (input.quote && input.quote.surcharge > 0) {
    lines.push({
      description: `${COPY.invoice.surcharge} (${input.quote.count} cuotas)`,
      amount: input.quote.surcharge,
    });
    total += input.quote.surcharge;
  }

  const net = netFromGross(total);
  return {
    number: input.number,
    issuedAt: input.issuedAt,
    customerEmail: input.customerEmail,
    lines,
    net,
    tax: total - net,
    total,
  };
}

export function renderInvoiceText(inv: Invoice): string {
  const rows = inv.lines.map((l) => `${l.description.padEnd(32)} ${formatARS(l.amount)}`);
  return [
    `${SHOP.name} - ${COPY.invoice.header} ${inv.number}`,
    `${SHOP.email} | CUIT ${SHOP.cuit}`,
    `${COPY.invoice.customer}: ${inv.customerEmail}`,
    "",
    ...rows,
    "",
    `${COPY.invoice.net}: ${formatARS(inv.net)}`,
    `${COPY.invoice.tax}: ${formatARS(inv.tax)}`,
    `${COPY.invoice.total}: ${formatARS(inv.total)}`,
  ].join("\n");
}
EOF

w src/api/checkout.ts <<'EOF'
import { CartItem, cartTotals } from "../cart";
import { COPY } from "../copy";
import { isValidInstallmentCount, quoteInstallments } from "../installments";
import { Invoice, buildInvoice } from "../invoice";
import { formatARS, parseARS } from "../money";

export interface CheckoutRequest {
  email: string;
  items: Array<{ sku: string; name: string; price: string; quantity: number }>;
  installments: number;
  couponPercent?: number;
}

export type CheckoutResponse =
  | {
      status: 200;
      body: { ok: true; total: string; perInstallment: string; message: string; invoice: Invoice };
    }
  | { status: 400 | 422; body: { ok: false; error: string } };

function fail(status: 400 | 422, error: string): CheckoutResponse {
  return { status, body: { ok: false, error } };
}

function invoiceNumber(now: Date): string {
  return `0001-${String(now.getTime()).slice(-8)}`;
}

export function handleCheckout(req: CheckoutRequest, now: Date = new Date()): CheckoutResponse {
  if (!req.email || !req.email.includes("@")) {
    return fail(400, COPY.errors.invalidEmail);
  }
  if (!req.items || req.items.length === 0) {
    return fail(400, COPY.errors.emptyCart);
  }
  if (!isValidInstallmentCount(req.installments)) {
    return fail(422, COPY.errors.invalidInstallments);
  }

  let items: CartItem[];
  try {
    items = req.items.map((i) => ({
      sku: i.sku,
      name: i.name,
      unitPrice: parseARS(i.price),
      quantity: i.quantity,
    }));
  } catch {
    return fail(400, COPY.errors.invalidAmount);
  }

  const discountPercent = req.couponPercent ?? 0;
  const totals = cartTotals(items, discountPercent);

  let quote;
  try {
    quote = quoteInstallments(totals.total, req.installments);
  } catch {
    return fail(422, COPY.errors.planUnavailable);
  }

  const invoice = buildInvoice({
    number: invoiceNumber(now),
    issuedAt: now.toISOString(),
    customerEmail: req.email,
    items,
    discountPercent,
    quote,
  });

  return {
    status: 200,
    body: {
      ok: true,
      total: formatARS(quote.total),
      perInstallment: formatARS(quote.perInstallment),
      message: COPY.checkout.success(quote.count, formatARS(quote.perInstallment)),
      invoice,
    },
  };
}
EOF

commit "2026-10-02T15:30:00-03:00" "feat: cuotas con recargo, factura y endpoint de checkout"

########################################################################
# main #3: parche del centavo perdido (esconde el bug real de toCents)
########################################################################

w src/cart.ts <<'EOF'
import { Cents, addCents, percentOf, toCents } from "./money";

export interface CartItem {
  sku: string;
  name: string;
  /** Precio unitario en pesos, tal cual viene del catálogo. */
  unitPrice: number;
  quantity: number;
}

export interface CartTotals {
  subtotal: Cents;
  discount: Cents;
  total: Cents;
}

export function lineTotal(item: CartItem): Cents {
  // FIXME: toCents(19.99) da 1998, se pierde un centavo por item.
  // Le sumamos un epsilon hasta que alguien lo arregle en money.ts.
  return toCents(item.unitPrice + 0.001) * item.quantity;
}

export function cartTotals(items: CartItem[], discountPercent = 0): CartTotals {
  const subtotal = addCents(...items.map(lineTotal));
  const discount = percentOf(subtotal, discountPercent);
  return { subtotal, discount, total: subtotal - discount };
}
EOF

w src/installments.ts <<'EOF'
import { INSTALLMENT_PLANS, MAX_INSTALLMENTS } from "./config";
import { Cents, fromCents, toCents } from "./money";

export interface InstallmentQuote {
  count: number;
  surchargeRate: number;
  surcharge: Cents;
  total: Cents;
  perInstallment: Cents;
  lastInstallment: Cents;
}

export function isValidInstallmentCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= MAX_INSTALLMENTS;
}

export function quoteInstallments(amount: Cents, count: number): InstallmentQuote {
  const plan = INSTALLMENT_PLANS.find((p) => p.count === count);
  if (!plan) {
    throw new Error(`No hay plan de ${count} cuotas`);
  }

  // mismo parche que en cart.ts: sin el epsilon el recargo pierde un centavo
  const surcharge = toCents(fromCents(amount) * plan.surchargeRate + 0.001);
  const total = amount + surcharge;
  const perInstallment = Math.floor(total / count);
  const lastInstallment = total - perInstallment * (count - 1);

  return {
    count,
    surchargeRate: plan.surchargeRate,
    surcharge,
    total,
    perInstallment,
    lastInstallment,
  };
}
EOF

commit "2026-10-03T18:45:00-03:00" "fix: parche para el centavo perdido en carrito y cuotas"

########################################################################
# fix/conversion-montos: el bugfix de verdad
########################################################################

branch fix/conversion-montos

w src/money.ts <<'EOF'
/** Montos internos siempre en centavos enteros. */
export type Cents = number;

/**
 * Convierte un monto en pesos (con decimales) a centavos.
 * Redondea: 19.99 * 100 da 1998.9999999999998 en punto flotante.
 */
export function toCents(amount: number): Cents {
  return Math.round(amount * 100);
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

const ARS_AMOUNT = /^-?\d+(\.\d{1,2})?$/;

/**
 * Parsea montos escritos al estilo argentino: "19,99", "$ 300", "1.234,56".
 * El punto es separador de miles y la coma es decimal. Devuelve pesos.
 */
export function parseARS(input: string): number {
  const clean = input.replace(/[$\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (!ARS_AMOUNT.test(clean)) {
    throw new Error(`Monto inválido: ${input}`);
  }
  return Number(clean);
}

/** 123456 -> "$ 1.234,56" */
export function formatARS(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const pesos = Math.floor(abs / 100);
  const decimals = String(abs % 100).padStart(2, "0");
  const thousands = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}$ ${thousands},${decimals}`;
}

export function addCents(...values: Cents[]): Cents {
  return values.reduce((acc, v) => acc + v, 0);
}

export function percentOf(cents: Cents, percent: number): Cents {
  return Math.floor((cents * percent) / 100);
}
EOF

w src/money.test.ts <<'EOF'
import { describe, expect, it } from "vitest";
import { formatARS, parseARS, toCents } from "./money";

describe("toCents", () => {
  it("convierte pesos enteros", () => {
    expect(toCents(10)).toBe(1000);
  });

  it("convierte pesos con decimales", () => {
    expect(toCents(12.5)).toBe(1250);
  });

  it("no pierde centavos por punto flotante", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(1.15)).toBe(115);
  });
});

describe("parseARS", () => {
  it("acepta coma decimal", () => {
    expect(parseARS("12,50")).toBe(12.5);
  });

  it("ignora el signo $ y espacios", () => {
    expect(parseARS("$ 300")).toBe(300);
  });

  it("entiende el punto como separador de miles", () => {
    expect(parseARS("1.234,56")).toBe(1234.56);
    expect(parseARS("$ 1.000.000")).toBe(1000000);
  });

  it("rechaza texto que no es un monto", () => {
    expect(() => parseARS("gratis")).toThrow();
    expect(() => parseARS("1,2,3")).toThrow();
  });
});

describe("formatARS", () => {
  it("usa punto de miles y coma decimal", () => {
    expect(formatARS(123456)).toBe("$ 1.234,56");
  });

  it("formatea negativos", () => {
    expect(formatARS(-1999)).toBe("-$ 19,99");
  });

  it("ida y vuelta con parseARS", () => {
    expect(formatARS(toCents(parseARS("1.234,56")))).toBe("$ 1.234,56");
  });
});
EOF

commit "2026-10-10T11:00:00-03:00" "fix: redondear al pasar a centavos y parsear montos con separador de miles"

w src/cart.ts <<'EOF'
import { Cents, addCents, percentOf, toCents } from "./money";

export interface CartItem {
  sku: string;
  name: string;
  /** Precio unitario en pesos, tal cual viene del catálogo. */
  unitPrice: number;
  quantity: number;
}

export interface CartTotals {
  subtotal: Cents;
  discount: Cents;
  total: Cents;
}

export function lineTotal(item: CartItem): Cents {
  return toCents(item.unitPrice) * item.quantity;
}

export function cartTotals(items: CartItem[], discountPercent = 0): CartTotals {
  const subtotal = addCents(...items.map(lineTotal));
  const discount = percentOf(subtotal, discountPercent);
  return { subtotal, discount, total: subtotal - discount };
}
EOF

w src/installments.ts <<'EOF'
import { INSTALLMENT_PLANS, MAX_INSTALLMENTS } from "./config";
import { Cents, fromCents, toCents } from "./money";

export interface InstallmentQuote {
  count: number;
  surchargeRate: number;
  surcharge: Cents;
  total: Cents;
  perInstallment: Cents;
  lastInstallment: Cents;
}

export function isValidInstallmentCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= MAX_INSTALLMENTS;
}

export function quoteInstallments(amount: Cents, count: number): InstallmentQuote {
  const plan = INSTALLMENT_PLANS.find((p) => p.count === count);
  if (!plan) {
    throw new Error(`No hay plan de ${count} cuotas`);
  }

  const surcharge = toCents(fromCents(amount) * plan.surchargeRate);
  const total = amount + surcharge;
  const perInstallment = Math.floor(total / count);
  const lastInstallment = total - perInstallment * (count - 1);

  return {
    count,
    surchargeRate: plan.surchargeRate,
    surcharge,
    total,
    perInstallment,
    lastInstallment,
  };
}
EOF

w src/cart.test.ts <<'EOF'
import { describe, expect, it } from "vitest";
import { cartTotals, lineTotal } from "./cart";

describe("lineTotal", () => {
  it("no pierde centavos con precios terminados en ,99", () => {
    expect(lineTotal({ sku: "A1", name: "Yerba 1kg", unitPrice: 19.99, quantity: 3 })).toBe(5997);
  });
});

describe("cartTotals", () => {
  it("aplica el descuento sobre el subtotal", () => {
    const totals = cartTotals([{ sku: "B2", name: "Termo", unitPrice: 1234.56, quantity: 1 }], 10);
    expect(totals.subtotal).toBe(123456);
    expect(totals.discount).toBe(12345);
    expect(totals.total).toBe(111111);
  });
});
EOF

commit "2026-10-10T12:20:00-03:00" "fix: sacar el parche del epsilon en carrito y cuotas"

########################################################################
# feat/recargo-cuotas: tramos de recargo configurables
########################################################################

branch feat/recargo-cuotas

w src/config.ts <<'EOF'
export const IVA_RATE = 0.21;
export const MAX_INSTALLMENTS = 12;

export type SurchargeTierLabel = "interestFree" | "low" | "medium" | "high";

export interface SurchargeTier {
  /** Cantidad mínima de cuotas del tramo (inclusive). */
  from: number;
  /** Cantidad máxima de cuotas del tramo (inclusive). */
  to: number;
  rate: number;
  label: SurchargeTierLabel;
}

export const SURCHARGE_TIERS: SurchargeTier[] = [
  { from: 1, to: 1, rate: 0, label: "interestFree" },
  { from: 2, to: 3, rate: 0.1, label: "low" },
  { from: 4, to: 6, rate: 0.2, label: "medium" },
  { from: 7, to: MAX_INSTALLMENTS, rate: 0.45, label: "high" },
];

export const SHOP = {
  name: "Almacén Demo",
  email: "ventas@example.com",
  cuit: "30-00000000-0",
};
EOF

w src/installments.ts <<'EOF'
import { MAX_INSTALLMENTS, SURCHARGE_TIERS, SurchargeTier } from "./config";
import { Cents, fromCents, toCents } from "./money";

export interface InstallmentQuote {
  count: number;
  tier: SurchargeTier;
  surchargeRate: number;
  surcharge: Cents;
  total: Cents;
  perInstallment: Cents;
  lastInstallment: Cents;
}

export function surchargeTierFor(
  count: number,
  tiers: SurchargeTier[] = SURCHARGE_TIERS,
): SurchargeTier | undefined {
  return tiers.find((t) => count >= t.from && count <= t.to);
}

export function isValidInstallmentCount(count: number, tiers: SurchargeTier[] = SURCHARGE_TIERS): boolean {
  return (
    Number.isInteger(count) &&
    count >= 1 &&
    count <= MAX_INSTALLMENTS &&
    surchargeTierFor(count, tiers) !== undefined
  );
}

export function quoteInstallments(
  amount: Cents,
  count: number,
  tiers: SurchargeTier[] = SURCHARGE_TIERS,
): InstallmentQuote {
  const tier = surchargeTierFor(count, tiers);
  if (!tier) {
    throw new Error(`No hay tramo de recargo para ${count} cuotas`);
  }

  // mismo parche que en cart.ts: sin el epsilon el recargo pierde un centavo
  const surcharge = toCents(fromCents(amount) * tier.rate + 0.001);
  const total = amount + surcharge;
  const perInstallment = Math.floor(total / count);
  const lastInstallment = total - perInstallment * (count - 1);

  return {
    count,
    tier,
    surchargeRate: tier.rate,
    surcharge,
    total,
    perInstallment,
    lastInstallment,
  };
}
EOF

w src/installments.test.ts <<'EOF'
import { describe, expect, it } from "vitest";
import { isValidInstallmentCount, quoteInstallments, surchargeTierFor } from "./installments";

describe("quoteInstallments", () => {
  it("1 cuota no tiene recargo", () => {
    const q = quoteInstallments(100000, 1);
    expect(q.surcharge).toBe(0);
    expect(q.total).toBe(100000);
    expect(q.perInstallment).toBe(100000);
  });

  it("3 cuotas suman 10% de recargo", () => {
    const q = quoteInstallments(100000, 3);
    expect(q.surcharge).toBe(10000);
    expect(q.total).toBe(110000);
    expect(q.perInstallment * 2 + q.lastInstallment).toBe(110000);
  });

  it("5 cuotas caen en el tramo medio (20%)", () => {
    const q = quoteInstallments(100000, 5);
    expect(q.tier.label).toBe("medium");
    expect(q.surcharge).toBe(20000);
  });

  it("acepta tramos custom", () => {
    const q = quoteInstallments(100000, 2, [{ from: 1, to: 2, rate: 0, label: "interestFree" }]);
    expect(q.surcharge).toBe(0);
  });

  it("rechaza cantidades sin tramo", () => {
    expect(() => quoteInstallments(1000, 13)).toThrow();
  });
});

describe("surchargeTierFor", () => {
  it("encuentra el tramo por rango inclusive", () => {
    expect(surchargeTierFor(4)?.label).toBe("medium");
    expect(surchargeTierFor(6)?.label).toBe("medium");
    expect(surchargeTierFor(7)?.label).toBe("high");
  });
});

describe("isValidInstallmentCount", () => {
  it("acepta de 1 a 12", () => {
    expect(isValidInstallmentCount(1)).toBe(true);
    expect(isValidInstallmentCount(12)).toBe(true);
  });

  it("rechaza 0, 13 y decimales", () => {
    expect(isValidInstallmentCount(0)).toBe(false);
    expect(isValidInstallmentCount(13)).toBe(false);
    expect(isValidInstallmentCount(2.5)).toBe(false);
  });
});
EOF

commit "2026-10-12T10:15:00-03:00" "feat: tramos de recargo configurables por cantidad de cuotas"

w src/copy.ts <<'EOF'
export const COPY = {
  checkout: {
    title: "Finalizá tu compra",
    payButton: "Pagar",
    installmentsLabel: "Cuotas",
    success: (count: number, amount: string) =>
      count === 1 ? `Listo! Pagaste ${amount}.` : `Listo! Vas a pagar ${count} cuotas de ${amount}.`,
  },
  installments: {
    tiers: {
      interestFree: "Sin interés",
      low: "Recargo bajo",
      medium: "Recargo medio",
      high: "Recargo alto",
    },
  },
  errors: {
    invalidEmail: "El email no es valido",
    emptyCart: "Tu carrito esta vacio",
    invalidAmount: "Hay un precio que no pudimos leer",
    invalidInstallments: "Elegí entre 1 y 12 cuotas",
    planUnavailable: "Ese plan de cuotas no esta disponible",
  },
  invoice: {
    header: "Factura B",
    customer: "Cliente",
    discount: "Descuento",
    surcharge: "Recargo por cuotas",
    surchargeDetail: (count: number, percent: number) => `Recargo por cuotas (${count} cuotas, ${percent}%)`,
    net: "Neto gravado",
    tax: "IVA 21%",
    total: "Total",
  },
} as const;
EOF

w src/invoice.ts <<'EOF'
import { CartItem, cartTotals, lineTotal } from "./cart";
import { IVA_RATE, SHOP } from "./config";
import { COPY } from "./copy";
import { InstallmentQuote } from "./installments";
import { Cents, formatARS, fromCents, toCents } from "./money";

export interface InvoiceLine {
  description: string;
  amount: Cents;
}

export interface Invoice {
  number: string;
  issuedAt: string;
  customerEmail: string;
  lines: InvoiceLine[];
  net: Cents;
  tax: Cents;
  total: Cents;
}

export interface InvoiceInput {
  number: string;
  issuedAt: string;
  customerEmail: string;
  items: CartItem[];
  discountPercent: number;
  quote?: InstallmentQuote;
}

/** Precio final con IVA incluido -> neto gravado. */
export function netFromGross(gross: Cents): Cents {
  return toCents(fromCents(gross) / (1 + IVA_RATE));
}

export function buildInvoice(input: InvoiceInput): Invoice {
  const totals = cartTotals(input.items, input.discountPercent);
  const lines: InvoiceLine[] = input.items.map((item) => ({
    description: `${item.quantity} x ${item.name}`,
    amount: lineTotal(item),
  }));

  if (totals.discount > 0) {
    lines.push({ description: COPY.invoice.discount, amount: -totals.discount });
  }

  let total = totals.total;
  if (input.quote && input.quote.surcharge > 0) {
    const percent = Math.round(input.quote.surchargeRate * 100);
    lines.push({
      description: COPY.invoice.surchargeDetail(input.quote.count, percent),
      amount: input.quote.surcharge,
    });
    total += input.quote.surcharge;
  }

  const net = netFromGross(total);
  return {
    number: input.number,
    issuedAt: input.issuedAt,
    customerEmail: input.customerEmail,
    lines,
    net,
    tax: total - net,
    total,
  };
}

export function renderInvoiceText(inv: Invoice): string {
  const rows = inv.lines.map((l) => `${l.description.padEnd(32)} ${formatARS(l.amount)}`);
  return [
    `${SHOP.name} - ${COPY.invoice.header} ${inv.number}`,
    `${SHOP.email} | CUIT ${SHOP.cuit}`,
    `${COPY.invoice.customer}: ${inv.customerEmail}`,
    "",
    ...rows,
    "",
    `${COPY.invoice.net}: ${formatARS(inv.net)}`,
    `${COPY.invoice.tax}: ${formatARS(inv.tax)}`,
    `${COPY.invoice.total}: ${formatARS(inv.total)}`,
  ].join("\n");
}
EOF

w src/api/checkout.ts <<'EOF'
import { CartItem, cartTotals } from "../cart";
import { COPY } from "../copy";
import { isValidInstallmentCount, quoteInstallments } from "../installments";
import { Invoice, buildInvoice } from "../invoice";
import { formatARS, parseARS } from "../money";

export interface CheckoutRequest {
  email: string;
  items: Array<{ sku: string; name: string; price: string; quantity: number }>;
  installments: number;
  couponPercent?: number;
}

export type CheckoutResponse =
  | {
      status: 200;
      body: {
        ok: true;
        total: string;
        perInstallment: string;
        surchargeLabel: string;
        message: string;
        invoice: Invoice;
      };
    }
  | { status: 400 | 422; body: { ok: false; error: string } };

function fail(status: 400 | 422, error: string): CheckoutResponse {
  return { status, body: { ok: false, error } };
}

function invoiceNumber(now: Date): string {
  return `0001-${String(now.getTime()).slice(-8)}`;
}

export function handleCheckout(req: CheckoutRequest, now: Date = new Date()): CheckoutResponse {
  if (!req.email || !req.email.includes("@")) {
    return fail(400, COPY.errors.invalidEmail);
  }
  if (!req.items || req.items.length === 0) {
    return fail(400, COPY.errors.emptyCart);
  }
  if (typeof req.installments !== "number" || !isValidInstallmentCount(req.installments)) {
    return fail(422, COPY.errors.invalidInstallments);
  }

  let items: CartItem[];
  try {
    items = req.items.map((i) => ({
      sku: i.sku,
      name: i.name,
      unitPrice: parseARS(i.price),
      quantity: i.quantity,
    }));
  } catch {
    return fail(400, COPY.errors.invalidAmount);
  }

  const discountPercent = req.couponPercent ?? 0;
  const totals = cartTotals(items, discountPercent);

  let quote;
  try {
    quote = quoteInstallments(totals.total, req.installments);
  } catch {
    return fail(422, COPY.errors.planUnavailable);
  }

  const invoice = buildInvoice({
    number: invoiceNumber(now),
    issuedAt: now.toISOString(),
    customerEmail: req.email,
    items,
    discountPercent,
    quote,
  });

  return {
    status: 200,
    body: {
      ok: true,
      total: formatARS(quote.total),
      perInstallment: formatARS(quote.perInstallment),
      surchargeLabel: COPY.installments.tiers[quote.tier.label],
      message: COPY.checkout.success(quote.count, formatARS(quote.perInstallment)),
      invoice,
    },
  };
}
EOF

commit "2026-10-12T16:40:00-03:00" "feat: mostrar el tramo de recargo en la factura y en la respuesta del checkout"

########################################################################
# chore/copy-y-renames: cambios "triviales"
########################################################################

branch chore/copy-y-renames

w src/copy.ts <<'EOF'
export const COPY = {
  checkout: {
    title: "Finalizá tu compra",
    payButton: "Pagar ahora",
    installmentsLabel: "Cuotas",
    success: (count: number, amount: string) =>
      count === 1
        ? `¡Listo! Pagaste ${amount}.`
        : `¡Listo! Vas a pagar ${count} cuotas de ${amount}.`,
  },
  errors: {
    invalidEmail: "El email no es válido",
    emptyCart: "Tu carrito está vacío",
    invalidAmount: "Hay un precio que no pudimos leer",
    invalidInstallments: "Cantidad de cuotas inválida",
    planUnavailable: "Ese plan de cuotas no está disponible",
  },
  invoice: {
    header: "Factura B",
    customer: "Cliente",
    discount: "Descuento",
    surcharge: "Recargo por cuotas",
    net: "Neto gravado",
    tax: "IVA 21%",
    total: "Total",
  },
} as const;
EOF

commit "2026-10-14T09:30:00-03:00" "chore: tildes y wording en los textos del checkout"

w src/invoice.ts <<'EOF'
import { CartItem, cartTotals, lineTotal } from "./cart";
import { IVA_RATE, SHOP } from "./config";
import { COPY } from "./copy";
import { InstallmentQuote } from "./installments";
import { Cents, formatARS, fromCents, toCents } from "./money";

export interface InvoiceLine {
  description: string;
  amount: Cents;
}

export interface Invoice {
  number: string;
  issuedAt: string;
  customerEmail: string;
  lines: InvoiceLine[];
  net: Cents;
  tax: Cents;
  total: Cents;
}

export interface InvoiceInput {
  number: string;
  issuedAt: string;
  customerEmail: string;
  items: CartItem[];
  discountPercent: number;
  quote?: InstallmentQuote;
}

/** Precio final con IVA incluido -> neto gravado. */
export function netFromGross(gross: Cents): Cents {
  return toCents(fromCents(gross) / (1 + IVA_RATE));
}

export function buildInvoice(input: InvoiceInput): Invoice {
  const totals = cartTotals(input.items, input.discountPercent);
  const lines: InvoiceLine[] = input.items.map((item) => ({
    description: `${item.quantity} x ${item.name}`,
    amount: lineTotal(item),
  }));

  if (totals.discount > 0) {
    lines.push({ description: COPY.invoice.discount, amount: -totals.discount });
  }

  let total = totals.total;
  if (input.quote && input.quote.surcharge > 0) {
    lines.push({
      description: `${COPY.invoice.surcharge} (${input.quote.count} cuotas)`,
      amount: input.quote.surcharge,
    });
    total += input.quote.surcharge;
  }

  const net = netFromGross(total);
  return {
    number: input.number,
    issuedAt: input.issuedAt,
    customerEmail: input.customerEmail,
    lines,
    net,
    tax: total - net,
    total,
  };
}

export function renderInvoiceText(invoice: Invoice): string {
  const rows = invoice.lines.map(
    (line) => `${line.description.padEnd(32)} ${formatARS(line.amount)}`,
  );
  return [
    `${SHOP.name} - ${COPY.invoice.header} ${invoice.number}`,
    `${SHOP.email} | CUIT ${SHOP.cuit}`,
    `${COPY.invoice.customer}: ${invoice.customerEmail}`,
    "",
    ...rows,
    "",
    `${COPY.invoice.net}: ${formatARS(invoice.net)}`,
    `${COPY.invoice.tax}: ${formatARS(invoice.tax)}`,
    `${COPY.invoice.total}: ${formatARS(invoice.total)}`,
  ].join("\n");
}
EOF

w src/api/checkout.ts <<'EOF'
import { CartItem, cartTotals } from "../cart";
import { COPY } from "../copy";
import { isValidInstallmentCount, quoteInstallments } from "../installments";
import { Invoice, buildInvoice } from "../invoice";
import { formatARS, parseARS } from "../money";

export interface CheckoutRequest {
  email: string;
  items: Array<{ sku: string; name: string; price: string; quantity: number }>;
  installments: number;
  couponPercent?: number;
}

export type CheckoutResponse =
  | {
      status: 200;
      body: { ok: true; total: string; perInstallment: string; message: string; invoice: Invoice };
    }
  | { status: 400 | 422; body: { ok: false; error: string } };

function fail(status: 400 | 422, error: string): CheckoutResponse {
  return { status, body: { ok: false, error } };
}

function invoiceNumber(now: Date): string {
  return `0001-${String(now.getTime()).slice(-8)}`;
}

export function handleCheckout(req: CheckoutRequest, now: Date = new Date()): CheckoutResponse {
  if (!req.email || !req.email.includes("@")) {
    return fail(400, COPY.errors.invalidEmail);
  }
  if (!req.items || req.items.length === 0) {
    return fail(400, COPY.errors.emptyCart);
  }
  if (!isValidInstallmentCount(req.installments)) {
    return fail(422, COPY.errors.invalidInstallments);
  }

  let items: CartItem[];
  try {
    items = req.items.map((raw) => ({
      sku: raw.sku,
      name: raw.name,
      unitPrice: parseARS(raw.price),
      quantity: raw.quantity,
    }));
  } catch {
    return fail(400, COPY.errors.invalidAmount);
  }

  const discountPercent = req.couponPercent ?? 0;
  const summary = cartTotals(items, discountPercent);

  let quote;
  try {
    quote = quoteInstallments(summary.total, req.installments);
  } catch {
    return fail(422, COPY.errors.planUnavailable);
  }

  const invoice = buildInvoice({
    number: invoiceNumber(now),
    issuedAt: now.toISOString(),
    customerEmail: req.email,
    items,
    discountPercent,
    quote,
  });

  return {
    status: 200,
    body: {
      ok: true,
      total: formatARS(quote.total),
      perInstallment: formatARS(quote.perInstallment),
      message: COPY.checkout.success(quote.count, formatARS(quote.perInstallment)),
      invoice,
    },
  };
}
EOF

commit "2026-10-14T09:50:00-03:00" "chore: renombres y formato en factura y checkout"

########################################################################
# fix/redondeo-mezclado: PR "estilo AI" con cosas mezcladas
########################################################################

branch fix/redondeo-mezclado

w src/invoice.ts <<'EOF'
import { CartItem, CartTotals, cartTotals, lineTotal } from "./cart";
import { IVA_RATE, SHOP } from "./config";
import { COPY } from "./copy";
import { InstallmentQuote } from "./installments";
import { Cents, formatARS } from "./money";

export interface InvoiceLine {
  description: string;
  amount: Cents;
}

export interface Invoice {
  number: string;
  issuedAt: string;
  customerEmail: string;
  lines: InvoiceLine[];
  net: Cents;
  tax: Cents;
  total: Cents;
}

export interface InvoiceInput {
  number: string;
  issuedAt: string;
  customerEmail: string;
  items: CartItem[];
  discountPercent: number;
  quote?: InstallmentQuote;
}

/** Precio final con IVA incluido -> neto gravado (redondeado al centavo). */
export function netFromGross(gross: Cents): Cents {
  return Math.round(gross / (1 + IVA_RATE));
}

function buildInvoiceLines(items: CartItem[], totals: CartTotals, quote?: InstallmentQuote): InvoiceLine[] {
  const lines: InvoiceLine[] = items.map((item) => ({
    description: `${item.quantity} x ${item.name}`,
    amount: lineTotal(item),
  }));

  if (totals.discount > 0) {
    lines.push({ description: COPY.invoice.discount, amount: -totals.discount });
  }

  if (quote && quote.surcharge > 0) {
    lines.push({
      description: `${COPY.invoice.surcharge} (${quote.count} cuotas)`,
      amount: quote.surcharge,
    });
  }

  return lines;
}

export function buildInvoice(input: InvoiceInput): Invoice {
  const totals = cartTotals(input.items, input.discountPercent);
  const lines = buildInvoiceLines(input.items, totals, input.quote);
  const total = totals.total + (input.quote?.surcharge ?? 0);

  const net = netFromGross(total);
  return {
    number: input.number,
    issuedAt: input.issuedAt,
    customerEmail: input.customerEmail,
    lines,
    net,
    tax: total - net,
    total,
  };
}

export function renderInvoiceText(inv: Invoice): string {
  const rows = inv.lines.map((l) => `${l.description.padEnd(32)} ${formatARS(l.amount)}`);
  return [
    `${SHOP.name} - ${COPY.invoice.header} ${inv.number}`,
    `${SHOP.email} | CUIT ${SHOP.cuit}`,
    `${COPY.invoice.customer}: ${inv.customerEmail}`,
    "",
    ...rows,
    "",
    `${COPY.invoice.net}: ${formatARS(inv.net)}`,
    `${COPY.invoice.tax}: ${formatARS(inv.tax)}`,
    `${COPY.invoice.total}: ${formatARS(inv.total)}`,
  ].join("\n");
}
EOF

w src/copy.ts <<'EOF'
export const COPY = {
  checkout: {
    title: "Finalizá tu compra",
    payButton: "Pagar",
    installmentsLabel: "Cuotas",
    success: (count: number, amount: string) =>
      count === 1 ? `Listo! Pagaste ${amount}.` : `Listo! Vas a pagar ${count} cuotas de ${amount}.`,
  },
  errors: {
    invalidEmail: "El email no es valido",
    emptyCart: "Tu carrito esta vacio",
    invalidAmount: "Hay un precio que no pudimos leer",
    invalidInstallments: "Cantidad de cuotas invalida",
    planUnavailable: "Ese plan de cuotas no esta disponible",
  },
  invoice: {
    header: "Factura B",
    customer: "Cliente",
    discount: "Descuento",
    surcharge: "Recargo por cuotas",
    net: "Subtotal neto",
    tax: "IVA (21%)",
    total: "Total",
  },
} as const;
EOF

commit "2026-10-16T14:05:00-03:00" "fix: redondeo del IVA en la factura"

w src/installments.ts <<'EOF'
import { INSTALLMENT_PLANS, MAX_INSTALLMENTS } from "./config";
import { Cents, fromCents, toCents } from "./money";

export interface InstallmentQuote {
  count: number;
  surchargeRate: number;
  surcharge: Cents;
  total: Cents;
  perInstallment: Cents;
  lastInstallment: Cents;
}

export function isValidInstallmentCount(count: number): boolean {
  return Number.isInteger(count) && count > 0 && count < MAX_INSTALLMENTS;
}

export function quoteInstallments(amount: Cents, count: number): InstallmentQuote {
  const plan = INSTALLMENT_PLANS.find((p) => p.count === count);
  if (!plan) {
    throw new Error(`No hay plan de ${count} cuotas`);
  }

  // mismo parche que en cart.ts: sin el epsilon el recargo pierde un centavo
  const surcharge = toCents(fromCents(amount) * plan.surchargeRate + 0.001);
  const total = amount + surcharge;
  const perInstallment = Math.floor(total / count);
  const lastInstallment = total - perInstallment * (count - 1);

  return {
    count,
    surchargeRate: plan.surchargeRate,
    surcharge,
    total,
    perInstallment,
    lastInstallment,
  };
}
EOF

w src/copy.ts <<'EOF'
export const COPY = {
  checkout: {
    title: "Finalizá tu compra",
    payButton: "Pagar",
    installmentsLabel: "Cuotas",
    success: (count: number, amount: string) =>
      count === 1 ? `Listo! Pagaste ${amount}.` : `Listo! Vas a pagar ${count} cuotas de ${amount}.`,
  },
  errors: {
    invalidEmail: "El email no es valido",
    emptyCart: "Tu carrito esta vacio",
    invalidAmount: "Hay un precio que no pudimos leer",
    invalidInstallments: "Elegí una cantidad de cuotas válida",
    planUnavailable: "Ese plan de cuotas no esta disponible",
  },
  invoice: {
    header: "Factura B",
    customer: "Cliente",
    discount: "Descuento",
    surcharge: "Recargo por cuotas",
    net: "Subtotal neto",
    tax: "IVA (21%)",
    total: "Total",
  },
} as const;
EOF

commit "2026-10-16T14:30:00-03:00" "refactor: simplificar validación de cuotas y ajustar textos"

########################################################################
# main #4: cupones de descuento (nacen con dos bugs: el descuento se calcula
# sobre el precio con IVA y se pueden sumar varios cupones)
#
# Va al final y sobre main, así las ramas de arriba no cambian de SHA ni de
# merge-base.
########################################################################

git checkout -q main

w db/migrations/001_coupons.sql <<'EOF'
CREATE TABLE coupons (
  code    TEXT PRIMARY KEY,
  percent INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 100)
);

CREATE TABLE order_coupons (
  order_id    TEXT NOT NULL,
  coupon_code TEXT NOT NULL REFERENCES coupons (code),
  PRIMARY KEY (order_id, coupon_code)
);
EOF

w src/types.ts <<'EOF'
import { Cents } from "./money";

export interface Coupon {
  code: string;
  /** 10 = 10% */
  percent: number;
}

/** Cómo queda el precio después de aplicar cupones. */
export interface Pricing {
  subtotal: Cents;
  discount: Cents;
  net: Cents;
  iva: Cents;
  total: Cents;
  couponCodes: string[];
}
EOF

w src/tax.ts <<'EOF'
import { IVA_RATE } from "./config";
import { Cents } from "./money";

/** Precio con IVA incluido -> neto sin IVA. */
export function netFromGross(gross: Cents): Cents {
  return Math.round(gross / (1 + IVA_RATE));
}

/** Neto sin IVA -> precio final. */
export function addIva(net: Cents): Cents {
  return net + Math.round(net * IVA_RATE);
}
EOF

w src/coupons.ts <<'EOF'
import { Cents, percentOf } from "./money";
import { addIva, netFromGross } from "./tax";
import { Coupon, Pricing } from "./types";

/**
 * Aplica los cupones al subtotal del carrito.
 * `gross` viene con IVA incluido (precios de catálogo).
 */
export function priceWithCoupons(gross: Cents, coupons: Coupon[]): Pricing {
  let discount = 0;
  for (const coupon of coupons) {
    discount += percentOf(gross, coupon.percent);
  }
  const net = netFromGross(gross) - discount;
  const total = addIva(net);
  return {
    subtotal: gross,
    discount,
    net,
    iva: total - net,
    total,
    couponCodes: coupons.map((c) => c.code),
  };
}
EOF

w src/db/coupons.ts <<'EOF'
import { Coupon } from "../types";

/** Tabla coupons. En memoria para la demo. */
const rows = [
  { code: "VERANO10", percent: 10 },
  { code: "BIENVENIDA15", percent: 15 },
];

export function findCoupon(code: string): Coupon | null {
  const row = rows.find((r) => r.code === code);
  if (!row) return null;
  return { code: row.code, percent: row.percent };
}

/** Para el panel de admin: todos los códigos cargados. */
export function listCouponCodes(): string[] {
  return rows.map((r) => r.code).sort();
}

export function couponExists(code: string): boolean {
  return findCoupon(code) !== null;
}
EOF

w src/emails/receipt.ts <<'EOF'
import { SHOP } from "../config";
import { COPY } from "../copy";
import { InstallmentQuote } from "../installments";
import { Invoice } from "../invoice";
import { formatARS } from "../money";

export interface ReceiptEmail {
  to: string;
  subject: string;
  text: string;
}

export function renderReceipt(invoice: Invoice, quote: InstallmentQuote): ReceiptEmail {
  const lines = [
    COPY.receipt.thanks,
    "",
    `${COPY.receipt.total}: ${formatARS(invoice.total)}`,
    `${COPY.receipt.installments}: ${quote.count} x ${formatARS(quote.perInstallment)}`,
    "",
    `${SHOP.name} | ${SHOP.email}`,
  ];
  return {
    to: invoice.customerEmail,
    subject: COPY.receipt.subject(invoice.number),
    text: lines.join("\n"),
  };
}
EOF

w src/copy.ts <<'EOF'
export const COPY = {
  checkout: {
    title: "Finalizá tu compra",
    payButton: "Pagar",
    installmentsLabel: "Cuotas",
    success: (count: number, amount: string) =>
      count === 1 ? `Listo! Pagaste ${amount}.` : `Listo! Vas a pagar ${count} cuotas de ${amount}.`,
  },
  errors: {
    invalidEmail: "El email no es valido",
    emptyCart: "Tu carrito esta vacio",
    invalidAmount: "Hay un precio que no pudimos leer",
    invalidInstallments: "Cantidad de cuotas invalida",
    planUnavailable: "Ese plan de cuotas no esta disponible",
  },
  invoice: {
    header: "Factura B",
    customer: "Cliente",
    discount: "Descuento",
    surcharge: "Recargo por cuotas",
    net: "Neto gravado",
    tax: "IVA 21%",
    total: "Total",
  },
  receipt: {
    subject: (number: string) => `Tu compra ${number}`,
    thanks: "Gracias por tu compra!",
    total: "Total",
    installments: "Cuotas",
  },
} as const;
EOF

w src/invoice.ts <<'EOF'
import { CartItem, lineTotal } from "./cart";
import { IVA_RATE, SHOP } from "./config";
import { COPY } from "./copy";
import { InstallmentQuote } from "./installments";
import { Cents, formatARS, fromCents, toCents } from "./money";
import { Pricing } from "./types";

export interface InvoiceLine {
  description: string;
  amount: Cents;
}

export interface Invoice {
  number: string;
  issuedAt: string;
  customerEmail: string;
  lines: InvoiceLine[];
  net: Cents;
  tax: Cents;
  total: Cents;
}

export interface InvoiceInput {
  number: string;
  issuedAt: string;
  customerEmail: string;
  items: CartItem[];
  pricing: Pricing;
  quote?: InstallmentQuote;
}

/** Precio final con IVA incluido -> neto gravado. */
export function netFromGross(gross: Cents): Cents {
  return toCents(fromCents(gross) / (1 + IVA_RATE));
}

export function buildInvoice(input: InvoiceInput): Invoice {
  const lines: InvoiceLine[] = input.items.map((item) => ({
    description: `${item.quantity} x ${item.name}`,
    amount: lineTotal(item),
  }));

  let total = input.pricing.total;
  if (input.quote && input.quote.surcharge > 0) {
    lines.push({
      description: `${COPY.invoice.surcharge} (${input.quote.count} cuotas)`,
      amount: input.quote.surcharge,
    });
    total += input.quote.surcharge;
  }

  const net = netFromGross(total);
  return {
    number: input.number,
    issuedAt: input.issuedAt,
    customerEmail: input.customerEmail,
    lines,
    net,
    tax: total - net,
    total,
  };
}

export function renderInvoiceText(inv: Invoice): string {
  const rows = inv.lines.map((l) => `${l.description.padEnd(32)} ${formatARS(l.amount)}`);
  return [
    `${SHOP.name} - ${COPY.invoice.header} ${inv.number}`,
    `${SHOP.email} | CUIT ${SHOP.cuit}`,
    `${COPY.invoice.customer}: ${inv.customerEmail}`,
    "",
    ...rows,
    "",
    `${COPY.invoice.net}: ${formatARS(inv.net)}`,
    `${COPY.invoice.tax}: ${formatARS(inv.tax)}`,
    `${COPY.invoice.total}: ${formatARS(inv.total)}`,
  ].join("\n");
}
EOF

w src/api/checkout.ts <<'EOF'
import { CartItem, cartTotals } from "../cart";
import { COPY } from "../copy";
import { priceWithCoupons } from "../coupons";
import { findCoupon } from "../db/coupons";
import { ReceiptEmail, renderReceipt } from "../emails/receipt";
import { isValidInstallmentCount, quoteInstallments } from "../installments";
import { Invoice, buildInvoice } from "../invoice";
import { formatARS, parseARS } from "../money";
import { Coupon } from "../types";

export interface CheckoutRequest {
  email: string;
  items: Array<{ sku: string; name: string; price: string; quantity: number }>;
  installments: number;
  couponCodes?: string[];
}

export type CheckoutResponse =
  | {
      status: 200;
      body: {
        ok: true;
        total: string;
        perInstallment: string;
        message: string;
        invoice: Invoice;
        receipt: ReceiptEmail;
      };
    }
  | { status: 400 | 422; body: { ok: false; error: string } };

function fail(status: 400 | 422, error: string): CheckoutResponse {
  return { status, body: { ok: false, error } };
}

function invoiceNumber(now: Date): string {
  return `0001-${String(now.getTime()).slice(-8)}`;
}

export function handleCheckout(req: CheckoutRequest, now: Date = new Date()): CheckoutResponse {
  if (!req.email || !req.email.includes("@")) {
    return fail(400, COPY.errors.invalidEmail);
  }
  if (!req.items || req.items.length === 0) {
    return fail(400, COPY.errors.emptyCart);
  }
  if (!isValidInstallmentCount(req.installments)) {
    return fail(422, COPY.errors.invalidInstallments);
  }

  let items: CartItem[];
  try {
    items = req.items.map((i) => ({
      sku: i.sku,
      name: i.name,
      unitPrice: parseARS(i.price),
      quantity: i.quantity,
    }));
  } catch {
    return fail(400, COPY.errors.invalidAmount);
  }

  const totals = cartTotals(items);
  const coupons = (req.couponCodes ?? [])
    .map((code) => findCoupon(code))
    .filter((c): c is Coupon => c !== null);
  const pricing = priceWithCoupons(totals.subtotal, coupons);

  let quote;
  try {
    quote = quoteInstallments(pricing.total, req.installments);
  } catch {
    return fail(422, COPY.errors.planUnavailable);
  }

  const invoice = buildInvoice({
    number: invoiceNumber(now),
    issuedAt: now.toISOString(),
    customerEmail: req.email,
    items,
    pricing,
    quote,
  });

  return {
    status: 200,
    body: {
      ok: true,
      total: formatARS(quote.total),
      perInstallment: formatARS(quote.perInstallment),
      message: COPY.checkout.success(quote.count, formatARS(quote.perInstallment)),
      invoice,
      receipt: renderReceipt(invoice, quote),
    },
  };
}
EOF

commit "2026-10-18T10:00:00-03:00" "feat: cupones de descuento en el checkout"

########################################################################
# fix/cupones-acumulados: PR grande, muchos archivos y un bug escondido
# (isCouponActive usa < y el cupón deja de valer su último día)
########################################################################

branch fix/cupones-acumulados

w db/migrations/002_coupons_vigencia.sql <<'EOF'
-- Vigencia y compra mínima de cada cupón
ALTER TABLE coupons ADD COLUMN min_subtotal_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE coupons ADD COLUMN expires_on DATE;

UPDATE coupons SET expires_on = '2026-12-31' WHERE expires_on IS NULL;
ALTER TABLE coupons ALTER COLUMN expires_on SET NOT NULL;

-- Un solo cupón por orden
CREATE UNIQUE INDEX order_coupons_one_per_order ON order_coupons (order_id);
EOF

w src/config.ts <<'EOF'
export const IVA_RATE = 0.21;
export const MAX_INSTALLMENTS = 12;
export const MAX_COUPONS_PER_ORDER = 1;
export const TIMEZONE = "America/Argentina/Buenos_Aires";

export const INSTALLMENT_PLANS = [
  { count: 1, surchargeRate: 0 },
  { count: 3, surchargeRate: 0.1 },
  { count: 6, surchargeRate: 0.2 },
  { count: 12, surchargeRate: 0.45 },
];

export const SHOP = {
  name: "Almacén Demo",
  email: "ventas@example.com",
  cuit: "30-00000000-0",
};
EOF

w src/types.ts <<'EOF'
import { Cents } from "./money";

export interface Coupon {
  code: string;
  /** 10 = 10% */
  percent: number;
  /** Compra mínima, sin IVA, para que el cupón valga */
  minSubtotal: Cents;
  /** Último día en que vale, "AAAA-MM-DD" */
  expiresOn: string;
}

/** Cómo queda el precio después de aplicar el cupón. */
export interface Pricing {
  /** Sin IVA, antes del descuento */
  subtotal: Cents;
  /** Sin IVA */
  discount: Cents;
  /** Lo que se ahorra el cliente, con IVA */
  discountWithIva: Cents;
  net: Cents;
  iva: Cents;
  total: Cents;
  couponCode: string | null;
}
EOF

git mv src/db/coupons.ts src/db/coupons-repo.ts
w src/db/coupons-repo.ts <<'EOF'
import { Coupon } from "../types";

/** Tabla coupons. En memoria para la demo. */
const rows = [
  { code: "VERANO10", percent: 10, min_subtotal_cents: 2000000, expires_on: "2026-12-31" },
  { code: "BIENVENIDA15", percent: 15, min_subtotal_cents: 0, expires_on: "2026-11-30" },
];

export function findCoupon(code: string): Coupon | null {
  const row = rows.find((r) => r.code === code.trim().toUpperCase());
  if (!row) return null;
  return { code: row.code, percent: row.percent, minSubtotal: row.min_subtotal_cents, expiresOn: row.expires_on };
}

/** Para el panel de admin: todos los códigos cargados. */
export function listCouponCodes(): string[] {
  return rows.map((r) => r.code).sort();
}

export function couponExists(code: string): boolean {
  return findCoupon(code) !== null;
}
EOF

w src/coupons.ts <<'EOF'
import { TIMEZONE } from "./config";
import { Cents, percentOf } from "./money";
import { addIva, netFromGross } from "./tax";
import { Coupon, Pricing } from "./types";

/** Fecha de hoy en Argentina, "AAAA-MM-DD". */
function localDay(now: Date): string {
  return now.toLocaleDateString("sv-SE", { timeZone: TIMEZONE });
}

/** `expiresOn` es el último día en que el cupón vale. */
export function isCouponActive(coupon: Coupon, now: Date): boolean {
  return localDay(now) < coupon.expiresOn;
}

/** El mínimo se compara contra el subtotal sin IVA. */
export function meetsMinimum(coupon: Coupon, subtotal: Cents): boolean {
  return subtotal >= coupon.minSubtotal;
}

/**
 * Precio final con un cupón como máximo.
 * El descuento sale del subtotal sin IVA y el IVA se calcula sobre lo que queda.
 */
export function priceWithCoupon(gross: Cents, coupon: Coupon | null): Pricing {
  const subtotal = netFromGross(gross);
  if (!coupon) {
    return { subtotal, discount: 0, discountWithIva: 0, net: subtotal, iva: gross - subtotal, total: gross, couponCode: null };
  }
  const discount = percentOf(subtotal, coupon.percent);
  const net = subtotal - discount;
  const total = addIva(net);
  return {
    subtotal,
    discount,
    discountWithIva: gross - total,
    net,
    iva: total - net,
    total,
    couponCode: coupon.code,
  };
}
EOF

w src/api/coupons.ts <<'EOF'
import { COPY } from "../copy";
import { isCouponActive, meetsMinimum, priceWithCoupon } from "../coupons";
import { findCoupon } from "../db/coupons-repo";
import { formatARS } from "../money";
import { netFromGross } from "../tax";

export interface ValidateCouponRequest {
  code: string;
  /** Subtotal del carrito en centavos, con IVA (lo que ve el cliente) */
  subtotal: number;
}

export type ValidateCouponResponse =
  | { status: 200; body: { ok: true; code: string; discount: string; total: string } }
  | { status: 404 | 422; body: { ok: false; error: string } };

/** POST /api/coupons/validate: el front lo llama cuando el cliente carga el cupón. */
export function handleValidateCoupon(req: ValidateCouponRequest, now: Date = new Date()): ValidateCouponResponse {
  const coupon = findCoupon(req.code);
  if (!coupon) {
    return { status: 404, body: { ok: false, error: COPY.errors.couponNotFound } };
  }
  if (!isCouponActive(coupon, now)) {
    return { status: 422, body: { ok: false, error: COPY.errors.couponExpired } };
  }
  if (!meetsMinimum(coupon, netFromGross(req.subtotal))) {
    return { status: 422, body: { ok: false, error: COPY.errors.couponMinimum(formatARS(coupon.minSubtotal)) } };
  }

  const pricing = priceWithCoupon(req.subtotal, coupon);
  return {
    status: 200,
    body: { ok: true, code: coupon.code, discount: formatARS(pricing.discountWithIva), total: formatARS(pricing.total) },
  };
}
EOF

w src/copy.ts <<'EOF'
export const COPY = {
  checkout: {
    title: "Finalizá tu compra",
    payButton: "Pagar",
    installmentsLabel: "Cuotas",
    success: (count: number, amount: string) =>
      count === 1 ? `Listo! Pagaste ${amount}.` : `Listo! Vas a pagar ${count} cuotas de ${amount}.`,
  },
  errors: {
    invalidEmail: "El email no es valido",
    emptyCart: "Tu carrito esta vacio",
    invalidAmount: "Hay un precio que no pudimos leer",
    invalidInstallments: "Cantidad de cuotas invalida",
    planUnavailable: "Ese plan de cuotas no esta disponible",
    tooManyCoupons: "Solo se puede usar un cupón por compra",
    couponNotFound: "Ese cupón no existe",
    couponExpired: "Ese cupón ya venció",
    couponMinimum: (min: string) => `El cupón vale para compras desde ${min} sin IVA`,
  },
  invoice: {
    header: "Factura B",
    customer: "Cliente",
    coupon: "Cupón",
    surcharge: "Recargo por cuotas",
    net: "Neto gravado",
    tax: "IVA 21%",
    total: "Total",
  },
  receipt: {
    subject: (number: string) => `Tu compra ${number}`,
    thanks: "Gracias por tu compra!",
    total: "Total",
    coupon: "Cupón",
    installments: "Cuotas",
    savedPerInstallment: (amount: string) => `Ahorrás ${amount} en cada cuota`,
  },
} as const;
EOF

w src/coupons.test.ts <<'EOF'
import { describe, expect, it } from "vitest";
import { isCouponActive, meetsMinimum, priceWithCoupon } from "./coupons";
import { Coupon } from "./types";

const verano: Coupon = { code: "VERANO10", percent: 10, minSubtotal: 2000000, expiresOn: "2026-12-31" };

describe("priceWithCoupon", () => {
  it("descuenta sobre el subtotal sin IVA", () => {
    const p = priceWithCoupon(12100000, verano);
    expect(p.subtotal).toBe(10000000);
    expect(p.discount).toBe(1000000);
    expect(p.iva).toBe(1890000);
    expect(p.total).toBe(10890000);
  });

  it("sin cupón cobra el precio de lista", () => {
    expect(priceWithCoupon(1999, null).total).toBe(1999);
  });
});

describe("isCouponActive", () => {
  it("vale antes del vencimiento", () => {
    expect(isCouponActive(verano, new Date("2026-12-15T12:00:00-03:00"))).toBe(true);
  });

  it("no vale después del vencimiento", () => {
    expect(isCouponActive(verano, new Date("2027-01-02T12:00:00-03:00"))).toBe(false);
  });
});

describe("meetsMinimum", () => {
  it("pide el mínimo sin IVA", () => {
    expect(meetsMinimum(verano, 2000000)).toBe(true);
    expect(meetsMinimum(verano, 1999999)).toBe(false);
  });
});
EOF

commit "2026-10-20T11:00:00-03:00" "fix: un solo cupón por compra, con vigencia y monto mínimo"

w src/cart.ts <<'EOF'
import { Cents, addCents, toCents } from "./money";

export interface CartItem {
  sku: string;
  name: string;
  /** Precio unitario en pesos, tal cual viene del catálogo. */
  unitPrice: number;
  quantity: number;
}

export interface CartTotals {
  /** Suma de precios de catálogo, con IVA incluido */
  subtotal: Cents;
}

export function lineTotal(item: CartItem): Cents {
  // FIXME: toCents(19.99) da 1998, se pierde un centavo por item.
  // Le sumamos un epsilon hasta que alguien lo arregle en money.ts.
  return toCents(item.unitPrice + 0.001) * item.quantity;
}

export function cartTotals(items: CartItem[]): CartTotals {
  return { subtotal: addCents(...items.map(lineTotal)) };
}
EOF

w src/installments.ts <<'EOF'
import { INSTALLMENT_PLANS, MAX_INSTALLMENTS } from "./config";
import { Cents, fromCents, toCents } from "./money";

export interface InstallmentQuote {
  count: number;
  surchargeRate: number;
  surcharge: Cents;
  total: Cents;
  perInstallment: Cents;
  lastInstallment: Cents;
  /** Parte del descuento del cupón que le toca a cada cuota */
  discountPerInstallment: Cents;
  lastDiscount: Cents;
}

export function isValidInstallmentCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= MAX_INSTALLMENTS;
}

export function quoteInstallments(amount: Cents, count: number, discount: Cents = 0): InstallmentQuote {
  const plan = INSTALLMENT_PLANS.find((p) => p.count === count);
  if (!plan) {
    throw new Error(`No hay plan de ${count} cuotas`);
  }

  // mismo parche que en cart.ts: sin el epsilon el recargo pierde un centavo
  const surcharge = toCents(fromCents(amount) * plan.surchargeRate + 0.001);
  const total = amount + surcharge;
  const perInstallment = Math.floor(total / count);
  const lastInstallment = total - perInstallment * (count - 1);
  const discountPerInstallment = Math.floor(discount / count);
  const lastDiscount = discount - discountPerInstallment * (count - 1);

  return {
    count,
    surchargeRate: plan.surchargeRate,
    surcharge,
    total,
    perInstallment,
    lastInstallment,
    discountPerInstallment,
    lastDiscount,
  };
}
EOF

w src/invoice.ts <<'EOF'
import { CartItem, lineTotal } from "./cart";
import { SHOP } from "./config";
import { COPY } from "./copy";
import { InstallmentQuote } from "./installments";
import { Cents, formatARS } from "./money";
import { netFromGross } from "./tax";
import { Pricing } from "./types";

export interface InvoiceLine {
  description: string;
  amount: Cents;
}

export interface Invoice {
  number: string;
  issuedAt: string;
  customerEmail: string;
  lines: InvoiceLine[];
  coupon: { code: string; amount: Cents } | null;
  net: Cents;
  tax: Cents;
  total: Cents;
}

export interface InvoiceInput {
  number: string;
  issuedAt: string;
  customerEmail: string;
  items: CartItem[];
  pricing: Pricing;
  quote?: InstallmentQuote;
}

export function buildInvoice(input: InvoiceInput): Invoice {
  const lines: InvoiceLine[] = input.items.map((item) => ({
    description: `${item.quantity} x ${item.name}`,
    amount: lineTotal(item),
  }));

  const { pricing } = input;
  const coupon = pricing.couponCode ? { code: pricing.couponCode, amount: pricing.discountWithIva } : null;
  if (coupon) {
    lines.push({ description: `${COPY.invoice.coupon} ${coupon.code}`, amount: -coupon.amount });
  }

  let total = pricing.total;
  if (input.quote && input.quote.surcharge > 0) {
    lines.push({
      description: `${COPY.invoice.surcharge} (${input.quote.count} cuotas)`,
      amount: input.quote.surcharge,
    });
    total += input.quote.surcharge;
  }

  const net = netFromGross(total);
  return {
    number: input.number,
    issuedAt: input.issuedAt,
    customerEmail: input.customerEmail,
    lines,
    coupon,
    net,
    tax: total - net,
    total,
  };
}

export function renderInvoiceText(inv: Invoice): string {
  const rows = inv.lines.map((l) => `${l.description.padEnd(32)} ${formatARS(l.amount)}`);
  return [
    `${SHOP.name} - ${COPY.invoice.header} ${inv.number}`,
    `${SHOP.email} | CUIT ${SHOP.cuit}`,
    `${COPY.invoice.customer}: ${inv.customerEmail}`,
    "",
    ...rows,
    "",
    `${COPY.invoice.net}: ${formatARS(inv.net)}`,
    `${COPY.invoice.tax}: ${formatARS(inv.tax)}`,
    `${COPY.invoice.total}: ${formatARS(inv.total)}`,
  ].join("\n");
}
EOF

w src/emails/receipt.ts <<'EOF'
import { SHOP } from "../config";
import { COPY } from "../copy";
import { InstallmentQuote } from "../installments";
import { Invoice } from "../invoice";
import { formatARS } from "../money";

export interface ReceiptEmail {
  to: string;
  subject: string;
  text: string;
}

export function renderReceipt(invoice: Invoice, quote: InstallmentQuote): ReceiptEmail {
  const coupon = invoice.coupon
    ? [`${COPY.receipt.coupon} ${invoice.coupon.code}: -${formatARS(invoice.coupon.amount)}`]
    : [];
  const saved =
    quote.discountPerInstallment > 0 ? [COPY.receipt.savedPerInstallment(formatARS(quote.discountPerInstallment))] : [];
  const lines = [
    COPY.receipt.thanks,
    "",
    ...coupon,
    `${COPY.receipt.total}: ${formatARS(invoice.total)}`,
    `${COPY.receipt.installments}: ${quote.count} x ${formatARS(quote.perInstallment)}`,
    ...saved,
    "",
    `${SHOP.name} | ${SHOP.email}`,
  ];
  return {
    to: invoice.customerEmail,
    subject: COPY.receipt.subject(invoice.number),
    text: lines.join("\n"),
  };
}
EOF

w src/api/checkout.ts <<'EOF'
import { CartItem, cartTotals } from "../cart";
import { MAX_COUPONS_PER_ORDER } from "../config";
import { COPY } from "../copy";
import { isCouponActive, meetsMinimum, priceWithCoupon } from "../coupons";
import { findCoupon } from "../db/coupons-repo";
import { ReceiptEmail, renderReceipt } from "../emails/receipt";
import { isValidInstallmentCount, quoteInstallments } from "../installments";
import { Invoice, buildInvoice } from "../invoice";
import { formatARS, parseARS } from "../money";
import { netFromGross } from "../tax";
import { Coupon } from "../types";

export interface CheckoutRequest {
  email: string;
  items: Array<{ sku: string; name: string; price: string; quantity: number }>;
  installments: number;
  couponCodes?: string[];
}

export type CheckoutResponse =
  | {
      status: 200;
      body: {
        ok: true;
        total: string;
        perInstallment: string;
        message: string;
        invoice: Invoice;
        receipt: ReceiptEmail;
      };
    }
  | { status: 400 | 422; body: { ok: false; error: string } };

function fail(status: 400 | 422, error: string): CheckoutResponse {
  return { status, body: { ok: false, error } };
}

function invoiceNumber(now: Date): string {
  return `0001-${String(now.getTime()).slice(-8)}`;
}

export function handleCheckout(req: CheckoutRequest, now: Date = new Date()): CheckoutResponse {
  if (!req.email || !req.email.includes("@")) {
    return fail(400, COPY.errors.invalidEmail);
  }
  if (!req.items || req.items.length === 0) {
    return fail(400, COPY.errors.emptyCart);
  }
  if (!isValidInstallmentCount(req.installments)) {
    return fail(422, COPY.errors.invalidInstallments);
  }

  let items: CartItem[];
  try {
    items = req.items.map((i) => ({
      sku: i.sku,
      name: i.name,
      unitPrice: parseARS(i.price),
      quantity: i.quantity,
    }));
  } catch {
    return fail(400, COPY.errors.invalidAmount);
  }

  const codes = req.couponCodes ?? [];
  if (codes.length > MAX_COUPONS_PER_ORDER) {
    return fail(422, COPY.errors.tooManyCoupons);
  }

  const totals = cartTotals(items);
  let coupon: Coupon | null = null;
  if (codes.length === 1) {
    coupon = findCoupon(codes[0]);
    if (!coupon) {
      return fail(422, COPY.errors.couponNotFound);
    }
    if (!isCouponActive(coupon, now)) {
      return fail(422, COPY.errors.couponExpired);
    }
    if (!meetsMinimum(coupon, netFromGross(totals.subtotal))) {
      return fail(422, COPY.errors.couponMinimum(formatARS(coupon.minSubtotal)));
    }
  }
  const pricing = priceWithCoupon(totals.subtotal, coupon);

  let quote;
  try {
    quote = quoteInstallments(pricing.total, req.installments, pricing.discountWithIva);
  } catch {
    return fail(422, COPY.errors.planUnavailable);
  }

  const invoice = buildInvoice({
    number: invoiceNumber(now),
    issuedAt: now.toISOString(),
    customerEmail: req.email,
    items,
    pricing,
    quote,
  });

  return {
    status: 200,
    body: {
      ok: true,
      total: formatARS(quote.total),
      perInstallment: formatARS(quote.perInstallment),
      message: COPY.checkout.success(quote.count, formatARS(quote.perInstallment)),
      invoice,
      receipt: renderReceipt(invoice, quote),
    },
  };
}
EOF

w src/invoice.test.ts <<'EOF'
import { describe, expect, it } from "vitest";
import { priceWithCoupon } from "./coupons";
import { quoteInstallments } from "./installments";
import { buildInvoice, renderInvoiceText } from "./invoice";

const items = [{ sku: "P1", name: "Parrilla portátil", unitPrice: 121000, quantity: 1 }];
const verano = { code: "VERANO10", percent: 10, minSubtotal: 0, expiresOn: "2026-12-31" };

describe("buildInvoice con cupón", () => {
  const pricing = priceWithCoupon(12100000, verano);
  const quote = quoteInstallments(pricing.total, 3, pricing.discountWithIva);
  const inv = buildInvoice({
    number: "0001-00000001",
    issuedAt: "2026-10-20T12:00:00.000Z",
    customerEmail: "cliente@example.com",
    items,
    pricing,
    quote,
  });

  it("muestra la línea del cupón", () => {
    expect(inv.coupon).toEqual({ code: "VERANO10", amount: 1210000 });
    expect(renderInvoiceText(inv)).toContain("Cupón VERANO10");
  });

  it("las líneas suman el total", () => {
    const sum = inv.lines.reduce((acc, l) => acc + l.amount, 0);
    expect(sum).toBe(inv.total);
  });

  it("reparte el ahorro en las cuotas", () => {
    expect(quote.discountPerInstallment * 2 + quote.lastDiscount).toBe(1210000);
  });
});
EOF

commit "2026-10-20T15:30:00-03:00" "fix: descuento antes del IVA, prorrateado en cuotas y visible en factura y recibo"

git checkout -q main
echo "listo: $TARGET"
git log --oneline --all --graph
