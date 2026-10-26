import type { Analysis } from "../../../src/shared/analysis";
import { hunk } from "./hunk";

export const cuponesAnalysis: Analysis = {
  title: "Un solo cupón por compra, descontado antes del IVA",
  context: {
    before: "El checkout aceptaba cualquier cantidad de cupones y calculaba el descuento sobre el precio con IVA.",
    problem: "Dos cupones se sumaban, y un 10% terminaba descontando 12,1%: una compra de $ 121.000 se cobraba $ 106.359 en vez de $ 108.900.",
    goal: "Un solo cupón por compra, vigente y que llegue al mínimo, descontado sobre el neto y visible en las cuotas, la factura y el mail.",
    verdict: {
      status: "con-detalles",
      text: "Dos cosas para revisar: el cupón deja de valer su último día, y la migración falla si ya hay órdenes con dos cupones.",
    },
  },
  repo: "trazo-demo",
  base: "main",
  head: "fix/cupones-acumulados",
  groups: [
    {
      id: "g-cupon",
      title: "Entra un solo cupón y tiene que valer",
      summary: "Antes se podían sumar cupones y nadie miraba si estaban vencidos ni cuánto se compraba. Ahora entra uno solo y se valida.",
    },
    {
      id: "g-iva",
      title: "El descuento va antes del IVA",
      summary: "Antes el 10% se calculaba sobre el precio con IVA y se restaba del neto: el cliente se llevaba 12,1%. Ahora sale del neto y el IVA va después.",
    },
    {
      id: "g-salida",
      title: "El ahorro llega a las cuotas, la factura y el mail",
      summary: "El descuento no figuraba en ningún lado. Ahora se ve en la factura, en el recibo y repartido en las cuotas.",
    },
    {
      id: "g-datos",
      title: "La base guarda vencimiento y mínimo",
      summary: "Columnas nuevas para el cupón y un índice que no deja guardar dos cupones en la misma orden.",
    },
    { id: "g-tests", title: "Tests nuevos", summary: "Cubren el precio con cupón, la vigencia, el mínimo y la factura." },
    { id: "g-menor", title: "Cambios menores", summary: "Textos y constantes.", minor: true },
  ],
  blocks: [
    {
      id: "b-checkout",
      group: "g-cupon",
      title: "handleCheckout",
      file: "src/api/checkout.ts",
      kind: "endpoint",
      summary: "Rechaza más de un cupón y valida el que llega antes de calcular el precio.",
      rows: [
        { id: "r-ck-uno", change: "added", label: "más de un cupón → 422" },
        { id: "r-ck-cart", change: "affected", label: "cartTotals(items)" },
        { id: "r-ck-find", change: "modified", label: "findCoupon(codes[0])", before: "codes.map(findCoupon)" },
        { id: "r-ck-404", change: "modified", label: "cupón que no existe → 422", before: "se ignoraba sin avisar" },
        { id: "r-ck-price", change: "modified", label: "priceWithCoupon(subtotal, coupon)", before: "priceWithCoupons(subtotal, coupons)" },
        { id: "r-ck-quote", change: "modified", label: "quoteInstallments(total, n, ahorro)", before: "quoteInstallments(total, n)" },
      ],
      hunks: [
        hunk("src/api/checkout.ts", "export function handleCheckout(req: CheckoutRequest, now: Date = new Date()): CheckoutResponse", 60, 62, `
     return fail(400, COPY.errors.invalidAmount);
   }

#> Si llegan dos o más cupones, aunque sea el mismo repetido, corta con 422.
+  const codes = req.couponCodes ?? [];
+  if (codes.length > MAX_COUPONS_PER_ORDER) {
+    return fail(422, COPY.errors.tooManyCoupons);
+  }
+
#.
   const totals = cartTotals(items);
#> Antes sumaba todos e ignoraba en silencio los que no existían. Ahora busca el único y si no existe, 422.
-  const coupons = (req.couponCodes ?? [])
-    .map((code) => findCoupon(code))
-    .filter((c): c is Coupon => c !== null);
-  const pricing = priceWithCoupons(totals.subtotal, coupons);
+  let coupon: Coupon | null = null;
+  if (codes.length === 1) {
+    coupon = findCoupon(codes[0]);
+    if (!coupon) {
+      return fail(422, COPY.errors.couponNotFound);
+    }
#> Valida vencimiento y mínimo. Ojo: el mínimo se mide sin IVA y el cupón no vale su último día.
+    if (!isCouponActive(coupon, now)) {
+      return fail(422, COPY.errors.couponExpired);
+    }
+    if (!meetsMinimum(coupon, netFromGross(totals.subtotal))) {
+      return fail(422, COPY.errors.couponMinimum(formatARS(coupon.minSubtotal)));
+    }
+  }
#> Precio con un cupón o ninguno, descontando sobre el neto.
+  const pricing = priceWithCoupon(totals.subtotal, coupon);
#.

   let quote;
   try {
#> Las cuotas ahora reciben el ahorro con IVA para repartirlo.
-    quote = quoteInstallments(pricing.total, req.installments);
+    quote = quoteInstallments(pricing.total, req.installments, pricing.discountWithIva);
#.
   } catch {
     return fail(422, COPY.errors.planUnavailable);
   }`),
      ],
      example: { input: `["VERANO10", "BIENVENIDA15"] sobre $ 121.000`, before: "cobra $ 84.397,50", after: "responde 422", executed: true },
    },
    {
      id: "b-coupon-api",
      group: "g-cupon",
      title: "handleValidateCoupon",
      file: "src/api/coupons.ts",
      kind: "endpoint",
      summary: "Endpoint nuevo: valida el cupón cuando el cliente lo carga, antes de pagar, y le dice cuánto se ahorra.",
      warnings: [
        "No sabe si el carrito ya tiene otro cupón. El límite de uno solo lo pone recién el checkout.",
        "Si el cupón no existe responde 404, y el checkout responde 422 para lo mismo.",
      ],
      rows: [
        { id: "r-ca-find", change: "added", label: "busca el cupón" },
        { id: "r-ca-404", change: "added", label: "no existe → 404" },
        { id: "r-ca-checks", change: "added", label: "vencido o bajo el mínimo → 422" },
        { id: "r-ca-preview", change: "added", label: "devuelve ahorro y total" },
      ],
      hunks: [
        hunk("src/api/coupons.ts", "", 0, 1, `
+import { COPY } from "../copy";
+import { isCouponActive, meetsMinimum, priceWithCoupon } from "../coupons";
+import { findCoupon } from "../db/coupons-repo";
+import { formatARS } from "../money";
+import { netFromGross } from "../tax";
+
#> Recibe el código y el subtotal con IVA. Devuelve ahorro y total listos para mostrar, o el error.
+export interface ValidateCouponRequest {
+  code: string;
+  /** Subtotal del carrito en centavos, con IVA (lo que ve el cliente) */
+  subtotal: number;
+}
+
+export type ValidateCouponResponse =
+  | { status: 200; body: { ok: true; code: string; discount: string; total: string } }
+  | { status: 404 | 422; body: { ok: false; error: string } };
+
#> Busca el cupón y si no existe responde 404. Ojo: el checkout responde 422 para el mismo caso.
+/** POST /api/coupons/validate: el front lo llama cuando el cliente carga el cupón. */
+export function handleValidateCoupon(req: ValidateCouponRequest, now: Date = new Date()): ValidateCouponResponse {
+  const coupon = findCoupon(req.code);
+  if (!coupon) {
+    return { status: 404, body: { ok: false, error: COPY.errors.couponNotFound } };
+  }
#> Vencido o bajo el mínimo responde 422. No mira si ya hay otro cupón: eso lo frena recién el checkout.
+  if (!isCouponActive(coupon, now)) {
+    return { status: 422, body: { ok: false, error: COPY.errors.couponExpired } };
+  }
+  if (!meetsMinimum(coupon, netFromGross(req.subtotal))) {
+    return { status: 422, body: { ok: false, error: COPY.errors.couponMinimum(formatARS(coupon.minSubtotal)) } };
+  }
#> Si pasa todo, calcula el precio y le dice al cliente cuánto se ahorra y cuánto paga.
+
+  const pricing = priceWithCoupon(req.subtotal, coupon);
+  return {
+    status: 200,
+    body: { ok: true, code: coupon.code, discount: formatARS(pricing.discountWithIva), total: formatARS(pricing.total) },
+  };
+}`),
      ],
      example: { input: `{ code: "verano10", subtotal: 12100000 }`, before: "no existía", after: "ahorrás $ 12.100,00, total $ 108.900,00", executed: true },
    },
    {
      id: "b-repo",
      group: "g-cupon",
      title: "findCoupon",
      file: "src/db/coupons-repo.ts",
      kind: "función",
      summary: "El archivo cambia de nombre (era db/coupons.ts). Ahora trae vencimiento y mínimo, y acepta el código en minúscula o con espacios.",
      rows: [
        { id: "r-r-norm", change: "added", label: "código en mayúsculas y sin espacios" },
        { id: "r-r-cols", change: "added", label: "trae minSubtotal y expiresOn" },
      ],
      hunks: [
        hunk("src/db/coupons-repo.ts", `import { Coupon } from "../types";`, 2, 2, `

 /** Tabla coupons. En memoria para la demo. */
 const rows = [
#> Los cupones guardan compra mínima y vencimiento. BIENVENIDA15 vence el 30/11.
-  { code: "VERANO10", percent: 10 },
-  { code: "BIENVENIDA15", percent: 15 },
+  { code: "VERANO10", percent: 10, min_subtotal_cents: 2000000, expires_on: "2026-12-31" },
+  { code: "BIENVENIDA15", percent: 15, min_subtotal_cents: 0, expires_on: "2026-11-30" },
#.
 ];

 export function findCoupon(code: string): Coupon | null {
#> Normaliza el código: " verano10 " ahora encuentra VERANO10.
-  const row = rows.find((r) => r.code === code);
+  const row = rows.find((r) => r.code === code.trim().toUpperCase());
#.
   if (!row) return null;
#> Devuelve también mínimo y vencimiento, que necesitan las validaciones.
-  return { code: row.code, percent: row.percent };
+  return { code: row.code, percent: row.percent, minSubtotal: row.min_subtotal_cents, expiresOn: row.expires_on };
#.
 }

 /** Para el panel de admin: todos los códigos cargados. */`),
      ],
      example: { input: `" verano10 "`, before: "no lo encontraba", after: "VERANO10", executed: false },
    },
    {
      id: "b-active",
      group: "g-cupon",
      title: "isCouponActive",
      file: "src/coupons.ts",
      kind: "función",
      summary: "Función nueva: el cupón vale hasta su fecha de vencimiento, mirando la fecha de Argentina.",
      warnings: [
        "Compara con < en vez de <=. El comentario dice que expiresOn es el último día que vale, pero ese día el cupón ya se rechaza.",
      ],
      rows: [
        { id: "r-a-tz", change: "added", label: "fecha de hoy en Argentina" },
        { id: "r-a-cmp", change: "added", label: "hoy < vencimiento" },
      ],
      hunks: [
        hunk("src/coupons.ts", "", 5, 6, `
#> Toma la fecha de hoy en hora argentina, así el vencimiento no depende del huso del servidor.
+/** Fecha de hoy en Argentina, "AAAA-MM-DD". */
+function localDay(now: Date): string {
+  return now.toLocaleDateString("sv-SE", { timeZone: TIMEZONE });
+}
+
#> Ojo: con < el cupón deja de valer el mismo día que vence, aunque el comentario diga que ese día vale.
+/** \`expiresOn\` es el último día en que el cupón vale. */
+export function isCouponActive(coupon: Coupon, now: Date): boolean {
+  return localDay(now) < coupon.expiresOn;
+}`),
      ],
      example: { input: "BIENVENIDA15 el 30/11, que vence ese día", before: "valía (no se miraba)", after: "no vale", executed: true },
    },
    {
      id: "b-min",
      group: "g-cupon",
      title: "meetsMinimum",
      file: "src/coupons.ts",
      kind: "función",
      summary: "Función nueva: cada cupón pide una compra mínima, medida sin IVA.",
      warnings: ["El cliente ve precios con IVA en el carrito y el mínimo se mide sin IVA. Un carrito de $ 20.000 no llega a un mínimo de $ 20.000."],
      rows: [{ id: "r-m-cmp", change: "added", label: "subtotal sin IVA ≥ mínimo" }],
      hunks: [
        hunk("src/coupons.ts", "", 5, 16, `
#> Compara contra el subtotal sin IVA. Ojo: un carrito de $ 20.000 con IVA no llega a un mínimo de $ 20.000.
+/** El mínimo se compara contra el subtotal sin IVA. */
+export function meetsMinimum(coupon: Coupon, subtotal: Cents): boolean {
+  return subtotal >= coupon.minSubtotal;
+}`),
      ],
      example: { input: "VERANO10 con un carrito de $ 20.000", before: "cobraba $ 17.580,01", after: "responde 422", executed: true },
    },
    {
      id: "b-cart",
      group: "g-iva",
      title: "cartTotals",
      file: "src/cart.ts",
      kind: "función",
      summary: "El carrito ya no descuenta nada, solo suma precios. El descuento es cosa del cupón.",
      rows: [
        { id: "r-cart-sub", change: "affected", label: "suma los precios con IVA" },
        { id: "r-cart-disc", change: "deleted", label: "discountPercent" },
        { id: "r-cart-total", change: "deleted", label: "total = subtotal - descuento" },
      ],
      hunks: [
        hunk("src/cart.ts", "export interface CartItem", 9, 9, `
 }

 export interface CartTotals {
#> Los totales del carrito quedan en el subtotal con IVA. Descuento y total pasan a ser cosa del cupón.
+  /** Suma de precios de catálogo, con IVA incluido */
   subtotal: Cents;
-  discount: Cents;
-  total: Cents;
#.
 }

 export function lineTotal(item: CartItem): Cents {`),
        hunk("src/cart.ts", "export function lineTotal(item: CartItem): Cents", 20, 19, `
   return toCents(item.unitPrice + 0.001) * item.quantity;
 }

#> Antes el carrito descontaba un porcentaje sobre el precio con IVA. Ahora solo suma precios.
-export function cartTotals(items: CartItem[], discountPercent = 0): CartTotals {
-  const subtotal = addCents(...items.map(lineTotal));
-  const discount = percentOf(subtotal, discountPercent);
-  return { subtotal, discount, total: subtotal - discount };
+export function cartTotals(items: CartItem[]): CartTotals {
+  return { subtotal: addCents(...items.map(lineTotal)) };
#.
 }`),
      ],
    },
    {
      id: "b-net",
      group: "g-iva",
      title: "netFromGross",
      file: "src/tax.ts",
      kind: "función",
      affected: true,
      summary: "No cambió, pero ahora lo usan el cupón, el mínimo y la factura. La factura tenía su propia copia que truncaba; esta redondea.",
      warnings: ["Por el mismo total, una factura nueva puede tener un centavo más de neto que una vieja."],
      rows: [{ id: "r-net-round", change: "affected", label: "Math.round(gross / 1,21)" }],
      hunks: [],
    },
    {
      id: "b-price",
      group: "g-iva",
      title: "priceWithCoupon",
      file: "src/coupons.ts",
      kind: "función",
      summary: "El descuento sale del subtotal sin IVA y el IVA se calcula al final, sobre lo que queda. Un cupón o ninguno.",
      rows: [
        { id: "r-p-base", change: "modified", label: "descuento sobre el neto", before: "descuento sobre el precio con IVA" },
        { id: "r-p-one", change: "modified", label: "un cupón o ninguno", before: "suma todos los cupones" },
        { id: "r-p-none", change: "added", label: "sin cupón cobra el precio de lista" },
        { id: "r-p-saved", change: "added", label: "ahorro con IVA (discountWithIva)" },
      ],
      hunks: [
        hunk("src/coupons.ts", "export function priceWithCoupon(gross: Cents, coupon: Coupon | null): Pricing", 5, 21, `
#> El comentario pasa a la regla nueva: descuento sobre el neto, IVA al final.
 /**
- * Aplica los cupones al subtotal del carrito.
- * \`gross\` viene con IVA incluido (precios de catálogo).
+ * Precio final con un cupón como máximo.
+ * El descuento sale del subtotal sin IVA y el IVA se calcula sobre lo que queda.
  */
#> Antes sumaba el porcentaje de todos los cupones. Ahora acepta uno o ninguno; sin cupón, precio de lista.
-export function priceWithCoupons(gross: Cents, coupons: Coupon[]): Pricing {
-  let discount = 0;
-  for (const coupon of coupons) {
-    discount += percentOf(gross, coupon.percent);
+export function priceWithCoupon(gross: Cents, coupon: Coupon | null): Pricing {
+  const subtotal = netFromGross(gross);
+  if (!coupon) {
+    return { subtotal, discount: 0, discountWithIva: 0, net: subtotal, iva: gross - subtotal, total: gross, couponCode: null };
   }
#> Antes el % salía del precio con IVA y se restaba del neto (12,1% real). Ahora sale del neto.
-  const net = netFromGross(gross) - discount;
+  const discount = percentOf(subtotal, coupon.percent);
+  const net = subtotal - discount;
   const total = addIva(net);
#> Guarda el ahorro con IVA, que es lo que ve el cliente, y un solo código de cupón.
   return {
-    subtotal: gross,
+    subtotal,
     discount,
+    discountWithIva: gross - total,
     net,
     iva: total - net,
     total,
-    couponCodes: coupons.map((c) => c.code),
+    couponCode: coupon.code,
   };
#.
 }`),
      ],
      example: { input: "$ 121.000 con VERANO10", before: "cobra $ 106.359,00", after: "cobra $ 108.900,00", executed: true },
    },
    {
      id: "b-inst",
      group: "g-salida",
      title: "quoteInstallments",
      file: "src/installments.ts",
      kind: "función",
      summary: "Reparte el ahorro del cupón entre las cuotas. Lo que sobra de dividir va a la última, no se pierde ningún centavo.",
      rows: [
        { id: "r-i-param", change: "added", label: "recibe el ahorro" },
        { id: "r-i-per", change: "added", label: "ahorro por cuota" },
        { id: "r-i-last", change: "added", label: "el resto va a la última" },
        { id: "r-i-sur", change: "affected", label: "recargo sobre el total ya descontado" },
      ],
      hunks: [
        hunk("src/installments.ts", "export interface InstallmentQuote", 8, 8, `
   total: Cents;
   perInstallment: Cents;
   lastInstallment: Cents;
#> La cotización suma el ahorro por cuota y el de la última, que se lleva el resto.
+  /** Parte del descuento del cupón que le toca a cada cuota */
+  discountPerInstallment: Cents;
+  lastDiscount: Cents;
#.
 }

 export function isValidInstallmentCount(count: number): boolean {
   return Number.isInteger(count) && count >= 1 && count <= MAX_INSTALLMENTS;
 }

#> Recibe el ahorro del cupón. Por defecto 0, así las llamadas sin cupón siguen igual.
-export function quoteInstallments(amount: Cents, count: number): InstallmentQuote {
+export function quoteInstallments(amount: Cents, count: number, discount: Cents = 0): InstallmentQuote {
#.
   const plan = INSTALLMENT_PLANS.find((p) => p.count === count);
   if (!plan) {
     throw new Error(\`No hay plan de \${count} cuotas\`);`),
        hunk("src/installments.ts", "export function quoteInstallments(amount: Cents, count: number, discount: Cents = 0): InstallmentQuote", 25, 28, `
   const total = amount + surcharge;
   const perInstallment = Math.floor(total / count);
   const lastInstallment = total - perInstallment * (count - 1);
#> Reparte el ahorro en partes iguales y el centavo que sobra va a la última cuota.
+  const discountPerInstallment = Math.floor(discount / count);
+  const lastDiscount = discount - discountPerInstallment * (count - 1);
#.

   return {
     count,`),
      ],
      example: { input: "$ 12.100 de ahorro en 3 cuotas", before: "no figuraba", after: "4.033,33 · 4.033,33 · 4.033,34", executed: true },
    },
    {
      id: "b-invoice",
      group: "g-salida",
      title: "buildInvoice",
      file: "src/invoice.ts",
      kind: "función",
      summary: "La factura suma una línea con el cupón y lo que se ahorró. Usa el neto de tax.ts y borra su propia copia.",
      warnings: ["Las facturas ya emitidas con cupón siguen sin esa línea: sus renglones no suman el total."],
      rows: [
        { id: "r-inv-line", change: "added", label: "línea \"Cupón VERANO10\" en negativo" },
        { id: "r-inv-field", change: "added", label: "invoice.coupon" },
        { id: "r-inv-net", change: "modified", label: "netFromGross de tax.ts", before: "netFromGross propio, truncaba" },
      ],
      hunks: [
        hunk("src/invoice.ts", "export interface Invoice", 15, 16, `
   issuedAt: string;
   customerEmail: string;
   lines: InvoiceLine[];
#> La factura guarda el cupón aplicado y cuánto se ahorró, o null si no hubo.
+  coupon: { code: string; amount: Cents } | null;
#.
   net: Cents;
   tax: Cents;
   total: Cents;`),
        hunk("src/invoice.ts", "export interface InvoiceInput", 29, 31, `
   quote?: InstallmentQuote;
 }

#> Se borra la copia local de netFromGross, que truncaba. Ahora usa la de tax.ts, que redondea.
-/** Precio final con IVA incluido -> neto gravado. */
-export function netFromGross(gross: Cents): Cents {
-  return toCents(fromCents(gross) / (1 + IVA_RATE));
-}
-
#.
 export function buildInvoice(input: InvoiceInput): Invoice {
   const lines: InvoiceLine[] = input.items.map((item) => ({
     description: \`\${item.quantity} x \${item.name}\`,
     amount: lineTotal(item),
   }));

#> Agrega un renglón negativo con el cupón para que las líneas sumen el total. Las facturas viejas no lo tienen.
-  let total = input.pricing.total;
+  const { pricing } = input;
+  const coupon = pricing.couponCode ? { code: pricing.couponCode, amount: pricing.discountWithIva } : null;
+  if (coupon) {
+    lines.push({ description: \`\${COPY.invoice.coupon} \${coupon.code}\`, amount: -coupon.amount });
+  }
+
+  let total = pricing.total;
#.
   if (input.quote && input.quote.surcharge > 0) {
     lines.push({
       description: \`\${COPY.invoice.surcharge} (\${input.quote.count} cuotas)\`,`),
      ],
      example: { input: "$ 121.000 con VERANO10", before: "renglones $ 121.000, total $ 106.359", after: "Cupón VERANO10 -$ 12.100, total $ 108.900", executed: true },
    },
    {
      id: "b-render",
      group: "g-salida",
      title: "renderInvoiceText",
      file: "src/invoice.ts",
      kind: "función",
      affected: true,
      summary: "No cambió ninguna línea. Ahora imprime un renglón más, el del cupón, con monto negativo.",
      rows: [{ id: "r-rd-rows", change: "affected", label: "un renglón por línea de la factura" }],
      hunks: [],
    },
    {
      id: "b-receipt",
      group: "g-salida",
      title: "renderReceipt",
      file: "src/emails/receipt.ts",
      kind: "función",
      summary: "El mail de recibo muestra el cupón y cuánto se ahorra en cada cuota.",
      warnings: ["Dice el ahorro de una cuota cualquiera. La última ahorra un centavo más y no se aclara."],
      rows: [
        { id: "r-rc-coupon", change: "added", label: "Cupón VERANO10: -$ 12.100,00" },
        { id: "r-rc-saved", change: "added", label: "Ahorrás $ 4.033,33 en cada cuota" },
      ],
      hunks: [
        hunk("src/emails/receipt.ts", "export interface ReceiptEmail", 11, 11, `
 }

 export function renderReceipt(invoice: Invoice, quote: InstallmentQuote): ReceiptEmail {
#> Arma la línea del cupón y la del ahorro por cuota, solo si hubo descuento.
+  const coupon = invoice.coupon
+    ? [\`\${COPY.receipt.coupon} \${invoice.coupon.code}: -\${formatARS(invoice.coupon.amount)}\`]
+    : [];
+  const saved =
+    quote.discountPerInstallment > 0 ? [COPY.receipt.savedPerInstallment(formatARS(quote.discountPerInstallment))] : [];
#.
   const lines = [
     COPY.receipt.thanks,
     "",
#> Suma el cupón y el ahorro por cuota al mail. Ojo: la última cuota ahorra un centavo más y no se aclara.
+    ...coupon,
     \`\${COPY.receipt.total}: \${formatARS(invoice.total)}\`,
     \`\${COPY.receipt.installments}: \${quote.count} x \${formatARS(quote.perInstallment)}\`,
+    ...saved,
#.
     "",
     \`\${SHOP.name} | \${SHOP.email}\`,
   ];`),
      ],
    },
    {
      id: "b-mig",
      group: "g-datos",
      title: "002_coupons_vigencia.sql",
      file: "db/migrations/002_coupons_vigencia.sql",
      kind: "config",
      summary: "Agrega vencimiento y compra mínima a los cupones, y en la base también queda un solo cupón por orden.",
      warnings: [
        "Si ya hay órdenes con dos cupones (el bug lo permitía), el índice único falla y la migración no corre.",
        "Todos los cupones que hoy no vencen pasan a vencer el 31/12/2026.",
      ],
      rows: [
        { id: "r-mig-min", change: "added", label: "min_subtotal_cents" },
        { id: "r-mig-exp", change: "added", label: "expires_on" },
        { id: "r-mig-uniq", change: "added", label: "un cupón por orden" },
      ],
      hunks: [
        hunk("db/migrations/002_coupons_vigencia.sql", "", 0, 1, `
#> Columnas nuevas: compra mínima (0 si no tiene) y vencimiento.
+-- Vigencia y compra mínima de cada cupón
+ALTER TABLE coupons ADD COLUMN min_subtotal_cents INTEGER NOT NULL DEFAULT 0;
+ALTER TABLE coupons ADD COLUMN expires_on DATE;
#> Ojo: todo cupón sin vencimiento pasa a vencer el 31/12/2026, y la columna queda obligatoria.
+
+UPDATE coupons SET expires_on = '2026-12-31' WHERE expires_on IS NULL;
+ALTER TABLE coupons ALTER COLUMN expires_on SET NOT NULL;
+
#> Un cupón por orden también en la base. Si ya hay órdenes con dos, el índice falla y la migración no corre.
+-- Un solo cupón por orden
+CREATE UNIQUE INDEX order_coupons_one_per_order ON order_coupons (order_id);`),
      ],
    },
    {
      id: "b-types",
      group: "g-datos",
      title: "Coupon y Pricing",
      file: "src/types.ts",
      kind: "tipo",
      summary: "El cupón suma vencimiento y mínimo. El precio guarda un solo código y el ahorro con IVA.",
      rows: [
        { id: "r-t-min", change: "added", label: "Coupon.minSubtotal" },
        { id: "r-t-exp", change: "added", label: "Coupon.expiresOn" },
        { id: "r-t-code", change: "modified", label: "couponCode: string | null", before: "couponCodes: string[]" },
        { id: "r-t-saved", change: "added", label: "Pricing.discountWithIva" },
      ],
      hunks: [
        hunk("src/types.ts", "export interface Coupon", 4, 4, `
   code: string;
   /** 10 = 10% */
   percent: number;
#> El cupón suma la compra mínima sin IVA y el último día en que vale.
+  /** Compra mínima, sin IVA, para que el cupón valga */
+  minSubtotal: Cents;
+  /** Último día en que vale, "AAAA-MM-DD" */
+  expiresOn: string;
#.
 }

#> El precio aclara qué va sin IVA y suma el ahorro con IVA, el que se muestra en factura y mail.
-/** Cómo queda el precio después de aplicar cupones. */
+/** Cómo queda el precio después de aplicar el cupón. */
 export interface Pricing {
+  /** Sin IVA, antes del descuento */
   subtotal: Cents;
+  /** Sin IVA */
   discount: Cents;
+  /** Lo que se ahorra el cliente, con IVA */
+  discountWithIva: Cents;
#.
   net: Cents;
   iva: Cents;
   total: Cents;
#> Antes guardaba una lista de códigos. Ahora uno solo, o null si no hubo cupón.
-  couponCodes: string[];
+  couponCode: string | null;
#.
 }`),
      ],
    },
    {
      id: "b-t-coupons",
      group: "g-tests",
      title: "coupons.test.ts",
      file: "src/coupons.test.ts",
      kind: "test",
      summary: "Cinco casos para el precio con cupón, el vencimiento y el mínimo.",
      warnings: ["Ningún caso prueba el día exacto del vencimiento. Por eso no salta el < de isCouponActive."],
      rows: [
        { id: "r-tc-price", change: "added", label: "VERANO10 sobre $ 121.000 → $ 108.900" },
        { id: "r-tc-none", change: "added", label: "sin cupón → precio de lista" },
        { id: "r-tc-active", change: "added", label: "vale el 15/12, no vale el 2/1" },
        { id: "r-tc-min", change: "added", label: "$ 20.000 sin IVA pasa, un centavo menos no" },
      ],
      hunks: [
        hunk("src/coupons.test.ts", "", 0, 1, `
+import { describe, expect, it } from "vitest";
+import { isCouponActive, meetsMinimum, priceWithCoupon } from "./coupons";
+import { Coupon } from "./types";
+
+const verano: Coupon = { code: "VERANO10", percent: 10, minSubtotal: 2000000, expiresOn: "2026-12-31" };
+
#> Fija $ 121.000 con VERANO10 en $ 108.900 y que sin cupón se cobre el precio de lista.
+describe("priceWithCoupon", () => {
+  it("descuenta sobre el subtotal sin IVA", () => {
+    const p = priceWithCoupon(12100000, verano);
+    expect(p.subtotal).toBe(10000000);
+    expect(p.discount).toBe(1000000);
+    expect(p.iva).toBe(1890000);
+    expect(p.total).toBe(10890000);
+  });
+
+  it("sin cupón cobra el precio de lista", () => {
+    expect(priceWithCoupon(1999, null).total).toBe(1999);
+  });
+});
+
#> Prueba un día antes y uno después del vencimiento. Ojo: no prueba el día exacto, por eso no salta el <.
+describe("isCouponActive", () => {
+  it("vale antes del vencimiento", () => {
+    expect(isCouponActive(verano, new Date("2026-12-15T12:00:00-03:00"))).toBe(true);
+  });
+
+  it("no vale después del vencimiento", () => {
+    expect(isCouponActive(verano, new Date("2027-01-02T12:00:00-03:00"))).toBe(false);
+  });
+});
+
#> Prueba el borde del mínimo: $ 20.000 sin IVA pasa, un centavo menos no.
+describe("meetsMinimum", () => {
+  it("pide el mínimo sin IVA", () => {
+    expect(meetsMinimum(verano, 2000000)).toBe(true);
+    expect(meetsMinimum(verano, 1999999)).toBe(false);
+  });
+});`),
      ],
    },
    {
      id: "b-t-invoice",
      group: "g-tests",
      title: "invoice.test.ts",
      file: "src/invoice.test.ts",
      kind: "test",
      summary: "Tres casos: la línea del cupón, que los renglones sumen el total y el ahorro repartido en cuotas.",
      rows: [
        { id: "r-ti-line", change: "added", label: "aparece \"Cupón VERANO10\"" },
        { id: "r-ti-sum", change: "added", label: "los renglones suman el total" },
        { id: "r-ti-inst", change: "added", label: "el ahorro en 3 cuotas suma $ 12.100" },
      ],
      hunks: [
        hunk("src/invoice.test.ts", "", 0, 1, `
+import { describe, expect, it } from "vitest";
+import { priceWithCoupon } from "./coupons";
+import { quoteInstallments } from "./installments";
+import { buildInvoice, renderInvoiceText } from "./invoice";
+
+const items = [{ sku: "P1", name: "Parrilla portátil", unitPrice: 121000, quantity: 1 }];
+const verano = { code: "VERANO10", percent: 10, minSubtotal: 0, expiresOn: "2026-12-31" };
+
#> Arma una factura con VERANO10 en 3 cuotas, como saldría en una compra real.
+describe("buildInvoice con cupón", () => {
+  const pricing = priceWithCoupon(12100000, verano);
+  const quote = quoteInstallments(pricing.total, 3, pricing.discountWithIva);
+  const inv = buildInvoice({
+    number: "0001-00000001",
+    issuedAt: "2026-10-20T12:00:00.000Z",
+    customerEmail: "cliente@example.com",
+    items,
+    pricing,
+    quote,
+  });
+
#> Chequea el renglón del cupón y que la factura impresa lo muestre.
+  it("muestra la línea del cupón", () => {
+    expect(inv.coupon).toEqual({ code: "VERANO10", amount: 1210000 });
+    expect(renderInvoiceText(inv)).toContain("Cupón VERANO10");
+  });
+
#> Chequea que los renglones sumen el total, lo que antes no pasaba con cupón.
+  it("las líneas suman el total", () => {
+    const sum = inv.lines.reduce((acc, l) => acc + l.amount, 0);
+    expect(sum).toBe(inv.total);
+  });
+
#> Chequea que el ahorro repartido en 3 cuotas no pierda ni sume centavos.
+  it("reparte el ahorro en las cuotas", () => {
+    expect(quote.discountPerInstallment * 2 + quote.lastDiscount).toBe(1210000);
+  });
+});`),
      ],
    },
    {
      id: "b-copy",
      group: "g-menor",
      title: "copy.ts",
      file: "src/copy.ts",
      kind: "copy",
      summary: "Cuatro mensajes de error nuevos y los textos del cupón en la factura y el mail.",
      rows: [
        { id: "r-co-err", change: "added", label: "4 errores de cupón" },
        { id: "r-co-inv", change: "modified", label: "coupon: \"Cupón\"", before: "discount: \"Descuento\"" },
        { id: "r-co-saved", change: "added", label: "\"Ahorrás ... en cada cuota\"" },
      ],
      hunks: [
        hunk("src/copy.ts", "export const COPY", 12, 12, `
     invalidAmount: "Hay un precio que no pudimos leer",
     invalidInstallments: "Cantidad de cuotas invalida",
     planUnavailable: "Ese plan de cuotas no esta disponible",
#> Mensajes para los cuatro rechazos del cupón. El del mínimo aclara que es sin IVA.
+    tooManyCoupons: "Solo se puede usar un cupón por compra",
+    couponNotFound: "Ese cupón no existe",
+    couponExpired: "Ese cupón ya venció",
+    couponMinimum: (min: string) => \`El cupón vale para compras desde \${min} sin IVA\`,
#.
   },
   invoice: {
     header: "Factura B",
     customer: "Cliente",
#> En la factura el renglón pasa de "Descuento" a "Cupón".
-    discount: "Descuento",
+    coupon: "Cupón",
#.
     surcharge: "Recargo por cuotas",
     net: "Neto gravado",
     tax: "IVA 21%",`),
        hunk("src/copy.ts", "export const COPY", 26, 30, `
     subject: (number: string) => \`Tu compra \${number}\`,
     thanks: "Gracias por tu compra!",
     total: "Total",
#> Textos del mail para el cupón y el ahorro por cuota.
+    coupon: "Cupón",
     installments: "Cuotas",
+    savedPerInstallment: (amount: string) => \`Ahorrás \${amount} en cada cuota\`,
#.
   },
 } as const;`),
      ],
    },
    {
      id: "b-config",
      group: "g-menor",
      title: "config.ts",
      file: "src/config.ts",
      kind: "config",
      summary: "Dos constantes: cuántos cupones entran por compra y la zona horaria para el vencimiento.",
      rows: [
        { id: "r-cf-max", change: "added", label: "MAX_COUPONS_PER_ORDER = 1" },
        { id: "r-cf-tz", change: "added", label: "TIMEZONE = Buenos Aires" },
      ],
      hunks: [
        hunk("src/config.ts", "", 1, 1, `
 export const IVA_RATE = 0.21;
 export const MAX_INSTALLMENTS = 12;
#> Tope de un cupón por compra y la zona horaria con la que se decide si un cupón venció.
+export const MAX_COUPONS_PER_ORDER = 1;
+export const TIMEZONE = "America/Argentina/Buenos_Aires";
#.

 export const INSTALLMENT_PLANS = [
   { count: 1, surchargeRate: 0 },`),
      ],
    },
  ],
  edges: [
    { id: "e1", from: "b-checkout", to: "b-cart", fromRow: "r-ck-cart", kind: "llama", label: "items", evidence: "src/api/checkout.ts:70" },
    { id: "e2", from: "b-cart", to: "b-net", fromRow: "r-cart-sub", toRow: "r-net-round", kind: "datos", label: "subtotal con IVA", evidence: "src/coupons.ts:26" },
    { id: "e3", from: "b-net", to: "b-price", fromRow: "r-net-round", toRow: "r-p-base", kind: "datos", label: "subtotal sin IVA", evidence: "src/coupons.ts:26" },
    { id: "e4", from: "b-net", to: "b-min", fromRow: "r-net-round", toRow: "r-m-cmp", kind: "datos", label: "subtotal sin IVA", evidence: "src/api/checkout.ts:80" },
    { id: "e5", from: "b-repo", to: "b-active", fromRow: "r-r-cols", toRow: "r-a-cmp", kind: "datos", label: "vencimiento", evidence: "src/coupons.ts:13" },
    { id: "e6", from: "b-price", to: "b-inst", fromRow: "r-p-saved", toRow: "r-i-param", kind: "datos", label: "total y ahorro", evidence: "src/api/checkout.ts:88" },
    { id: "e7", from: "b-price", to: "b-invoice", fromRow: "r-p-saved", toRow: "r-inv-line", kind: "datos", label: "cupón y ahorro", evidence: "src/invoice.ts:41" },
    { id: "e8", from: "b-inst", to: "b-invoice", fromRow: "r-i-sur", kind: "datos", label: "recargo", evidence: "src/invoice.ts:47" },
    { id: "e9", from: "b-net", to: "b-invoice", fromRow: "r-net-round", toRow: "r-inv-net", kind: "datos", label: "neto", evidence: "src/invoice.ts:55" },
    { id: "e10", from: "b-invoice", to: "b-render", fromRow: "r-inv-line", toRow: "r-rd-rows", kind: "datos", label: "renglón del cupón", evidence: "src/invoice.ts:69" },
    { id: "e11", from: "b-invoice", to: "b-receipt", fromRow: "r-inv-field", toRow: "r-rc-coupon", kind: "datos", label: "invoice.coupon", evidence: "src/emails/receipt.ts:14" },
    { id: "e12", from: "b-inst", to: "b-receipt", fromRow: "r-i-per", toRow: "r-rc-saved", kind: "datos", label: "ahorro por cuota", evidence: "src/emails/receipt.ts:18" },
    { id: "e13", from: "b-coupon-api", to: "b-repo", fromRow: "r-ca-find", toRow: "r-r-norm", kind: "llama", label: "code", evidence: "src/api/coupons.ts:19" },
    { id: "e14", from: "b-coupon-api", to: "b-active", fromRow: "r-ca-checks", toRow: "r-a-cmp", kind: "llama", label: "vencimiento", evidence: "src/api/coupons.ts:23" },
    { id: "e15", from: "b-coupon-api", to: "b-min", fromRow: "r-ca-checks", toRow: "r-m-cmp", kind: "llama", label: "mínimo", evidence: "src/api/coupons.ts:26" },
    { id: "e16", from: "b-coupon-api", to: "b-price", fromRow: "r-ca-preview", toRow: "r-p-saved", kind: "llama", label: "vista previa", evidence: "src/api/coupons.ts:30" },
    { id: "e17", from: "b-mig", to: "b-repo", fromRow: "r-mig-exp", toRow: "r-r-cols", kind: "datos", label: "columnas nuevas", evidence: "src/db/coupons-repo.ts:12" },
    { id: "e18", from: "b-types", to: "b-repo", fromRow: "r-t-exp", toRow: "r-r-cols", kind: "datos", label: "Coupon", evidence: "src/db/coupons-repo.ts:12" },
    { id: "e19", from: "b-config", to: "b-active", fromRow: "r-cf-tz", toRow: "r-a-tz", kind: "datos", label: "zona horaria", evidence: "src/coupons.ts:8" },
    { id: "t1", from: "b-t-coupons", to: "b-price", fromRow: "r-tc-price", kind: "testea", label: "testea", evidence: "src/coupons.test.ts:9" },
    { id: "t2", from: "b-t-coupons", to: "b-active", fromRow: "r-tc-active", kind: "testea", label: "testea", evidence: "src/coupons.test.ts:23" },
    { id: "t3", from: "b-t-coupons", to: "b-min", fromRow: "r-tc-min", kind: "testea", label: "testea", evidence: "src/coupons.test.ts:33" },
    { id: "t4", from: "b-t-invoice", to: "b-invoice", fromRow: "r-ti-line", kind: "testea", label: "testea", evidence: "src/invoice.test.ts:12" },
    { id: "t5", from: "b-t-invoice", to: "b-inst", fromRow: "r-ti-inst", kind: "testea", label: "testea", evidence: "src/invoice.test.ts:11" },
  ],
  decisions: [
    {
      id: "d-uno",
      from: "b-checkout",
      fromRow: "r-ck-uno",
      condition: "¿Trae un cupón como mucho?",
      status: "cambió",
      summary: "Antes los cupones que llegaban se sumaban todos, aunque fuera el mismo repetido. Ahora si llega más de uno, el pedido se corta con un 422.",
      evidence: "src/api/checkout.ts:66",
      outcomes: [
        { id: "si", label: "sí", to: "b-repo", toRow: "r-r-norm" },
        { id: "no", label: "no", end: { label: "responde 422", tone: "error" } },
      ],
      cases: [
        { input: `["VERANO10"]`, outcome: "si" },
        { input: `["VERANO10", "BIENVENIDA15"]`, outcome: "no", before: "sumaba los dos: 30% menos" },
        { input: `["VERANO10", "VERANO10"]`, outcome: "no", before: "aplicaba el mismo dos veces" },
        { input: "sin cupón", outcome: "si", warning: "no busca nada y cobra el precio de lista" },
      ],
      hunk: hunk("src/api/checkout.ts", "export function handleCheckout(req: CheckoutRequest, now: Date = new Date()): CheckoutResponse", 63, 65, `
#> Si llega más de un cupón, aunque sea el mismo repetido, corta con 422 antes de buscar nada.
+  const codes = req.couponCodes ?? [];
+  if (codes.length > MAX_COUPONS_PER_ORDER) {
+    return fail(422, COPY.errors.tooManyCoupons);
+  }`),
    },
    {
      id: "d-vigente",
      from: "b-active",
      fromRow: "r-a-cmp",
      condition: "¿El cupón está vigente?",
      status: "nueva",
      summary: "Antes nadie miraba el vencimiento. Ahora un cupón vencido corta el pedido con un 422.",
      evidence: "src/api/checkout.ts:77",
      outcomes: [
        { id: "si", label: "sí", to: "b-min", toRow: "r-m-cmp" },
        { id: "no", label: "no", end: { label: "responde 422", tone: "error" } },
      ],
      cases: [
        { input: "VERANO10 hoy, 26/10", outcome: "si" },
        { input: "BIENVENIDA15 el 1/12", outcome: "no", before: "se aplicaba igual" },
        { input: "BIENVENIDA15 el 30/11", outcome: "no", warning: "es su último día: debería valer" },
      ],
      hunk: hunk("src/api/checkout.ts", "export function handleCheckout(req: CheckoutRequest, now: Date = new Date()): CheckoutResponse", 68, 77, `
#> Cupón vencido corta con 422. Ojo: con < deja de valer el mismo día que vence.
+    if (!isCouponActive(coupon, now)) {
+      return fail(422, COPY.errors.couponExpired);
+    }`),
    },
    {
      id: "d-minimo",
      from: "b-min",
      fromRow: "r-m-cmp",
      condition: "¿Llega al monto mínimo?",
      status: "nueva",
      summary: "Cada cupón pide una compra mínima sin IVA. Si el carrito no llega, se corta con un 422 que dice cuál es el mínimo.",
      evidence: "src/api/checkout.ts:80",
      outcomes: [
        { id: "si", label: "sí", to: "b-price", toRow: "r-p-one" },
        { id: "no", label: "no", end: { label: "responde 422", tone: "error" } },
      ],
      cases: [
        { input: "VERANO10 con $ 24.200", outcome: "si" },
        { input: "VERANO10 con $ 20.000", outcome: "no", before: "se aplicaba igual", warning: "el carrito dice $ 20.000, pero sin IVA son $ 16.528,93" },
        { input: "BIENVENIDA15 con $ 500", outcome: "si" },
      ],
      hunk: hunk("src/api/checkout.ts", "export function handleCheckout(req: CheckoutRequest, now: Date = new Date()): CheckoutResponse", 68, 80, `
#> Bajo el mínimo corta con 422. Ojo: se mide sin IVA y el cliente ve precios con IVA.
+    if (!meetsMinimum(coupon, netFromGross(totals.subtotal))) {
+      return fail(422, COPY.errors.couponMinimum(formatARS(coupon.minSubtotal)));
+    }`),
    },
  ],
  tour: [
    "b-checkout",
    "b-repo",
    "b-active",
    "b-min",
    "b-cart",
    "b-net",
    "b-price",
    "b-inst",
    "b-invoice",
    "b-render",
    "b-receipt",
    "b-coupon-api",
    "b-mig",
    "b-types",
    "b-t-coupons",
    "b-t-invoice",
    "b-copy",
    "b-config",
  ],
};
