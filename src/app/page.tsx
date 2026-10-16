'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { brand } from '@/config/brand';
import { useCalculator } from '@/lib/useCalculator';
import { formatNumber, formatCurrency, parseNumber, formatARSRate, parseARSRate, formatHouseUpdatedAt } from '@/lib/format';
import { PAYMENT_METHODS_AR, MERCADO_PAGO_METHOD, WALLET_METHODS, calcPaymentMethod, calcReferenceUsdAmount, getCheapestMethodIds } from '@/lib/calculator';
import { readValidChacoOverride, saveChacoOverride, clearChacoOverride, isValidManualVenta } from '@/lib/chacoOverride';

const WALLETS = [
  { value: 'arq', label: 'ARQ / DollarApp' },
  { value: 'payoneer', label: 'Payoneer' },
];

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
    pygHouseRates,
    isHouseRatesLoading,
    fetchHouseRates,
    effectiveDollarAppRate,
    calibrateDollarAppRate,
    showOptionalArs,
    setShowOptionalArs,
    expansions,
    toggleExpansion,
    selectedWallet,
    setSelectedWallet,
  } = useCalculator();

  const [isRefreshingHouse, setIsRefreshingHouse] = useState(false);

  const handleRefreshHouseRate = async () => {
    setIsRefreshingHouse(true);
    await fetchHouseRates(true);
    setIsRefreshingHouse(false);
  };

  // Casas de cambio de referencia (Fase 3) — el usuario puede sobreescribir
  // manualmente el valor "Venta USD" traído por scraping desde /api/pyg-rates
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

  // Autocompleta con el valor scrapeado (Chaco o, si no está disponible,
  // Maxicambios) mientras el usuario no haya tipeado el suyo
  useEffect(() => {
    if (!chacoManualOverride && pygHouseRates.rate.venta) {
      setChacoRateInput(pygHouseRates.rate.venta.toLocaleString('es-PY'));
    }
  }, [chacoManualOverride, pygHouseRates.rate.venta]);

  // Out-of-range values (4.000–10.000) are kept in the field so the user can
  // fix them, but never saved nor used as the reference rate.
  const handleChacoRateChange = (value: string) => {
    const formatted = formatNumber(value);
    setChacoRateInput(formatted);
    setChacoManualOverride(!!formatted);
    if (formatted) {
      saveChacoOverride(formatted);
    } else {
      clearChacoOverride();
    }
  };

  const handleUseAutomaticChacoRate = () => {
    clearChacoOverride();
    setChacoManualOverride(false);
    setChacoRateInput(pygHouseRates.rate.venta ? pygHouseRates.rate.venta.toLocaleString('es-PY') : '');
  };

  const handleAmountChange = (value: string) => setPygAmount(formatNumber(value));
  const handleRateChange = (setter: (value: string) => void, value: string) => setter(formatNumber(value));

  const pygAmountRaw = parseNumber(pygAmount);
  const hasTouristDiscount = pygAmountRaw > 0;

  // Tasa única de referencia: VENTA de la casa de cambio (Cambios Chaco, o
  // Maxicambios si Chaco no respondió) vía /api/pyg-rates, con el override
  // manual del usuario con prioridad si está activo. Ya no hay una tasa de
  // mercado internacional de respaldo — sin tasa de referencia, no hay USD
  // que mostrar (el recuadro de arriba y todo lo que deriva de él muestran
  // "-" en vez de un número inventado).
  // A typed venta outside 4.000–10.000 is rejected (null → "-"), never used.
  const referenceVenta = isValidManualVenta(chacoRateInput) ? parseNumber(chacoRateInput) : null;
  const manualVentaOutOfRange = chacoManualOverride && !!chacoRateInput && referenceVenta === null;

  // Base para el recuadro U$D principal y todo lo que deriva de él (Dólar
  // Oficial, Tarjeta +30%, tasa personalizada) — y también para Efectivo USD
  // y las tarjetas/billeteras sin tasa propia, que usan la misma referencia.
  const usdAmount = calcReferenceUsdAmount(pygAmountRaw, referenceVenta) ?? 0;
  const hasAmount = usdAmount > 0;

  const oficialARS = hasAmount && arsRates.oficial ? usdAmount * arsRates.oficial : null;
  const tarjetaARS = hasAmount && arsRates.tarjeta ? usdAmount * arsRates.tarjeta : null;

  // Tasa personalizada del local (₲), alternativa opcional a la tasa automática
  const customPygRateVal = parseNumber(rateCustom);
  const customUsdAmount = hasAmount && customPygRateVal > 0 ? pygAmountRaw / customPygRateVal : 0;
  const customPygARS = customUsdAmount > 0 && arsRates.oficial ? customUsdAmount * arsRates.oficial : null;

  // ARQ / DollarApp: reference effective rate (calibrable at the bottom of
  // the wallet section) — the only method with its own rate.
  const usdAmountArq =
    pygAmountRaw > 0 && effectiveDollarAppRate.rate > 0
      ? pygAmountRaw / effectiveDollarAppRate.rate
      : 0;
  const dollarAppDaysOld = Math.floor(
    (Date.now() - new Date(effectiveDollarAppRate.measuredAt).getTime()) / 86_400_000
  );

  const getUsdAmountForMethod = (methodId: string): number => {
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

  // Fecha/hora de la cotización según la propia casa (no la hora del fetch);
  // el detalle de Chaco/Maxi queda solo dentro de "Ver cotizaciones".
  const houseUpdatedAt = formatHouseUpdatedAt(pygHouseRates.rate.updatedAt);

  const renderEfectivoUsdRates = () => {
    if (!referenceVenta) {
      return (
        <div className="conv-expand-row">
          <span className="conv-expand-label">
            ⚠️ La tasa de venta se carga automáticamente. Si falla, ingresala manualmente en la sección de abajo.
          </span>
        </div>
      );
    }
    return (
      <div className="conv-expand-row">
        <span className="conv-expand-label">
          Tasa: venta ₲{referenceVenta.toLocaleString('es-PY')}
          {chacoManualOverride ? ' (manual)' : houseUpdatedAt ? ` · act. ${houseUpdatedAt}` : ''}
        </span>
      </div>
    );
  };

  return (
    <div className="container">
      <header className="header">
        <div className="header-title-row">
          <Image src={brand.images.headerLogo} width={28} height={28} alt="" className="header-logo" priority />
          <h1>{brand.name}</h1>
        </div>
        <p className="header-subtitle">{brand.subtitle}</p>
      </header>

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
              <span className="result-box-value">{hasAmount ? formatCurrency(usdAmount) : '-'}</span>
            </div>
            {isRefreshingHouse ? (
              <span className="result-box-label">⏳ actualizando...</span>
            ) : isHouseRatesLoading ? (
              <span className="result-box-label">⏳ cargando...</span>
            ) : referenceVenta ? (
              <span className="result-box-label">🟢 en vivo</span>
            ) : manualVentaOutOfRange ? (
              <span className="result-box-label">⚠️ revisá la venta</span>
            ) : (
              <span className="result-box-label pyg-refresh-fallback">
                🔴 sin conexión
                <button
                  type="button"
                  className="pyg-refresh-icon-btn"
                  onClick={handleRefreshHouseRate}
                  aria-label="Actualizar tasa"
                >
                  🔄
                </button>
              </span>
            )}
          </div>

          {/* Only when the API itself has no rate: right after the rates load,
              chacoRateInput is filled by an effect one render later, and
              keying off it alone made this hint flash (layout shift). */}
          {!referenceVenta && !pygHouseRates.rate.venta && !isHouseRatesLoading && !isRefreshingHouse && (
            <p className="rate-missing-hint" role="status">
              No se pudo obtener la tasa de cambio. Tocá 🔄 para reintentar o escribí la venta USD
              en &quot;Venta USD&quot; más abajo.
            </p>
          )}

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
            <label htmlFor="wallet-select">Billetera Virtual</label>
            <select
              id="wallet-select"
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
                {showCalibForm ? 'Registrar operación real ▲' : '📊 Registrar operación real ▼'}
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
                      // "16.69" and "16,69" both mean 16,69 USD (decimal keypads
                      // show "." or "," depending on the phone's region); it is
                      // normalized to "16,69" so parseARSRate can't misread the dot
                      // as a thousands separator (parseDecimal turned it into 1669).
                      onChange={(e) => setCalibUsd(formatARSRate(e.target.value))}
                    />
                  </div>
                  <button
                    type="button"
                    className="pyg-refresh-btn"
                    onClick={() => {
                      calibrateDollarAppRate(parseNumber(calibGs), parseARSRate(calibUsd));
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
                  ? referenceVenta
                    ? `Venta ₲${referenceVenta.toLocaleString('es-PY')}${chacoManualOverride ? ' (manual)' : ''}`
                    : 'Falta tasa de cambio ⚠️'
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

        {/* Tasa automática — fuente (Chaco/Maxi) solo visible en "Ver cotizaciones" */}
        <div className="casa-cambio-section">
          <div className="casa-cambio-body">
            <div className="casa-cambio-input-row">
              <span className="casa-cambio-input-label">
                Venta USD{referenceVenta ? ` ₲${referenceVenta.toLocaleString('es-PY')}` : ''}
                {chacoManualOverride ? ' · manual' : houseUpdatedAt ? ` · act. ${houseUpdatedAt}` : ''}
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
            {manualVentaOutOfRange && (
              <p className="rate-missing-hint" role="alert">
                La venta tiene que estar entre ₲4.000 y ₲10.000. Revisá el número o usá el automático.
              </p>
            )}
            {chacoManualOverride && (
              <div className="casa-cambio-override-row">
                <span className="casa-cambio-override-label">
                  Manual{pygHouseRates.rate.venta ? ` · auto: ₲${pygHouseRates.rate.venta.toLocaleString('es-PY')}` : ''}
                </span>
                <button type="button" className="pyg-refresh-btn" onClick={handleUseAutomaticChacoRate}>
                  ↺ Usar automático
                </button>
              </div>
            )}
            <div className="casa-cambio-help">
              Se actualiza automáticamente. Si escribís tu valor, se guarda por 12hs y reemplaza el automático.
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
