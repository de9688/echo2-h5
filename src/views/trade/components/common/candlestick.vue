<template>
  <div class="candlestick-container" ref="chartContainer">
    <div class="chart-wrapper" v-show="!isLoading">
      <div id="tv_chart_container" ref="tvChartRef"></div>
    </div>
    <div v-if="isLoading" class="loading-overlay">
      <van-loading type="spinner" color="#7986CB" size="24px" />
      <span class="loading-text">{{ $t('common.loading') }}</span>
    </div>
    <div v-if="showError" class="error-overlay">
      <span class="error-text">{{ errorMessage }}</span>
      <van-button size="small" type="primary" @click="initChart">{{ $t('common.retry') }}</van-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useTradeStore } from '@/store/trade'
import { useLangStore } from '@/store/lang'
import { fetchKlineHistory } from '@/api/market'
import { formatDate } from '@/utils/public'
import { debounce } from 'lodash'

const props = defineProps({
  symbol: {
    type: String,
    default: ''
  },
  currentKlineKey: {
    type: String,
    default: ''
  }
})

const chartContainer = ref(null)
const tvChartRef = ref(null)
const isLoading = ref(true)
const showError = ref(false)
const errorMessage = ref('')
const tradeStore = useTradeStore()
const langStore = useLangStore()

let tvWidget = null
let chart = null
let candleSeries = null
let volumeSeries = null
let resizeObserver = null
let lastResize = Date.now()
let klineInterval = null
let lastUpdateTime = 0
let isLightweightMode = false

const checkTradingViewLoaded = () => {
  if (window.TradingView) {
    return true
  } else if (window.LightweightCharts) {
    isLightweightMode = true
    return true
  }
  return false
}

const createLightweightChart = () => {
  if (!window.LightweightCharts) {
    displayErrorMessage('轻量级图表库未加载')
    return false
  }

  try {
    isLoading.value = true
    showError.value = false
    
    const { LightweightCharts } = window
    const chartOptions = {
      layout: {
        background: { color: '#151924' },
        textColor: '#D9D9D9',
      },
      grid: {
        vertLines: { color: '#1E2230' },
        horzLines: { color: '#1E2230' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: {
          width: 1,
          color: '#4B5563',
          style: LightweightCharts.LineStyle.Dashed,
        },
        horzLine: {
          width: 1,
          color: '#4B5563',
          style: LightweightCharts.LineStyle.Dashed,
        },
      },
      timeScale: {
        borderColor: '#1E2230',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#1E2230',
      },
      handleScroll: true,
      handleScale: true,
    }
    
    if (chart) {
      chart.remove()
      chart = null
    }
    
    chart = LightweightCharts.createChart(tvChartRef.value, chartOptions)
    
    candleSeries = chart.addCandlestickSeries({
      upColor: '#26A69A',
      downColor: '#EF5350',
      borderUpColor: '#26A69A',
      borderDownColor: '#EF5350',
      wickUpColor: '#26A69A',
      wickDownColor: '#EF5350',
    })
    
    volumeSeries = chart.addHistogramSeries({
      color: '#26A69A',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    })
    
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8, 
        bottom: 0,
      },
    })
    
    // 设置图表尺寸
    const handleResize = () => {
      if (!chartContainer.value) return
      const width = chartContainer.value.clientWidth
      const height = chartContainer.value.clientHeight
      chart.resize(width, height)
    }
    
    // 初始化大小
    handleResize()
    
    // 添加窗口大小变化监听
    if (resizeObserver) {
      resizeObserver.disconnect()
    }
    
    resizeObserver = new ResizeObserver(debounce(handleResize, 200))
    resizeObserver.observe(chartContainer.value)
    
    // 加载历史K线
    loadKlineData()
    
    isLoading.value = false
    return true
  } catch (error) {
    console.error('创建轻量级图表失败:', error)
    displayErrorMessage('创建图表失败，请重试')
    return false
  }
}

const displayErrorMessage = (message) => {
  isLoading.value = false
  showError.value = true
  errorMessage.value = message || '加载图表失败，请重试'
}

const initChart = async () => {
  isLoading.value = true
  showError.value = false
  
  try {
    await nextTick()
    
    // 确保DOM元素已加载
    if (!tvChartRef.value || !chartContainer.value) {
      setTimeout(initChart, 300)
      return
    }
    
    // 检查TradingView或LightweightCharts是否加载
    if (!checkTradingViewLoaded()) {
      // 尝试加载轻量级图表
      const script = document.createElement('script')
      script.src = 'https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js'
      script.onload = () => {
        isLightweightMode = true
        createLightweightChart()
      }
      script.onerror = () => {
        displayErrorMessage('图表库加载失败')
      }
      document.head.appendChild(script)
      return
    }
    
    // 根据可用的图表库选择初始化方法
    if (isLightweightMode) {
      createLightweightChart()
    } else {
      initTradingViewWidget()
    }
    
    // 启动K线轮询更新
    startKlinePolling()
    
  } catch (err) {
    console.error('初始化图表失败:', err)
    displayErrorMessage()
  }
}

const initTradingViewWidget = () => {
  if (tvWidget) {
    tvWidget.remove()
    tvWidget = null
  }
  
  const widgetOptions = {
    symbol: props.symbol,
    interval: getTimeFrameValue(),
    container: tvChartRef.value,
    library_path: '/charting_library/',
    locale: langStore.locale === 'zh-CN' ? 'zh' : 'en',
    datafeed: {
      onReady: (callback) => {
        callback({
          supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'],
          supports_time: true,
          supports_marks: false,
          supports_timescale_marks: false,
        })
      },
      resolveSymbol: (symbolName, onSymbolResolvedCallback) => {
        onSymbolResolvedCallback({
          name: symbolName,
          ticker: symbolName,
          description: symbolName,
          type: 'crypto',
          session: '24x7',
          timezone: 'Etc/UTC',
          exchange: '',
          minmov: 1,
          pricescale: 100000,
          has_intraday: true,
          intraday_multipliers: ['1', '5', '15', '30', '60', '240'],
          has_daily: true,
          has_weekly_and_monthly: true,
          supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'],
          volume_precision: 8,
          data_status: 'streaming',
        })
      },
      getBars: async (symbolInfo, resolution, from, to, onHistoryCallback) => {
        try {
          const klines = await fetchKlineHistory({
            symbol: props.symbol,
            interval: resolution,
            from: from * 1000,
            to: to * 1000,
            limit: 1000
          })
          
          if (klines && klines.length > 0) {
            const bars = klines.map(kline => ({
              time: kline[0],
              open: parseFloat(kline[1]),
              high: parseFloat(kline[2]),
              low: parseFloat(kline[3]),
              close: parseFloat(kline[4]),
              volume: parseFloat(kline[5])
            }))
            onHistoryCallback(bars, { noData: false })
          } else {
            onHistoryCallback([], { noData: true })
          }
        } catch (error) {
          console.error('获取K线数据失败:', error)
          onHistoryCallback([], { noData: true })
        }
      },
      subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscribeUID) => {
        // 在轮询机制中处理实时数据
      },
      unsubscribeBars: () => {
        // 清理订阅
      }
    },
    fullscreen: false,
    autosize: true,
    theme: 'Dark',
  }
  
  tvWidget = new window.TradingView.widget(widgetOptions)
  tvWidget.onChartReady(() => {
    isLoading.value = false
  })
}

const loadKlineData = async () => {
  if (!props.symbol || !candleSeries) return
  
  try {
    const interval = getTimeFrameValue()
    const endTime = Date.now()
    const startTime = endTime - 30 * 24 * 60 * 60 * 1000 // 30天数据
    
    const klines = await fetchKlineHistory({
      symbol: props.symbol,
      interval: interval,
      from: startTime,
      to: endTime,
      limit: 1000
    })
    
    if (klines && klines.length > 0) {
      const candleData = klines.map(kline => ({
        time: kline[0] / 1000,
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5])
      }))
      
      const volumeData = klines.map(kline => ({
        time: kline[0] / 1000,
        value: parseFloat(kline[5]),
        color: parseFloat(kline[4]) >= parseFloat(kline[1]) ? '#26A69A' : '#EF5350'
      }))
      
      candleSeries.setData(candleData)
      volumeSeries.setData(volumeData)
      
      // 记录最后更新时间
      if (candleData.length > 0) {
        lastUpdateTime = candleData[candleData.length - 1].time * 1000
      }
    }
  } catch (error) {
    console.error('加载K线数据失败:', error)
  }
}

const updateKlineData = async () => {
  if (!props.symbol || !candleSeries || !isLightweightMode) return
  
  try {
    const interval = getTimeFrameValue()
    const endTime = Date.now()
    const startTime = lastUpdateTime ? lastUpdateTime : endTime - 24 * 60 * 60 * 1000
    
    const klines = await fetchKlineHistory({
      symbol: props.symbol,
      interval: interval,
      from: startTime,
      to: endTime,
      limit: 100
    })
    
    if (klines && klines.length > 0) {
      for (const kline of klines) {
        const time = kline[0] / 1000
        const open = parseFloat(kline[1])
        const high = parseFloat(kline[2])
        const low = parseFloat(kline[3])
        const close = parseFloat(kline[4])
        const volume = parseFloat(kline[5])
        
        candleSeries.update({
          time: time,
          open: open,
          high: high,
          low: low,
          close: close
        })
        
        volumeSeries.update({
          time: time,
          value: volume,
          color: close >= open ? '#26A69A' : '#EF5350'
        })
      }
      
      // 更新最后更新时间
      const lastKline = klines[klines.length - 1]
      lastUpdateTime = lastKline[0]
    }
    
    // 更新当前价格
    if (tradeStore.klineTicker) {
      const currentPrice = parseFloat(tradeStore.klineTicker.close)
      candleSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      })
    }
  } catch (error) {
    console.error('更新K线数据失败:', error)
  }
}

const startKlinePolling = () => {
  if (klineInterval) {
    clearInterval(klineInterval)
  }
  
  // 初始加载
  if (isLightweightMode) {
    loadKlineData()
  }
  
  // 定时更新
  klineInterval = setInterval(() => {
    if (isLightweightMode) {
      updateKlineData()
    }
  }, 10000) // 10秒更新一次
}

const getTimeFrameValue = () => {
  const mapping = {
    '1m': '1',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '4h': '240',
    '1d': '1D',
    '1w': '1W',
    '1M': '1M'
  }
  return mapping[props.currentKlineKey] || '15'
}

// 监听交易对变化
watch(() => props.symbol, () => {
  initChart()
}, { immediate: false })

// 监听K线周期变化
watch(() => props.currentKlineKey, () => {
  initChart()
}, { immediate: false })

onMounted(() => {
  initChart()
})

onBeforeUnmount(() => {
  if (klineInterval) {
    clearInterval(klineInterval)
  }
  
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  
  if (chart) {
    chart.remove()
    chart = null
  }
  
  if (tvWidget) {
    tvWidget.remove()
    tvWidget = null
  }
})
</script>

<style scoped>
.candlestick-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: #151924;
}

.chart-wrapper {
  width: 100%;
  height: 100%;
}

#tv_chart_container {
  height: 100%;
  width: 100%;
}

.loading-overlay, .error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: rgba(21, 25, 36, 0.9);
  z-index: 10;
}

.loading-text, .error-text {
  margin-top: 10px;
  font-size: 14px;
  color: #D9D9D9;
}

.error-text {
  margin-bottom: 10px;
}
</style>