/**
 * Motor de Predicciones de Calidad del Aire
 * Usa regresión lineal simple basada en patrones históricos
 */

export interface Prediction {
  timestamp: number;
  hour: number;
  aqi: number;
  aqiMin: number;
  aqiMax: number;
  confidence: number; // 0-1
  trend: 'improving' | 'stable' | 'worsening';
}

export interface ForecastDay {
  date: string;
  dayName: string;
  avgAqi: number;
  maxAqi: number;
  minAqi: number;
  trend: 'improving' | 'stable' | 'worsening';
  recommendation: string;
}

// Histórico REAL desde serie SIATA (PM2.5 → AQI EPA). null si no hay
// suficientes puntos válidos: quien llama cae a generateHistoricalData().
export function seriesToHistory(
  points: Array<{ t: number; pm25: number | null }>,
): Array<{ timestamp: number; aqi: number; pm25: number }> | null {
  const rows = points.filter(p => p.pm25 != null && p.pm25 >= 0);
  if (rows.length < 12) return null;
  return rows.slice(-72).map(p => ({
    timestamp: p.t,
    pm25: Math.round((p.pm25 as number) * 10) / 10,
    aqi: Math.round(pm25ToAqi(p.pm25 as number)),
  }));
}

/** Ruido pseudoaleatorio determinista: el pronóstico no cambia en cada apertura. */
function pseudo01(n: number, salt: number): number {
  const x = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Generar histórico simulado (últimas 24 horas)
export function generateHistoricalData(): Array<{ timestamp: number; aqi: number; pm25: number }> {
  const now = Date.now();
  const data = [];
  
  for (let i = 24; i >= 0; i--) {
    const timestamp = now - i * 60 * 60 * 1000; // hourly
    const hour = new Date(timestamp).getHours();
    
    // Patrón realista
    const rushHourFactor = hour >= 7 && hour <= 9 ? 1.4 :
                           hour >= 17 && hour <= 20 ? 1.5 :
                           hour >= 10 && hour <= 16 ? 1.1 :
                           hour >= 0 && hour <= 5 ? 0.6 : 1.0;
    
    // Variación por día de semana (sábado/domingo mejor tráfico)
    const dayOfWeek = new Date(timestamp).getDay();
    const weekendFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 0.7 : 1.0;
    
    const basePM25 = 28;
    const dt = new Date(timestamp);
    const seed = dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate();
    const pm25 = basePM25 * rushHourFactor * weekendFactor * (0.9 + pseudo01(i, seed) * 0.2);
    
    // Convertir PM25 a AQI
    const aqi = pm25ToAqi(pm25);
    
    data.push({ timestamp, aqi, pm25 });
  }
  
  return data;
}

// Predicción para próximas 48 horas
export function predictAQI(historicalData: Array<{ timestamp: number; aqi: number }>): Prediction[] {
  const now = Date.now();
  const predictions: Prediction[] = [];
  
  // Calcular tendencia reciente (últimas 6 horas)
  const recentData = historicalData.slice(-6);
  const trendSlope = calculateTrendSlope(recentData);
  
  // Calcular desviación estándar para intervalos de confianza
  const mean = recentData.reduce((s, d) => s + d.aqi, 0) / recentData.length;
  const stdDev = Math.sqrt(
    recentData.reduce((s, d) => s + Math.pow(d.aqi - mean, 2), 0) / recentData.length
  );
  
  for (let i = 1; i <= 48; i++) {
    const timestamp = now + i * 60 * 60 * 1000;
    const hour = new Date(timestamp).getHours();
    
    // Patrón horario esperado
    const expectedPattern = hour >= 7 && hour <= 9 ? 1.3 :
                          hour >= 17 && hour <= 20 ? 1.4 :
                          hour >= 10 && hour <= 16 ? 1.1 :
                          hour >= 0 && hour <= 5 ? 0.6 : 1.0;
    
    // Predicción: tendencia + patrón + ruido determinista (estable entre aperturas)
    const lastAqi = historicalData[historicalData.length - 1]?.aqi || mean;
    const trendAdjustment = trendSlope * i * 0.3;
    const patternAdjustment = (expectedPattern - 1) * 20;
    const noise = (pseudo01(i, Math.round(lastAqi)) - 0.5) * stdDev * 2;
    
    const predictedAqi = Math.max(0, Math.min(500, lastAqi + trendAdjustment + patternAdjustment + noise));
    
    // Intervalo de confianza aumenta con el tiempo
    const confidence = Math.max(0.5, 1 - i * 0.01);
    const confidenceRange = stdDev * 1.96 * (1 + i * 0.02);
    
    predictions.push({
      timestamp,
      hour,
      aqi: Math.round(predictedAqi),
      aqiMin: Math.round(Math.max(0, predictedAqi - confidenceRange)),
      aqiMax: Math.round(Math.min(500, predictedAqi + confidenceRange)),
      confidence: Math.round(confidence * 100) / 100,
      trend: trendSlope > 2 ? 'worsening' : trendSlope < -2 ? 'improving' : 'stable',
    });
  }
  
  return predictions;
}

// Predicción por días (7 días)
export function predictWeekly(
  historicalData: Array<{ timestamp: number; aqi: number }>
): ForecastDay[] {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const now = new Date();
  const forecast: ForecastDay[] = [];
  
  // Calcular promedios históricos por hora
  const avgByHour = new Array(24).fill(0).map(() => ({ sum: 0, count: 0 }));
  historicalData.forEach(d => {
    const hour = new Date(d.timestamp).getHours();
    avgByHour[hour].sum += d.aqi;
    avgByHour[hour].count++;
  });
  const hourAvg = avgByHour.map(h => h.count > 0 ? h.sum / h.count : 50);
  
  // Calcular tendencia semanal
  const recentAvg = historicalData.slice(-24).reduce((s, d) => s + d.aqi, 0) / Math.min(historicalData.length, 24);
  const olderAvg = historicalData.slice(-72, -24).reduce((s, d) => s + d.aqi, 0) / Math.min(historicalData.length, 48);
  const weeklyTrend = recentAvg - olderAvg;
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dayFactor = isWeekend ? 0.75 : 1.0;
    
    // Promedio del día (usando horas del día)
    const dayHours = hourAvg.slice(6, 23); // 6 AM - 11 PM
    const avgAqi = (dayHours.reduce((s, h) => s + h, 0) / dayHours.length) * dayFactor;
    
    // Ajustar por tendencia semanal
    const trendAdjustment = weeklyTrend * (i + 1) * 0.2;
    const adjustedAvg = avgAqi + trendAdjustment;
    
    forecast.push({
      date: date.toISOString().split('T')[0],
      dayName: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : days[dayOfWeek],
      avgAqi: Math.round(adjustedAvg),
      maxAqi: Math.round(adjustedAvg * 1.3),
      minAqi: Math.round(adjustedAvg * 0.7),
      trend: weeklyTrend > 5 ? 'worsening' : weeklyTrend < -5 ? 'improving' : 'stable',
      recommendation: getRecommendation(adjustedAvg),
    });
  }
  
  return forecast;
}

// Utilidades
function pm25ToAqi(pm25: number): number {
  const breakpoints = [
    { low: 0, high: 12, aqiLow: 0, aqiHigh: 50 },
    { low: 12.1, high: 35.4, aqiLow: 51, aqiHigh: 100 },
    { low: 35.5, high: 55.4, aqiLow: 101, aqiHigh: 150 },
    { low: 55.5, high: 150.4, aqiLow: 151, aqiHigh: 200 },
    { low: 150.5, high: 250.4, aqiLow: 201, aqiHigh: 300 },
    { low: 250.5, high: 500, aqiLow: 301, aqiHigh: 500 },
  ];
  
  for (const bp of breakpoints) {
    if (pm25 >= bp.low && pm25 <= bp.high) {
      return ((bp.aqiHigh - bp.aqiLow) / (bp.high - bp.low)) * (pm25 - bp.low) + bp.aqiLow;
    }
  }
  return pm25 > 500 ? 500 : 0;
}

function calculateTrendSlope(data: Array<{ timestamp: number; aqi: number }>): number {
  if (data.length < 2) return 0;
  
  const n = data.length;
  const xMean = data.reduce((s, d) => s + d.timestamp, 0) / n;
  const yMean = data.reduce((s, d) => s + d.aqi, 0) / n;
  
  let numerator = 0;
  let denominator = 0;
  
  data.forEach(d => {
    numerator += (d.timestamp - xMean) * (d.aqi - yMean);
    denominator += Math.pow(d.timestamp - xMean, 2);
  });
  
  return denominator !== 0 ? numerator / denominator : 0;
}

function getRecommendation(avgAqi: number): string {
  if (avgAqi <= 50) return 'Aire limpio. Actividades al aire libre sin restricciones.';
  if (avgAqi <= 100) return 'Calidad aceptable. Personas sensibles limite exposición prolongada.';
  if (avgAqi <= 150) return 'Grupos sensibles deben permanecer en interiores. Otros con precaución.';
  if (avgAqi <= 200) return 'Evitar actividades al aire libre. Usar máscara N95 si es necesario salir.';
  return 'Permanecer en interiores. Purificador de aire recomendado. Consultar médico si hay síntomas.';
}
