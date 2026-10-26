/** Columnas del esquema: que entre en pantalla sin quedar una tira larga */
export const overviewCols = (n: number) => (n <= 3 ? n : n === 4 ? 2 : 3);
