'use client';

import { useEffect, useState } from 'react';
import { useCalculator } from '@/lib/useCalculator';
import { formatNumber, formatCurrency, parseNumber, parseDecimal } from '@/lib/format';
import { PAYMENT_METHODS_AR, MERCADO_PAGO_METHOD, WALLET_METHODS, calcPaymentMethod, getCheapestMethodIds } from '@/lib/calculator';

const WALLETS = [
  { value: 'arq', label: 'ARQ / DollarApp' },
  { value: 'payoneer', label: 'Payoneer' },
];

const CHACO_OVERRIDE_KEY = 'chaco_rate';
const CHACO_OVERRIDE_TTL_MS = 12 * 60 * 60 * 1000;

interface ChacoOverride {
  value: string;
  savedAt: number;
}

/**
 * Lee el override manual de Cambios Chaco si todavía es válido (< 12hs).
 * También descarta el formato viejo (string plano, sin TTL) para que un
 * valor tipeado hace meses no tape la tasa automática para siempre.
 */
const readValidChacoOverride = (): string | null => {
  const raw = localStorage.getItem(CHACO_OVERRIDE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.value === 'string' &&
      typeof parsed.savedAt === 'number'
    ) {
      if (Date.now() - parsed.savedAt < CHACO_OVERRIDE_TTL_MS) {
        return parsed.value;
      }
    }
  } catch {
    // formato viejo (string plano) u otro JSON inválido: se descarta abajo
  }

  localStorage.removeItem(CHACO_OVERRIDE_KEY);
  return null;
};

export default function Page() {
  const {
    pygAmount,
    setPygAmount,
    rateCustom,
    setRateCustom,
    arsRates,
    arsStatus,
    isArsLoading,
    isError,
    pygUsdRate,
    pygRateStatus,
    fetchPygRate,
    pygHouseRates,
    isHouseRatesLoading,
    effectiveDollarAppRate,
    calibrateDollarAppRate,
    showOptionalArs,
    setShowOptionalArs,
    expansions,
    toggleExpansion,
    selectedWallet,
    setSelectedWallet,
  } = useCalculator();

  const [isRefreshingPyg, setIsRefreshingPyg] = useState(false);

  const handleRefreshPygRate = async () => {
    setIsRefreshingPyg(true);
    await fetchPygRate(true);
    setIsRefreshingPyg(false);
  };

  // Casas de cambio de referencia (Fase 3) — el usuario puede sobreescribir
  // manualmente el valor "Compra USD" traído por scraping desde /api/pyg-rates
  const [chacoRateInput, setChacoRateInput] = useState('');
  const [chacoManualOverride, setChacoManualOverride] = useState(false);
  const [showCalibForm, setShowCalibForm] = useState(false);
  const [calibGs, setCalibGs] = useState('');
  const [calibUsd, setCalibUsd] = useState('');

  useEffect(() => {
    // Key legacy de una versión anterior donde Maxi también era manual
    localStorage.removeItem('maxi_rate');

    const override = readValidChacoOverride();
    if (override) {
      setChacoRateInput(override);
      setChacoManualOverride(true);
    }
  }, []);

  // Autocompleta con el valor scrapeado mientras el usuario no haya tipeado el suyo
  useEffect(() => {
    if (!chacoManualOverride && pygHouseRates.chaco.compra) {
      setChacoRateInput(pygHouseRates.chaco.compra.toLocaleString('es-PY'));
    }
  }, [chacoManualOverride, pygHouseRates.chaco.compra]);

  const handleChacoRateChange = (value: string) => {
    const formatted = formatNumber(value);
    setChacoRateInput(formatted);
    setChacoManualOverride(!!formatted);
    if (formatted) {
      const override: ChacoOverride = { value: formatted, savedAt: Date.now() };
      localStorage.setItem(CHACO_OVERRIDE_KEY, JSON.stringify(override));
    } else {
      localStorage.removeItem(CHACO_OVERRIDE_KEY);
    }
  };

  const handleUseAutomaticChacoRate = () => {
    localStorage.removeItem(CHACO_OVERRIDE_KEY);
    setChacoManualOverride(false);
    setChacoRateInput(pygHouseRates.chaco.compra ? pygHouseRates.chaco.compra.toLocaleString('es-PY') : '');
  };

  const handleAmountChange = (value: string) => setPygAmount(formatNumber(value));
  const handleRateChange = (setter: (value: string) => void, value: string) => setter(formatNumber(value));

  const pygAmountRaw = parseNumber(pygAmount);
  const hasTouristDiscount = pygAmountRaw > 0;

  // Conversión de referencia PYG → USD vía tasa de mercado internacional.
  // Solo es una aproximación razonable para pagos que procesa la red
  // Visa/Mastercard (tarjeta banco, Mercado Pago, Payoneer), porque esas
  // redes usan una tasa cercana a la interbancaria. NO es la tasa real de
  // Paraguay — Efectivo USD y ARQ/DollarApp usan tasas locales reales abajo.
  const usdAmount = pygAmountRaw > 0 && pygUsdRate > 0 ? pygAmountRaw / pygUsdRate : 0;
  const hasAmount = usdAmount > 0;

  const oficialARS = hasAmount && arsRates.oficial ? usdAmount * arsRates.oficial : null;
  const tarjetaARS = hasAmount && arsRates.tarjeta ? usdAmount * arsRates.tarjeta : null;

  // Tasa personalizada del local (₲), alternativa opcional a la tasa automática
  const customPygRateVal = parseNumber(rateCustom);
  const customUsdAmount = hasAmount && customPygRateVal > 0 ? pygAmountRaw / customPygRateVal : 0;
  const customPygARS = customUsdAmount > 0 && arsRates.oficial ? customUsdAmount * arsRates.oficial : null;

  // Efectivo USD: el usuario vende sus dólares físicos a Cambios Chaco
  // (tasa COMPRA — lo que la casa paga al usuario por sus dólares).
  // Cambios Chaco es la fuente primaria; Maxi queda como consulta secundaria.
  const chacoCompra = parseNumber(chacoRateInput) || null;
  const bestExchangeCompra = chacoCompra;
  const usdAmountEfectivo =
    pygAmountRaw > 0 && bestExchangeCompra ? pygAmountRaw / bestExchangeCompra : 0;

  // ARQ / DollarApp: tasa efectiva medida con una compra real (calibrable al
  // pie de la billetera virtual), no la tasa de mercado.
  const usdAmountArq =
    pygAmountRaw > 0 && effectiveDollarAppRate.rate > 0
      ? pygAmountRaw / effectiveDollarAppRate.rate
      : 0;
  const dollarAppDaysOld = Math.floor(
    (Date.now() - new Date(effectiveDollarAppRate.measuredAt).getTime()) / 86_400_000
  );

  const getUsdAmountForMethod = (methodId: string): number => {
    if (methodId === 'efectivo-usd') return usdAmountEfectivo;
    if (methodId === 'arq-dolarapp') return usdAmountArq;
    return usdAmount;
  };

  // Métodos de pago argentinos (Fase 2) — orden fijo: Tarjeta banco, Mercado Pago, [billetera elegida], Efectivo USD
  const arsRatesForPayment = arsRates.oficial && arsRates.tarjeta
    ? { oficial: arsRates.oficial, tarjeta: arsRates.tarjeta }
    : null;
  const tarjetaBancoMethod = PAYMENT_METHODS_AR.find((m) => m.id === 'tarjeta-banco')!;
  const efectivoUsdMethod = PAYMENT_METHODS_AR.find((m) => m.id === 'efectivo-usd')!;
  const walletMethod = WALLET_METHODS[selectedWallet === 'payoneer' ? 'payoneer' : 'arq'];
  const paymentCards = [tarjetaBancoMethod, MERCADO_PAGO_METHOD, walletMethod, efectivoUsdMethod];
  const cheapestIds = hasAmount && arsRatesForPayment
    ? getCheapestMethodIds(getUsdAmountForMethod, arsRatesForPayment, paymentCards)
    : [];

  const renderEfectivoUsdRates = () => {
    if (!bestExchangeCompra) {
      return (
        <div className="conv-expand-row">
          <span className="conv-expand-label">
            ⚠️ La tasa de Cambios Chaco se carga automáticamente. Si falla, ingresala manualmente en la sección de abajo.
          </span>
        </div>
      );
    }
    const sourceBadge = chacoManualOverride ? 'manual' : 'API';
    const updatedAt = pygHouseRates.chaco.updatedAt;
    return (
      <div className="conv-expand-row">
        <span className="conv-expand-label">
          Tasa: Cambios Chaco compra ₲{bestExchangeCompra.toLocaleString('es-PY')}
          {' '}({sourceBadge}{updatedAt ? ` · ${updatedAt}` : ''})
        </span>
      </div>
    );
  };

  return (
    <div className="container">
      <div className="header">
        <h1>💱 Calculadora PYG</h1>
      </div>

      <div className="calculator-body">
        <div className="flag-accent" />

        <div className="section">
          <label htmlFor="pyg-display">Monto en Guaraníes</label>
          <div className="input-wrapper">
            <span className="currency-symbol">₲</span>
            <input
              id="pyg-display"
              type="text"
              placeholder="0"
              inputMode="numeric"
              value={pygAmount}
              onChange={(e) => handleAmountChange(e.target.value)}
            />
          </div>
        </div>

        <div className="divider" />

        <div className="pyg-auto-section">
          <div className="result-box">
            <div className="result-box-left">
              <span className="result-box-symbol">U$D</span>
              <span className="result-box-value">{hasAmount ? formatCurrency(usdAmount) : '0,00'}</span>
            </div>
            {isRefreshingPyg ? (
              <span className="result-box-label">⏳ actualizando...</span>
            ) : pygRateStatus === 'live' ? (
              <span className="result-box-label">🟢 en vivo</span>
            ) : pygRateStatus === 'cached' ? (
              <button type="button" className="pyg-refresh-btn" onClick={handleRefreshPygRate}>
                🔄 Actualizar
              </button>
            ) : (
              <span className="result-box-label pyg-refresh-fallback">
                🔴 sin conexión
                <button
                  type="button"
                  className="pyg-refresh-icon-btn"
                  onClick={handleRefreshPygRate}
                  aria-label="Actualizar tasa"
                >
                  🔄
                </button>
              </span>
            )}
          </div>

          <div className="result-box">
            <div className="result-box-left">
              <span className="result-box-symbol">AR$</span>
              <span className="result-box-value">{formatCurrency(oficialARS)}</span>
            </div>
            <span className="result-box-label">Dólar Oficial</span>
          </div>

          <div className="result-box">
            <div className="result-box-left">
              <span className="result-box-symbol">AR$</span>
              <span className="result-box-value">{formatCurrency(tarjetaARS)}</span>
            </div>
            <span className="result-box-label">Tarjeta +30%</span>
          </div>

          <button
            type="button"
            className="pyg-auto-custom-toggle"
            onClick={() => toggleExpansion('customPygRate')}
          >
            {expansions.customPygRate ? 'El local usa otra tasa ▲' : '⚙️ El local usa otra tasa ▼'}
          </button>
          {expansions.customPygRate && (
            <div className="pyg-auto-custom-input">
              <div className="input-wrapper">
                <span className="currency-symbol">₲</span>
                <input
                  type="text"
                  className="rate-input"
                  placeholder="6.200"
                  inputMode="numeric"
                  value={rateCustom}
                  onChange={(e) => handleRateChange(setRateCustom, e.target.value)}
                />
              </div>
            </div>
          )}
          {customPygARS != null && (
            <div className="result-box result-box--custom">
              <div className="result-box-left">
                <span className="result-box-symbol">AR$</span>
                <span className="result-box-value">{formatCurrency(customPygARS)}</span>
              </div>
              <span className="result-box-label">Tasa personalizada</span>
            </div>
          )}
        </div>

        <div className="divider" />

        <div className="ars-section">
          <div className="ars-header">
            <span className="ars-title">Tasas USD → ARS</span>
            <span className={`ars-status ${isArsLoading ? 'loading' : isError ? 'error' : ''}`}>{arsStatus}</span>
          </div>

          <div className="wallet-selector-wrapper">
            <label>Billetera Virtual</label>
            <select
              className="wallet-select"
              value={selectedWallet}
              onChange={(e) => setSelectedWallet(e.target.value)}
            >
              {WALLETS.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
          </div>

          {selectedWallet === 'arq' && (
            <div className="calib-section">
              <div className="conv-expand-label">
                Tasa DollarApp: ₲{effectiveDollarAppRate.rate.toLocaleString('es-PY', { maximumFractionDigits: 2 })}/USD
                {' '}(medida {effectiveDollarAppRate.measuredAt})
                {dollarAppDaysOld > 7 && ' 🟡 puede estar desactualizada'}
              </div>
              <button
                type="button"
                className="pyg-auto-custom-toggle"
                onClick={() => setShowCalibForm(!showCalibForm)}
              >
                {showCalibForm ? 'Registrar compra real ▲' : '📊 Registrar compra real ▼'}
              </button>
              {showCalibForm && (
                <div className="pyg-auto-custom-input">
                  <div className="input-wrapper">
                    <span className="currency-symbol">₲</span>
                    <input
                      type="text"
                      className="rate-input"
                      placeholder="Monto pagado en Gs"
                      inputMode="numeric"
                      value={calibGs}
                      onChange={(e) => setCalibGs(formatNumber(e.target.value))}
                    />
                  </div>
                  <div className="input-wrapper">
                    <span className="currency-symbol">U$D</span>
                    <input
                      type="text"
                      className="rate-input"
                      placeholder="USD debitados en la app"
                      inputMode="decimal"
                      value={calibUsd}
                      onChange={(e) => setCalibUsd(e.target.value.replace(/[^\d,.]/g, ''))}
                    />
                  </div>
                  <button
                    type="button"
                    className="pyg-refresh-btn"
                    onClick={() => {
                      calibrateDollarAppRate(parseNumber(calibGs), parseDecimal(calibUsd));
                      setCalibGs('');
                      setCalibUsd('');
                      setShowCalibForm(false);
                    }}
                  >
                    Guardar tasa
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="ars-rates-compact">
            <div className="ars-rate-compact-item">
              <div className="ars-rate-compact-label">Oficial</div>
              <div className="ars-rate-compact-value">
                {arsRates.oficial ? `AR$${arsRates.oficial.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
              </div>
            </div>
            <div className="ars-rate-compact-item">
              <div className="ars-rate-compact-label">Tarjeta</div>
              <div className="ars-rate-compact-value">
                {arsRates.tarjeta ? `AR$${arsRates.tarjeta.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
              </div>
            </div>
          </div>

          <div className="ars-optional">
            <button
              type="button"
              className="ars-optional-toggle"
              onClick={() => setShowOptionalArs(!showOptionalArs)}
            >
              {showOptionalArs ? 'Ocultar MEP y Cripto ▲' : 'Mostrar MEP y Cripto ▼'}
            </button>
            <div className={`ars-optional-rates ${showOptionalArs ? 'visible' : ''}`}>
              <div className="ars-rate-item">
                <div className="ars-rate-name">MEP</div>
                <div className="ars-rate-value">
                  {arsRates.mep ? `AR$${arsRates.mep.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                </div>
              </div>
              <div className="ars-rate-item">
                <div className="ars-rate-name">Cripto</div>
                <div className="ars-rate-value">
                  {arsRates.cripto ? `AR$${arsRates.cripto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="divider" />

        {/* ¿Cómo vas a pagar? */}
        <div className="section-title">¿Cómo vas a pagar?</div>
        {!hasAmount ? (
          <div className="empty-state-mini">
            Ingresá un monto en guaraníes para calcular
          </div>
        ) : (
          <div className="results-compact">
            {paymentCards.map((method) => {
              const isCheapest = cheapestIds.includes(method.id);
              const isMarket = method.rateType === 'market';
              const methodUsdAmount = getUsdAmountForMethod(method.id);
              const rawValue = isMarket
                ? (methodUsdAmount || null)
                : arsRatesForPayment && methodUsdAmount
                  ? calcPaymentMethod(method, methodUsdAmount, arsRatesForPayment)
                  : null;
              const touristValue = rawValue != null ? rawValue * 0.9 : null;

              const feeLabel = method.fee > 0 ? `+${method.fee}%` : '0% comisión';
              const networkFeeLabel = method.network ? `${method.network} · ${feeLabel}` : feeLabel;
              const rateLabel =
                method.id === 'efectivo-usd'
                  ? bestExchangeCompra
                    ? `Chaco compra ₲${bestExchangeCompra.toLocaleString('es-PY')}`
                    : 'Falta tasa Cambios Chaco ⚠️'
                  : method.id === 'arq-dolarapp'
                    ? `₲${effectiveDollarAppRate.rate.toLocaleString('es-PY', { maximumFractionDigits: 2 })}/USD (medida ${effectiveDollarAppRate.measuredAt.slice(5).split('-').reverse().join('/')})${dollarAppDaysOld > 7 ? ' 🟡' : ''}`
                    : method.rateType === 'tarjeta' ? 'Dólar Tarjeta +30%' :
                      method.fee > 0 ? `Tasa Mastercard +${method.fee}%` : 'Tasa interbancaria';

              const mainValueDisplay = isMarket
                ? `U$D ${formatCurrency(rawValue)}`
                : `AR$${formatCurrency(rawValue)}`;
              const touristValueDisplay = isMarket
                ? `U$D ${formatCurrency(touristValue)}`
                : `AR$${formatCurrency(touristValue)}`;

              return (
                <div key={method.id} className={`payment-card ${isCheapest ? 'cheapest' : ''}`}>
                  <button
                    type="button"
                    className="payment-card-header"
                    onClick={() => toggleExpansion(method.id)}
                  >
                    <div className="payment-card-info">
                      <div className="payment-card-title-row">
                        <span className="payment-card-icon">{method.icon}</span>
                        <span className="payment-card-title">{method.name}</span>
                        {isCheapest && <span className="cheapest-badge">⭐ Más barato</span>}
                      </div>
                      <div className="payment-card-network">{networkFeeLabel}</div>
                      <div className={`payment-card-value${isMarket ? ' usd' : ''}`}>{mainValueDisplay}</div>
                      <div className="payment-card-label">{rateLabel}</div>
                    </div>
                    <span className="conv-card-chevron">{expansions[method.id] ? '▲' : '▼'}</span>
                  </button>
                  {expansions[method.id] && (
                    <div className="payment-expand">
                      <div className="payment-expand-note">ℹ️ {method.note}</div>
                      {method.id === 'efectivo-usd' && renderEfectivoUsdRates()}
                      {hasTouristDiscount && touristValue != null && (
                        <div className="payment-expand-tourist">
                          💰 Con -10% turista: {touristValueDisplay}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tasa Cambios Chaco — fuente primaria para Efectivo USD */}
        <div className="casa-cambio-section">
          <div className="casa-cambio-body">
            <div className="casa-cambio-input-row">
              <span className="casa-cambio-input-label">
                🏦 Cambios Chaco compra USD
                {!chacoManualOverride && pygHouseRates.chaco.compra ? ' 🟢' : ''}
                {pygHouseRates.chaco.updatedAt ? ` · ${pygHouseRates.chaco.updatedAt}` : ''}
              </span>
              <div className="input-wrapper">
                <span className="currency-symbol">₲</span>
                <input
                  type="text"
                  className="rate-input"
                  placeholder={isHouseRatesLoading ? 'Cargando...' : '5.800'}
                  inputMode="numeric"
                  value={chacoRateInput}
                  onChange={(e) => handleChacoRateChange(e.target.value)}
                />
              </div>
            </div>
            {chacoManualOverride && (
              <div className="casa-cambio-override-row">
                <span className="casa-cambio-override-label">
                  Manual{pygHouseRates.chaco.compra ? ` · auto: ₲${pygHouseRates.chaco.compra.toLocaleString('es-PY')}` : ''}
                </span>
                <button type="button" className="pyg-refresh-btn" onClick={handleUseAutomaticChacoRate}>
                  ↺ Usar automático
                </button>
              </div>
            )}
            <div className="casa-cambio-help">
              Se actualiza automáticamente (🟢). Si escribís tu valor, se guarda por 12hs y reemplaza el automático.
            </div>
          </div>

          {/* Casas de cambio — consulta secundaria */}
          <button
            type="button"
            className="casa-cambio-header"
            onClick={() => toggleExpansion('casaCambio')}
          >
            <span>📊 Ver cotizaciones de casas de cambio</span>
            <span>{expansions.casaCambio ? '▲' : '▼'}</span>
          </button>
          {expansions.casaCambio && (
            <div className="casa-cambio-body">
              <p className="casa-cambio-intro">Consultá los sitios en vivo para comparar antes de ir</p>

              <div className="casa-cambio-widget">
                <button
                  type="button"
                  className="casa-cambio-widget-toggle"
                  onClick={() => toggleExpansion('casaCambioChacoWidget')}
                >
                  <span>🏦 Cambios Chaco</span>
                  <span className="conv-card-chevron">{expansions.casaCambioChacoWidget ? '▲' : '▼'}</span>
                </button>
                <iframe
                  className={`widget-frame ${expansions.casaCambioChacoWidget ? 'expanded' : ''}`}
                  src="https://www.cambioschaco.com.py/widgets/cotizacion/?lang=es"
                  title="Cambios Chaco"
                />
              </div>

              <div className="casa-cambio-widget">
                <button
                  type="button"
                  className="casa-cambio-widget-toggle"
                  onClick={() => toggleExpansion('casaCambioMaxiWidget')}
                >
                  <span>💵 Maxicambios</span>
                  <span className="conv-card-chevron">{expansions.casaCambioMaxiWidget ? '▲' : '▼'}</span>
                </button>
                <iframe
                  className={`widget-frame ${expansions.casaCambioMaxiWidget ? 'expanded' : ''}`}
                  src="https://www.maxicambios.com.py/share"
                  title="Maxicambios"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="footer">Tasas ARS en vivo desde DolarApi.com</div>
    </div>
  );
}
