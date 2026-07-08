import { describe, it, expect } from 'vitest';

describe('Calculadora PYG - Test Cases Reales', () => {
  const calcUSD = (pyg: number, rate: number) => pyg / rate;
  const calcARS = (usd: number, arsRate: number) => usd * arsRate;
  const calcTarjeta = (usd: number, oficial: number) => usd * oficial * 1.30;
  const calcBilletera = (usd: number, rate: number, fee = 0) => usd * rate * (1 + fee / 100);
  const calcTurista = (value: number) => value * 0.9;

  const CHACO = 6150;
  const MAXI = 6200;
  const OFICIAL = 1415.00;
  const TARJETA = 1839.50;
  const DOLLARAPP = 1471.36;

  describe('TEST 1 - PYG a USD', () => {
    it('150000 / 6150 = 24.39 USD', () => {
      expect(calcUSD(150_000, CHACO)).toBeCloseTo(24.39, 2);
    });
    it('150000 / 6200 = 24.19 USD', () => {
      expect(calcUSD(150_000, MAXI)).toBeCloseTo(24.19, 2);
    });
    it('Maxi da menos USD que Chaco', () => {
      expect(calcUSD(150_000, MAXI)).toBeLessThan(calcUSD(150_000, CHACO));
    });
  });

  describe('TEST 2 - Tarjeta Argentina', () => {
    const usd = calcUSD(500_000, CHACO);
    it('Oficial: 500000 gs = AR$115040.65', () => {
      expect(calcARS(usd, OFICIAL)).toBeCloseTo(115_040.65, 0);
    });
    it('Tarjeta +30%: 500000 gs = AR$149552.85', () => {
      expect(calcTarjeta(usd, OFICIAL)).toBeCloseTo(149_552.85, 0);
    });
    it('Tarjeta es 30% mas cara que Oficial', () => {
      expect(calcTarjeta(usd, OFICIAL) / calcARS(usd, OFICIAL)).toBeCloseTo(1.30, 2);
    });
    it('TARJETA sheet: 1839.50 = 1415 x 1.30', () => {
      expect(TARJETA).toBeCloseTo(OFICIAL * 1.30, 1);
    });
  });

  describe('TEST 3 - Billetera DollarApp', () => {
    const usd = calcUSD(200_000, CHACO);
    it('Sin recargo: AR$47849.11', () => {
      expect(calcBilletera(usd, DOLLARAPP, 0)).toBeCloseTo(47_849.11, 0);
    });
    it('Con +2%: AR$48806.09', () => {
      expect(calcBilletera(usd, DOLLARAPP, 2)).toBeCloseTo(48_806.09, 0);
    });
    it('Con +3%: AR$49284.58', () => {
      expect(calcBilletera(usd, DOLLARAPP, 3)).toBeCloseTo(49_284.58, 0);
    });
    it('DollarApp mas barato que Tarjeta +30%', () => {
      expect(calcBilletera(usd, DOLLARAPP, 0)).toBeLessThan(calcTarjeta(usd, OFICIAL));
    });
  });

  describe('TEST 4 - Descuento Turista -10%', () => {
    const turista = calcTurista(300_000);
    const usd = calcUSD(turista, CHACO);
    it('300000 con -10% = 270000', () => {
      expect(turista).toBe(270_000);
    });
    it('Oficial turista: AR$62121.95', () => {
      expect(calcARS(usd, OFICIAL)).toBeCloseTo(62_121.95, 0);
    });
    it('Tarjeta turista: AR$80758.54', () => {
      expect(calcTarjeta(usd, OFICIAL)).toBeCloseTo(80_758.54, 0);
    });
    it('DollarApp turista: AR$64596.29', () => {
      expect(calcBilletera(usd, DOLLARAPP, 0)).toBeCloseTo(64_596.29, 0);
    });
  });

  describe('TEST 5 - Comparacion metodos 1.000.000 gs', () => {
    const usd = calcUSD(1_000_000, CHACO);
    it('Efectivo = Tarjeta Oficial (identicos)', () => {
      expect(calcARS(usd, OFICIAL)).toBeCloseTo(usd * OFICIAL, 0);
    });
    it('Tarjeta +30%: AR$299105.69', () => {
      expect(calcTarjeta(usd, OFICIAL)).toBeCloseTo(299_105.69, 0);
    });
    it('DollarApp sin recargo: AR$239245.53', () => {
      expect(calcBilletera(usd, DOLLARAPP, 0)).toBeCloseTo(239_245.53, 0);
    });
    it('Orden: Oficial < DollarApp < DollarApp+2% < Tarjeta+30%', () => {
      const oficial = calcARS(usd, OFICIAL);
      const app = calcBilletera(usd, DOLLARAPP, 0);
      const app2 = calcBilletera(usd, DOLLARAPP, 2);
      const tarjeta = calcTarjeta(usd, OFICIAL);
      expect(oficial).toBeLessThan(app);
      expect(app).toBeLessThan(app2);
      expect(app2).toBeLessThan(tarjeta);
    });
  });
});
