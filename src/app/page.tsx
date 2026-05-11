'use client';

import { useCalculator } from '@/lib/useCalculator';
import { formatNumber, formatARSRate, validateARSRate, formatCurrency, parseNumber } from '@/lib/format';

const WALLETS = ['DollarApp', 'Wallbit', 'Wise', 'Binance', 'Otra'];

export default function Page() {
  const {
    pygAmount,
    setPygAmount,
    rateChaco,
    setRateChaco,
    rateMaxi,
    setRateMaxi,
    rateArsCustom,
    setRateArsCustom,
    selectedFee,
    feeCustomValue,
    arsRates,
    arsStatus,
    isArsLoading,
    isError,
    showOptionalArs,
    setShowOptionalArs,
    showCustomFee,
    expansions,
    results,
    showEmptyState,
    toggleExpansion,
    handleFeeSelect,
    handleFeeCustomChange,
    selectedWallet,
    setSelectedWallet,
    customWalletName,
    setCustomWalletName,
  } = useCalculator();

  const walletDisplayName =
    selectedWallet === 'Otra'
      ? (customWalletName.trim() || 'Billetera Virtual')
      : selectedWallet;

  const handleAmountChange = (value: string) => setPygAmount(formatNumber(value));
  const handleRateChange = (setter: (value: string) => void, value: string) => setter(formatNumber(value));
  const handleArsCustomChange = (value: string) => setRateArsCustom(formatARSRate(value));

  const arsCustomValidation = rateArsCustom ? validateARSRate(rateArsCustom) : null;

  const pygAmountRaw = parseNumber(pygAmount);
  const hasTouristDiscount = pygAmountRaw > 0;

  // Derive payment method cards — exclude Personalizada
  const sourceResults = results.filter((r) => r.source !== 'Personalizada');
  const tarjetaRows = sourceResults.filter((r) => r.arsRates.tarjeta !== null);
  const billeteraRows = sourceResults.filter((r) => r.arsRates.custom !== null);
  const efectivoRows = sourceResults;

  const feeIsActive = typeof selectedFee === 'number' && selectedFee > 0;

  // "Más barato" comparison
  const tarjetaBest =
    tarjetaRows.length > 0
      ? Math.min(...tarjetaRows.map((r) => r.arsRates.tarjeta!))
      : Infinity;

  const billeteraBest =
    billeteraRows.length > 0
      ? Math.min(
          ...billeteraRows.map((r) => {
            const fee = r.arsRates.customWithFee;
            return feeIsActive && fee != null ? fee : r.arsRates.custom!;
          })
        )
      : Infinity;

  const efectivoBest =
    arsRates.oficial != null && efectivoRows.length > 0
      ? Math.min(...efectivoRows.map((r) => r.usd * arsRates.oficial!))
      : Infinity;

  const methodsWithData = [
    tarjetaRows.length > 0,
    billeteraRows.length > 0,
    efectivoRows.length > 0 && arsRates.oficial != null,
  ].filter(Boolean).length;

  const minVal = Math.min(tarjetaBest, billeteraBest, efectivoBest);
  const cheapest =
    methodsWithData >= 2 && minVal < Infinity
      ? minVal === tarjetaBest
        ? 'tarjeta'
        : minVal === billeteraBest
        ? 'billetera'
        : 'efectivo'
      : null;

  const multi = (rows: unknown[]) => rows.length > 1;

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

        <div className="section">
          <div className="section-title">Tasas PYG → USD</div>

          <div className="widget-compact">
            <div className="widget-header">
              <span className="widget-name">🏦 Cambios Chaco</span>
              <button type="button" className="widget-toggle" onClick={() => toggleExpansion('chaco')}>
                Ver tasas
              </button>
            </div>
            <iframe
              className={`widget-frame ${expansions.chaco ? 'expanded' : ''}`}
              src="https://www.cambioschaco.com.py/widgets/cotizacion/?lang=es"
              title="Cambios Chaco"
            />
          </div>

          <div className="widget-compact">
            <div className="widget-header">
              <span className="widget-name">💵 Maxicambios</span>
              <button type="button" className="widget-toggle" onClick={() => toggleExpansion('maxi')}>
                Ver tasas
              </button>
            </div>
            <iframe
              className={`widget-frame ${expansions.maxi ? 'expanded' : ''}`}
              src="https://www.maxicambios.com.py/share"
              title="Maxicambios"
            />
          </div>

          <div className="rate-inputs">
            <div className="rate-input-compact">
              <label>Cambios Chaco</label>
              <div className="input-wrapper">
                <span className="currency-symbol">₲</span>
                <input
                  type="text"
                  className="rate-input"
                  placeholder="6.200"
                  inputMode="numeric"
                  value={rateChaco}
                  onChange={(e) => handleRateChange(setRateChaco, e.target.value)}
                />
              </div>
            </div>
            <div className="rate-input-compact">
              <label>Maxicambios</label>
              <div className="input-wrapper">
                <span className="currency-symbol">₲</span>
                <input
                  type="text"
                  className="rate-input"
                  placeholder="6.200"
                  inputMode="numeric"
                  value={rateMaxi}
                  onChange={(e) => handleRateChange(setRateMaxi, e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="divider" />

        <div className="ars-section">
          <div className="ars-header">
            <span className="ars-title">Tasas USD → ARS</span>
            <span className={`ars-status ${isArsLoading ? 'loading' : isError ? 'error' : ''}`}>{arsStatus}</span>
          </div>

          <div className="ars-rates">
            <div className="ars-rate-item">
              <div className="ars-rate-name">Oficial</div>
              <div className="ars-rate-value">
                {arsRates.oficial ? `AR$${arsRates.oficial.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
              </div>
            </div>
            <div className="ars-rate-item">
              <div className="ars-rate-name">Tarjeta</div>
              <div className="ars-rate-value">
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

          <div className="wallet-selector-wrapper">
            <label>Billetera Virtual</label>
            <select
              className="wallet-select"
              value={selectedWallet}
              onChange={(e) => setSelectedWallet(e.target.value)}
            >
              {WALLETS.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
            {selectedWallet === 'Otra' && (
              <input
                type="text"
                className="wallet-custom-input"
                placeholder="Nombre de tu billetera"
                value={customWalletName}
                onChange={(e) => setCustomWalletName(e.target.value)}
              />
            )}
          </div>

          <div className="custom-ars-rate">
            <label htmlFor="rate-ars-custom">Tasa {walletDisplayName}</label>
            <div className="input-wrapper">
              <span className="currency-symbol">AR$</span>
              <input
                id="rate-ars-custom"
                type="text"
                className={`rate-input${arsCustomValidation ? (arsCustomValidation.isValid ? ' valid' : ' error') : ''}`}
                placeholder="1.471,41"
                inputMode="decimal"
                value={rateArsCustom}
                onChange={(e) => handleArsCustomChange(e.target.value)}
                aria-label="Tasa en pesos argentinos"
              />
            </div>
            {arsCustomValidation && !arsCustomValidation.isValid ? (
              <div className="input-error">⚠️ {arsCustomValidation.message}</div>
            ) : (
              <div className="input-helper">💡 Formato: 1.471,41 (punto miles, coma decimales)</div>
            )}
          </div>

          <div className="card-fee-section">
            <label>Recargo tarjeta billetera</label>
            <div className="fee-options">
              <button
                type="button"
                className={`fee-option ${selectedFee === 0 ? 'active' : ''}`}
                onClick={() => handleFeeSelect(0)}
              >
                <span className="fee-option-label">Sin recargo</span>
              </button>
              <button
                type="button"
                className={`fee-option ${selectedFee === 2 ? 'active' : ''}`}
                onClick={() => handleFeeSelect(2)}
              >
                <span className="fee-option-label">2%</span>
              </button>
              <button
                type="button"
                className={`fee-option ${selectedFee === 3 ? 'active' : ''}`}
                onClick={() => handleFeeSelect(3)}
              >
                <span className="fee-option-label">3%</span>
              </button>
              <button
                type="button"
                className={`fee-option ${selectedFee === 'custom' ? 'active' : ''}`}
                onClick={() => handleFeeSelect('custom')}
              >
                <span className="fee-option-label">Custom</span>
              </button>
            </div>
            {showCustomFee && (
              <div className="fee-custom-input visible">
                <input
                  type="number"
                  placeholder="Ingresá %"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  max="100"
                  value={feeCustomValue}
                  onChange={(e) => handleFeeCustomChange(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="divider" />

        <div className="section-title">Conversiones</div>
        <div id="results" className="results-compact">
          {showEmptyState ? (
            <div className="empty-state-mini">
              Ingresá un monto en guaraníes y las tasas PYG para calcular
            </div>
          ) : (
            <>
              {/* ── Card 1: Tarjeta de Crédito ── */}
              {tarjetaRows.length > 0 && (
                <div className="result-mini">
                  <div className="result-card-header">
                    <span className="result-card-name">💳 Tarjeta de Crédito Argentina</span>
                    {cheapest === 'tarjeta' && <span className="cheapest-badge">⭐ Más barato</span>}
                  </div>

                  {/* Dólar Oficial */}
                  {tarjetaRows.some((r) => r.arsRates.oficial != null) && (
                    <>
                      <div className="result-group-label">Dólar Oficial <span className="result-group-hint">(pagás con USD)</span></div>
                      <div className="result-source-rows">
                        {tarjetaRows.map((conv, i) =>
                          conv.arsRates.oficial != null ? (
                            <div key={i} className="result-source-row">
                              {multi(tarjetaRows) && <span className="result-source-name">• {conv.source}</span>}
                              <span className={`result-value-ars${multi(tarjetaRows) ? '' : ' large'}`}>
                                AR${formatCurrency(conv.arsRates.oficial)}
                              </span>
                            </div>
                          ) : null
                        )}
                      </div>
                    </>
                  )}

                  {/* Dólar Tarjeta */}
                  <div className="result-group-label">Dólar Tarjeta +30% <span className="result-group-hint">(pagás con ARS)</span></div>
                  <div className="result-source-rows">
                    {tarjetaRows.map((conv, i) => (
                      <div key={i} className="result-source-row">
                        {multi(tarjetaRows) && <span className="result-source-name">• {conv.source}</span>}
                        <span className={`result-value-ars${multi(tarjetaRows) ? '' : ' large'}`}>
                          AR${formatCurrency(conv.arsRates.tarjeta)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="result-official-info">
                    💡 <strong>Dólar Oficial:</strong> si pagás tu tarjeta con USD<br />
                    <strong>Dólar Tarjeta +30%:</strong> si pagás con pesos argentinos
                  </div>

                  {hasTouristDiscount && (
                    <div className="result-tourist-section">
                      <div className="result-tourist-title">💰 Con descuento turista (-10%):</div>
                      <div className="result-source-rows">
                        {tarjetaRows.map((conv, i) =>
                          conv.arsRates.oficial != null ? (
                            <div key={`of-${i}`} className="result-source-row">
                              <span className="result-source-name">
                                {multi(tarjetaRows) ? `• Oficial con USD (${conv.source})` : '• Oficial (con USD)'}
                              </span>
                              <span className="result-value-ars">
                                AR${formatCurrency(conv.arsRates.oficial * 0.9)}
                              </span>
                            </div>
                          ) : null
                        )}
                        {tarjetaRows.map((conv, i) => (
                          <div key={`tar-${i}`} className="result-source-row">
                            <span className="result-source-name">
                              {multi(tarjetaRows) ? `• Tarjeta +30% (${conv.source})` : '• Tarjeta +30% (con ARS)'}
                            </span>
                            <span className="result-value-ars">
                              AR${formatCurrency(conv.arsRates.tarjeta! * 0.9)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Card 2: Billetera Virtual ── */}
              {billeteraRows.length > 0 && (
                <div className="result-mini">
                  <div className="result-card-header">
                    <span className="result-card-name">
                      💰 Billetera Virtual{walletDisplayName !== 'Billetera Virtual' ? ` - ${walletDisplayName}` : ''}
                    </span>
                    {cheapest === 'billetera' && <span className="cheapest-badge">⭐ Más barato</span>}
                  </div>
                  <div className="result-source-rows">
                    {billeteraRows.map((conv, i) => (
                      <div key={i} className="result-source-row">
                        {multi(billeteraRows) && <span className="result-source-name">• {conv.source}</span>}
                        <span className={`result-value-ars${multi(billeteraRows) ? '' : ' large'}`}>
                          AR${formatCurrency(conv.arsRates.custom)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {feeIsActive && billeteraRows.some((r) => r.arsRates.customWithFee) && (
                    <div className="result-fee-addendum">
                      <div className="result-fee-addendum-label">+{selectedFee}% recargo</div>
                      <div className="result-source-rows">
                        {billeteraRows.map((conv, i) =>
                          conv.arsRates.customWithFee ? (
                            <div key={i} className="result-source-row">
                              {multi(billeteraRows) && <span className="result-source-name">• {conv.source}</span>}
                              <span className="result-fee-addendum-value">
                                AR${formatCurrency(conv.arsRates.customWithFee)}
                              </span>
                            </div>
                          ) : null
                        )}
                      </div>
                    </div>
                  )}

                  {hasTouristDiscount && (
                    <div className="result-tourist-section">
                      <div className="result-tourist-title">💰 Con descuento turista (-10%):</div>
                      <div className="result-source-rows">
                        {billeteraRows.map((conv, i) => (
                          <div key={`base-${i}`} className="result-source-row">
                            <span className="result-source-name">
                              {multi(billeteraRows) ? `• Sin recargo (${conv.source})` : '• Sin recargo'}
                            </span>
                            <span className="result-value-ars">
                              AR${formatCurrency(conv.arsRates.custom! * 0.9)}
                            </span>
                          </div>
                        ))}
                        {feeIsActive &&
                          billeteraRows.map((conv, i) =>
                            conv.arsRates.customWithFee ? (
                              <div key={`fee-${i}`} className="result-source-row">
                                <span className="result-source-name">
                                  {multi(billeteraRows)
                                    ? `• Con recargo (${conv.source})`
                                    : `• Con recargo (+${selectedFee}%)`}
                                </span>
                                <span className="result-value-ars">
                                  AR${formatCurrency(conv.arsRates.customWithFee * 0.9)}
                                </span>
                              </div>
                            ) : null
                          )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Card 3: Efectivo USD ── */}
              {efectivoRows.length > 0 && (
                <div className="result-mini">
                  <div className="result-card-header">
                    <span className="result-card-name">💵 Efectivo USD</span>
                    {cheapest === 'efectivo' && <span className="cheapest-badge">⭐ Más barato</span>}
                  </div>
                  <div className="result-card-subtitle">Gastarías comprando guaraníes en:</div>
                  <div className="result-source-rows">
                    {efectivoRows.map((conv, i) => (
                      <div key={i} className="result-source-row">
                        <span className="result-source-name">• {conv.source}</span>
                        <span className="result-value-usd">U$D {formatCurrency(conv.usd)}</span>
                      </div>
                    ))}
                  </div>

                  {hasTouristDiscount && (
                    <div className="result-tourist-section">
                      <div className="result-tourist-title">💰 Con descuento turista (-10%):</div>
                      <div className="result-source-rows">
                        {efectivoRows.map((conv, i) => (
                          <div key={i} className="result-source-row">
                            <span className="result-source-name">• {conv.source}</span>
                            <span className="result-value-usd">U$D {formatCurrency(conv.usd * 0.9)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="footer">Tasas ARS en vivo desde DolarApi.com</div>
    </div>
  );
}
