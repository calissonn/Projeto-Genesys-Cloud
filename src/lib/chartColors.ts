import { useApp } from '../context/AppContext';

/**
 * Paleta de gráficos (validada para daltonismo nos modos claro e escuro).
 * Cores seguem a ENTIDADE (ex.: autosserviço é sempre verde-água), nunca a posição.
 */
const LIGHT = {
  selfService: '#1baf7a', transfer: '#2a78d6', disconnect: '#eb6834', other: '#a3a29b',
  s4: '#eda100', s5: '#e87ba4', s6: '#008300', s7: '#6250d6',
  surface: '#ffffff', grid: '#e1e0d9', axis: '#8a8984', text: '#52514e',
  good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b',
};
const DARK: typeof LIGHT = {
  selfService: '#199e70', transfer: '#3987e5', disconnect: '#d95926', other: '#6b6a64',
  s4: '#c98500', s5: '#d55181', s6: '#008300', s7: '#9085e9',
  surface: '#0f172a', grid: '#2c2c2a', axis: '#7a7974', text: '#c3c2b7',
  good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b',
};
export type ChartColors = typeof LIGHT;

export function useChartColors(): ChartColors {
  const { theme } = useApp();
  return theme === 'dark' ? DARK : LIGHT;
}

export const CATEGORICAL_KEYS = ['transfer', 'disconnect', 'selfService', 's4', 's5', 's6', 's7'] as const;
