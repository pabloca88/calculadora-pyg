# 💱 Calculadora PYG

Calculadora para **argentinos comprando en Paraguay**.
Convertí guaraníes a USD y ARS al instante, sin configuración.

## ¿Qué hace?

Ingresás un precio en guaraníes (₲) y ves automáticamente:
- Cuánto vale en **dólares** (USD)
- Cuánto sale con **tarjeta bancaria argentina** (Dólar Tarjeta +30%)
- Cuánto sale con **Mercado Pago** (Dólar Tarjeta +30%)
- Cuánto sale con **ARQ/DollarApp** (tasa interbancaria, 0%)
- Cuánto sale con **Payoneer** (tasa Mastercard +1.8%)
- Cuántos **dólares físicos** necesitás (Efectivo USD)

## Stack

- Next.js 15 + TypeScript
- TailwindCSS
- Vitest (110 tests)

## APIs

- [DolarApi.com](https://dolarapi.com) → tasas ARS (Oficial, Tarjeta)
- [open.er-api.com](https://open.er-api.com) → tasa USD/PYG automática

## Desarrollo local

npm install
npm run dev

## Tests

npm test

## Deploy

https://calculadora-pyg.vercel.app
Manual: https://calculadora-pyg.vercel.app/manual.html
