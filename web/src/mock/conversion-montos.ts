import type { Analysis } from "../../../src/shared/analysis";
import { hunk } from "./hunk";

export const mockAnalysis: Analysis = {
  title: "Corrige la conversión de montos",
  context: {
    before: "El checkout leía el monto con parseFloat y toCents truncaba los centavos. Un parche en el carrito sumaba un centavo por ítem para tapar la diferencia.",
    problem: "\"1.234,56\" se cobraba $ 1,23, y en cada compra se perdían o se inventaban centavos.",
    goal: "Que el monto se lea en formato argentino, que uno ilegible se rechace y que ningún centavo se pierda en el camino.",
    verdict: {
      status: "con-detalles",
      text: "Ojo: un monto con punto decimal (\"1234.56\") se lee como 123456 y se cobra 100 veces más.",
    },
  },
  repo: "trazo-demo",
  base: "main",
  head: "fix/conversion-montos",
  groups: [
    {
      id: "g-conv",
      title: "El monto se lee y se convierte bien",
      summary: "Antes \"1.234,56\" se leía como 1,23 pesos y los centavos se truncaban. Ahora se parsea en formato argentino y se redondea.",
      risk: "alto",
    },
    {
      id: "g-uso",
      title: "Lo que consume los montos",
      summary: "Se saca un parche que compensaba el redondeo y las cuotas reparten el resto.",
      risk: "medio",
    },
    { id: "g-tests", title: "Tests nuevos", summary: "Cubren el parseo y el redondeo.", risk: "bajo" },
    { id: "g-menor", title: "Cambios menores", summary: "Textos de la interfaz.", risk: "bajo", minor: true },
  ],
  blocks: [
    {
      id: "b-handler",
      group: "g-conv",
      title: "handleCheckout",
      file: "src/api/checkout.ts",
      kind: "endpoint",
      risk: "medio",
      summary: "El endpoint deja de usar parseFloat y rechaza montos que no se pueden leer.",
      rows: [
        { id: "r-h-parse", change: "modified", label: "parseARS(body.amount)", before: "parseFloat(body.amount)" },
        { id: "r-h-400", change: "added", label: "monto inválido → 400" },
        { id: "r-h-cents", change: "affected", label: "toCents(amount)" },
      ],
      hunks: [
        hunk("src/api/checkout.ts", "export async function handleCheckout(req: Request)", 11, 11, `
   const body = await req.json();
#> Antes parseFloat leía "1.234,56" como 1,23 y se cobraba eso. Ahora lo lee en formato argentino.
-  const amount = parseFloat(body.amount);
+  const amount = parseARS(body.amount);
#> Si el monto no se puede leer, corta con 400 en vez de seguir con un número basura.
+  if (amount === null) {
+    return json({ error: copy.invalidAmount }, 400);
+  }
#.
   const cents = toCents(amount);
   const cart = await loadCart(body.cartId);`),
      ],
      example: { input: `{ amount: "1.234,56" }`, before: "cobra $1,23", after: "cobra $1.234,56", executed: false },
    },
    {
      id: "b-parse",
      group: "g-conv",
      title: "parseARS",
      file: "src/money.ts",
      kind: "función",
      risk: "alto",
      summary: "Función nueva que lee montos escritos en formato argentino: punto de miles y coma decimal.",
      warnings: ["\"1234.56\" con punto decimal se lee como 123456. Si algún cliente manda el formato inglés, cobra 100 veces más."],
      rows: [
        { id: "r-p-miles", change: "added", label: "saca los puntos de miles" },
        { id: "r-p-coma", change: "added", label: "coma decimal → punto" },
        { id: "r-p-null", change: "added", label: "devuelve null si no es número" },
      ],
      hunks: [
        hunk("src/money.ts", "", 1, 1, `
 export type Cents = number;
 
#> Saca puntos de miles y pasa la coma a punto. Ojo: "1234.56" queda 123456 y se cobra 100 veces más.
+export function parseARS(input: string): number | null {
+  const clean = input.trim().replace(/\\./g, "").replace(",", ".");
#> Si después de limpiar no queda un número, devuelve null y el checkout responde 400.
+  if (!/^-?\\d+(\\.\\d+)?$/.test(clean)) return null;
+  return Number(clean);
+}
#.
+`),
      ],
      example: { input: `"1.234,56"`, before: "1.234", after: "1234.56", executed: false },
    },
    {
      id: "b-cents",
      group: "g-conv",
      title: "toCents",
      file: "src/money.ts",
      kind: "función",
      risk: "alto",
      summary: "Redondea en vez de truncar. 19,99 × 100 da 1998,9999 en coma flotante y floor se comía un centavo.",
      rows: [{ id: "r-c-round", change: "modified", label: "Math.round(amount * 100)", before: "Math.floor(amount * 100)" }],
      hunks: [
        hunk("src/money.ts", "export function toCents(amount: number): Cents", 9, 15, `
 export function toCents(amount: number): Cents {
#> Redondea en vez de truncar: 19,99 × 100 da 1998,9999 y floor se comía un centavo.
-  return Math.floor(amount * 100);
+  return Math.round(amount * 100);
#.
 }`),
      ],
      example: { input: "19.99", before: "1998", after: "1999", executed: true },
    },
    {
      id: "b-cart",
      group: "g-uso",
      title: "cartTotal",
      file: "src/cart.ts",
      kind: "función",
      risk: "medio",
      summary: "Se borra un parche que sumaba un centavo por ítem para tapar el bug de toCents.",
      rows: [
        { id: "r-ca-sum", change: "affected", label: "suma toCents(price) × qty" },
        { id: "r-ca-hack", change: "deleted", label: "+ items.length  // parche" },
      ],
      hunks: [
        hunk("src/cart.ts", "export function cartTotal(items: CartItem[]): Cents", 3, 3, `
 export function cartTotal(items: CartItem[]): Cents {
#> Se borra el parche que sumaba un centavo por ítem para tapar el bug de toCents. Ahora suma justo.
-  const total = items.reduce((sum, i) => sum + toCents(i.price) * i.qty, 0);
-  return total + items.length; // parche: compensa el redondeo de toCents
+  return items.reduce((sum, i) => sum + toCents(i.price) * i.qty, 0);
#.
 }`),
      ],
      example: { input: "[{ price: 10, qty: 2 }]", before: "2001", after: "2000", executed: true },
    },
    {
      id: "b-inst",
      group: "g-uso",
      title: "calcInstallments",
      file: "src/installments.ts",
      kind: "función",
      risk: "medio",
      summary: "Las cuotas ya no suman más que el total: el resto va a la primera.",
      rows: [
        { id: "r-i-base", change: "modified", label: "Math.floor(total / n)", before: "Math.ceil(total / n)" },
        { id: "r-i-rest", change: "added", label: "el resto va a la cuota 1" },
      ],
      hunks: [
        hunk("src/installments.ts", "export function calcInstallments(total: Cents, n: number)", 6, 6, `
 export function calcInstallments(total: Cents, n: number): Cents[] {
#> Antes cada cuota redondeaba para arriba y entre todas pasaban el total. Ahora el resto va a la cuota 1.
-  const each = Math.ceil(total / n);
-  return Array.from({ length: n }, () => each);
+  const each = Math.floor(total / n);
+  const rest = total - each * n;
+  return Array.from({ length: n }, (_, i) => (i === 0 ? each + rest : each));
#.
 }`),
      ],
      example: { input: "10000 en 3 cuotas", before: "3334 · 3334 · 3334", after: "3334 · 3333 · 3333", executed: false },
    },
    {
      id: "b-invoice",
      group: "g-uso",
      title: "buildInvoice",
      file: "src/invoice.ts",
      kind: "función",
      risk: "medio",
      affected: true,
      summary: "No cambió ninguna línea, pero ahora recibe montos distintos. Las facturas ya emitidas no se recalculan.",
      warnings: ["Una factura vieja y una nueva por la misma compra pueden diferir en algunos centavos."],
      rows: [
        { id: "r-inv-lines", change: "affected", label: "toCents en cada línea" },
        { id: "r-inv-total", change: "affected", label: "total = cartTotal(items)" },
      ],
      hunks: [],
    },
    {
      id: "b-test",
      group: "g-tests",
      title: "money.test.ts",
      file: "src/money.test.ts",
      kind: "test",
      risk: "bajo",
      summary: "Tres casos nuevos para parseARS y toCents.",
      warnings: ["Falta un caso con punto decimal (\"1234.56\")."],
      rows: [
        { id: "r-t-1", change: "added", label: "parseARS(\"1.234,56\") → 1234.56" },
        { id: "r-t-2", change: "added", label: "parseARS(\"abc\") → null" },
        { id: "r-t-3", change: "added", label: "toCents(19.99) → 1999" },
      ],
      hunks: [
        hunk("src/money.test.ts", "describe(\"money\")", 4, 4, `
 describe("money", () => {
#> Prueba un monto en formato argentino y uno ilegible. Falta "1234.56", que es justo el caso riesgoso.
+  it("lee formato argentino", () => {
+    expect(parseARS("1.234,56")).toBe(1234.56);
+    expect(parseARS("abc")).toBeNull();
+  });
+
#> Fija que 19,99 dé 1999 centavos, el caso que floor rompía.
+  it("no pierde centavos", () => {
+    expect(toCents(19.99)).toBe(1999);
+  });
#.
 });`),
      ],
    },
    {
      id: "b-copy",
      group: "g-menor",
      title: "copy.ts",
      file: "src/copy.ts",
      kind: "copy",
      risk: "bajo",
      summary: "Dos textos de la interfaz.",
      rows: [
        { id: "r-co-1", change: "modified", label: "\"Total a pagar\"", before: "\"Total\"" },
        { id: "r-co-2", change: "added", label: "invalidAmount: \"Monto inválido\"" },
      ],
      hunks: [
        hunk("src/copy.ts", "export const copy", 1, 1, `
 export const copy = {
#> El rótulo del total pasa a decir "Total a pagar".
-  total: "Total",
+  total: "Total a pagar",
#> Mensaje para el 400 cuando el monto no se puede leer.
+  invalidAmount: "Monto inválido",
#.
   installments: "Cuotas",`),
      ],
    },
  ],
  edges: [
    { id: "e1", from: "b-handler", to: "b-parse", fromRow: "r-h-parse", kind: "llama", label: "body.amount", evidence: "src/api/checkout.ts:13" },
    { id: "e3", from: "b-cents", to: "b-cart", fromRow: "r-c-round", toRow: "r-ca-sum", kind: "datos", label: "centavos", evidence: "src/cart.ts:4" },
    { id: "e4", from: "b-cart", to: "b-inst", fromRow: "r-ca-sum", toRow: "r-i-base", kind: "datos", label: "total", evidence: "src/installments.ts:12" },
    { id: "e5", from: "b-cart", to: "b-invoice", fromRow: "r-ca-sum", toRow: "r-inv-total", kind: "datos", label: "total", evidence: "src/invoice.ts:21" },
    { id: "e6", from: "b-cents", to: "b-invoice", fromRow: "r-c-round", toRow: "r-inv-lines", kind: "datos", label: "precio por línea", evidence: "src/invoice.ts:14" },
    { id: "e7", from: "b-test", to: "b-parse", fromRow: "r-t-1", kind: "testea", label: "testea", evidence: "src/money.test.ts:6" },
    { id: "e8", from: "b-test", to: "b-cents", fromRow: "r-t-3", kind: "testea", label: "testea", evidence: "src/money.test.ts:11" },
  ],
  decisions: [
    {
      id: "d-valid",
      from: "b-parse",
      fromRow: "r-p-null",
      condition: "¿Se pudo leer el monto?",
      status: "nueva",
      summary: "Antes cualquier texto seguía de largo y parseFloat lo convertía en algo, aunque fuera basura. Ahora si parseARS no lo entiende, el pedido se corta con un 400.",
      evidence: "src/api/checkout.ts:14",
      outcomes: [
        { id: "si", label: "sí", to: "b-cents", toRow: "r-c-round" },
        { id: "no", label: "no", end: { label: "responde 400", tone: "error" } },
      ],
      cases: [
        { input: `"1.234,56"`, outcome: "si" },
        { input: `"abc"`, outcome: "no", before: "seguía como NaN" },
        { input: `"1234.56"`, outcome: "si", warning: "pasa, pero lo lee como 123456" },
      ],
      hunk: hunk("src/api/checkout.ts", "export async function handleCheckout(req: Request)", 12, 12, `
#> Lee el monto en formato argentino en vez de usar parseFloat.
+  const amount = parseARS(body.amount);
#> Si no se pudo leer, corta con 400. Ojo: "1234.56" pasa igual, leído como 123456.
+  if (amount === null) {
+    return json({ error: copy.invalidAmount }, 400);
+  }`),
    },
  ],
  tour: ["b-handler", "b-parse", "b-cents", "b-cart", "b-inst", "b-invoice", "b-test", "b-copy"],
};
