/**
 * Parsea string de números enteros, removiendo caracteres no-numéricos
 */
export const parseNumber = (str: string): number => {
  if (!str) return 0;
  return parseInt(str.replace(/\D/g, '')) || 0;
};

/**
 * Parsea string de números decimales (soporta formato es-AR: 1.471,41)
 */
export const parseDecimal = (str: string): number => {
  if (!str) return 0;
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
};

/**
 * Formatea número entero con separador de miles (formato es-PY)
 */
export const formatNumber = (num: number | string): string => {
  if (!num) return '';
  const cleaned = num.toString().replace(/\D/g, '');
  if (!cleaned) return '';
  return parseInt(cleaned).toLocaleString('es-PY');
};

/**
 * Formatea string decimal (soporta , como separador decimal)
 */
export const formatDecimal = (value: string): string => {
  if (!value) return '';
  let str = value.toString().replace(/[^\d,\.]/g, '');
  str = str.replace(/\./g, '');
  const parts = str.split(',');
  if (parts.length > 2) {
    str = parts[0] + ',' + parts.slice(1).join('');
  }
  return str;
};

/**
 * Formatea currency para display (eg: $16,13)
 */
export const formatCurrency = (num: number | null): string => {
  if (!num) return '-';
  const parts = num.toFixed(2).split('.');
  const intPart = parseInt(parts[0]).toLocaleString('es-PY');
  return intPart + ',' + parts[1];
};

/** Alias de formatNumber para montos PYG */
export const formatPYG = formatNumber;

/**
 * Formatea una tasa ARS en tiempo real:
 * separador de miles con punto, decimal con coma, máx 2 decimales.
 * Acepta tanto "1467,74" (es-AR) como "1467.74" (en-US) como entrada.
 */
export const formatARSRate = (value: string): string => {
  if (!value) return '';
  const raw = value.replace(/[^\d,.]/g, '');
  if (!raw) return '';

  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');

  let intDigits: string;
  let decDigits: string | null = null;

  if (lastComma === -1 && lastDot === -1) {
    intDigits = raw;
  } else if (lastComma > lastDot) {
    intDigits = raw.slice(0, lastComma).replace(/[.,]/g, '');
    decDigits = raw.slice(lastComma + 1).replace(/\D/g, '').slice(0, 2);
  } else {
    const dotCount = (raw.match(/\./g) || []).length;
    const afterDot = raw.slice(lastDot + 1).replace(/\D/g, '');
    if (dotCount === 1 && afterDot.length <= 2) {
      intDigits = raw.slice(0, lastDot).replace(/[.,]/g, '');
      decDigits = afterDot;
    } else {
      intDigits = raw.replace(/[.,]/g, '');
    }
  }

  intDigits = intDigits.replace(/\D/g, '').replace(/^0+/, '');
  if (!intDigits && decDigits === null) return '';
  if (!intDigits) intDigits = '0';

  const formatted = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decDigits !== null ? `${formatted},${decDigits}` : formatted;
};

/**
 * Parsea una tasa ARS formateada a número (es-AR: "1.467,74" → 1467.74)
 */
export const parseARSRate = (value: string): number => {
  if (!value) return 0;
  return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
};

/**
 * Valida que una tasa ARS sea razonable
 */
export const validateARSRate = (value: string): { isValid: boolean; message?: string } => {
  const num = parseARSRate(value);
  if (num === 0) return { isValid: false, message: 'Ingresá una tasa válida' };
  if (num < 100) return { isValid: false, message: 'Tasa muy baja (mínimo AR$100)' };
  if (num > 100000) return { isValid: false, message: 'Tasa muy alta (máximo AR$100.000)' };
  return { isValid: true };
};
