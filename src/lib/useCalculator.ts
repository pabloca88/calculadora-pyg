'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ARSRates, Conversion, EffectiveRate } from './types';
import {
  loadCalculatorData,
  saveCalculatorData,
  loadARSCache,
  loadEffectiveDollarAppRate,
  saveEffectiveDollarAppRate,
} from './storage';
import {
  fetchARSRates,
  getARSStatus,
  getPYGtoUSDRate,
  getCachedPygRate,
  fetchPygExchangeHouseRates,
  type PygExchangeHouseRates,
} from './rates';
import { calculateConversions, hasValidInputs } from './calculator';
import { parseNumber } from './format';

export type PygRateStatus = 'live' | 'cached' | 'fallback';

const DEFAULT_ARS_RATES: ARSRates = {
  oficial: null,
  tarjeta: null,
  mep: null,
  cripto: null,
  custom: null,
};

const DEFAULT_HOUSE_RATES: PygExchangeHouseRates = {
  rate: { compra: null, venta: null, updatedAt: null, source: 'none' },
  houseSource: 'none',
};

export const useCalculator = () => {
  const [pygAmount, setPygAmount] = useState('');
  const [rateChaco, setRateChaco] = useState('');
  const [rateCustom, setRateCustom] = useState('');
  const [selectedFee, setSelectedFee] = useState<number | 'custom'>(0);
  const [feeCustomValue, setFeeCustomValue] = useState('');
  const [selectedWallet, setSelectedWallet] = useState('arq');
  const [selectedExchange, setSelectedExchange] = useState<'chaco' | 'custom'>('chaco');
  const [arsRates, setArsRates] = useState<ARSRates>(DEFAULT_ARS_RATES);
  const [arsStatus, setArsStatus] = useState('Cargando...');
  const [isArsLoading, setIsArsLoading] = useState(true);
  const [pygUsdRate, setPygUsdRate] = useState(6100);
  const [pygRateStatus, setPygRateStatus] = useState<PygRateStatus>('fallback');
  const [pygHouseRates, setPygHouseRates] = useState<PygExchangeHouseRates>(DEFAULT_HOUSE_RATES);
  const [isHouseRatesLoading, setIsHouseRatesLoading] = useState(true);
  const [effectiveDollarAppRate, setEffectiveDollarAppRate] = useState<EffectiveRate>(
    { rate: 5991.05, measuredAt: '2026-07-28' }
  );
  const [showOptionalArs, setShowOptionalArs] = useState(false);
  const [showCustomFee, setShowCustomFee] = useState(false);
  const [expansions, setExpansions] = useState<Record<string, boolean>>({ chaco: false });
  const [results, setResults] = useState<Conversion[]>([]);
  const [showEmptyState, setShowEmptyState] = useState(true);
  const [isError, setIsError] = useState(false);

  const loadSavedData = useCallback(() => {
    const saved = loadCalculatorData();
    if (!saved) return;

    if (saved.amount) setPygAmount(saved.amount.toLocaleString('es-PY'));
    if (saved.rateChaco) setRateChaco(saved.rateChaco.toLocaleString('es-PY'));
    if (saved.customRate) setRateCustom(saved.customRate.toLocaleString('es-PY'));
    if (saved.selectedFee !== undefined) {
      if (saved.selectedFee === 'custom') {
        setSelectedFee('custom');
        setShowCustomFee(true);
        if (saved.customFeeValue) setFeeCustomValue(saved.customFeeValue);
      } else {
        setSelectedFee(saved.selectedFee);
      }
    }
    if (saved.selectedWallet) setSelectedWallet(saved.selectedWallet);
    if (saved.selectedExchange) setSelectedExchange(saved.selectedExchange);

    setEffectiveDollarAppRate(loadEffectiveDollarAppRate());
  }, []);

  const fetchHouseRates = useCallback(async (force = false) => {
    setIsHouseRatesLoading(true);
    const data = await fetchPygExchangeHouseRates(force);
    setPygHouseRates(data);
    setIsHouseRatesLoading(false);
  }, []);

  const calibrateDollarAppRate = useCallback((pygPaid: number, usdDebited: number) => {
    if (!pygPaid || !usdDebited || pygPaid <= 0 || usdDebited <= 0) return;
    const rate: EffectiveRate = {
      rate: pygPaid / usdDebited,
      measuredAt: new Date().toISOString().slice(0, 10),
    };
    saveEffectiveDollarAppRate(rate);
    setEffectiveDollarAppRate(rate);
  }, []);

  const fetchRates = useCallback(async () => {
    setIsArsLoading(true);
    setIsError(false);
    setArsStatus('Cargando...');

    let data = await fetchARSRates();
    if (!data.tarjeta && !data.oficial) {
      const cached = loadARSCache();
      if (cached) data = cached;
    }

    const error = !data.tarjeta && !data.oficial;
    setArsRates(data);
    setIsError(error);
    setIsArsLoading(false);
    setArsStatus(getARSStatus(false, error));
  }, []);

  const fetchPygRate = useCallback(async (force = false) => {
    const before = getCachedPygRate();
    const rate = await getPYGtoUSDRate(force);
    const after = getCachedPygRate();

    let status: PygRateStatus;
    if (after && (!before || after.timestamp !== before.timestamp)) {
      status = 'live';
    } else if (after) {
      status = 'cached';
    } else {
      status = 'fallback';
    }

    setPygUsdRate(rate);
    setPygRateStatus(status);
  }, []);

  const calculate = useCallback(() => {
    const conversions = calculateConversions(
      pygAmount,
      rateChaco,
      rateCustom,
      '',
      arsRates,
      selectedFee
    );
    setResults(conversions);
    setShowEmptyState(!hasValidInputs(pygAmount, rateChaco, rateCustom));
    saveCalculatorData({
      amount: parseNumber(pygAmount),
      rateChaco: parseNumber(rateChaco),
      customRate: parseNumber(rateCustom),
      selectedFee,
      customFeeValue: feeCustomValue,
      selectedWallet,
      selectedExchange,
    });
  }, [pygAmount, rateChaco, rateCustom, arsRates, selectedFee, feeCustomValue, selectedWallet, selectedExchange]);

  useEffect(() => {
    loadSavedData();
    fetchRates();
    const interval = setInterval(fetchRates, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadSavedData, fetchRates]);

  useEffect(() => {
    fetchPygRate();
    const interval = setInterval(fetchPygRate, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchPygRate]);

  useEffect(() => {
    fetchHouseRates();
    const interval = setInterval(() => fetchHouseRates(), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchHouseRates]);

  useEffect(() => {
    calculate();
  }, [calculate]);

  const toggleExpansion = (widget: string) => {
    setExpansions((prev) => ({ ...prev, [widget]: !prev[widget] }));
  };

  const handleFeeSelect = (fee: number | 'custom') => {
    setSelectedFee(fee);
    setShowCustomFee(fee === 'custom');
  };

  const handleFeeCustomChange = (value: string) => {
    setFeeCustomValue(value);
    setSelectedFee(parseFloat(value) || 0);
  };

  return {
    pygAmount,
    setPygAmount,
    rateChaco,
    setRateChaco,
    rateCustom,
    setRateCustom,
    selectedFee,
    feeCustomValue,
    arsRates,
    arsStatus,
    isArsLoading,
    pygUsdRate,
    pygRateStatus,
    fetchPygRate,
    pygHouseRates,
    isHouseRatesLoading,
    fetchHouseRates,
    effectiveDollarAppRate,
    calibrateDollarAppRate,
    showOptionalArs,
    setShowOptionalArs,
    showCustomFee,
    expansions,
    results,
    showEmptyState,
    toggleExpansion,
    handleFeeSelect,
    handleFeeCustomChange,
    setSelectedFee,
    setShowCustomFee,
    setResults,
    setShowEmptyState,
    setArsRates,
    isError,
    selectedWallet,
    setSelectedWallet,
    selectedExchange,
    setSelectedExchange,
  };
};
