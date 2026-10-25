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

git checkout -q main
echo "listo: $TARGET"
git log --oneline --all --graph
