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
  console.log('【K线排查】初始化轻量级图表')
  
  if (!window.LightweightCharts) {
    console.log('【K线排查】轻量级图表库状态:', typeof window.LightweightCharts)
    displayErrorMessage('轻量级图表库未加载')
    return false
  }

  try {
    isLoading.value = true
    showError.value = false
    
    // 检查并记录库的结构，帮助调试
    console.log('【K线排查】LightweightCharts对象:', Object.keys(window.LightweightCharts))
    
    // 正确创建图表
    const { createChart } = window.LightweightCharts
    
    if (!createChart) {
      // 尝试不同的引用方式
      if (typeof window.LightweightCharts === 'function') {
        console.log('【K线排查】尝试直接使用LightweightCharts作为构造函数')
        chart = new window.LightweightCharts(tvChartRef.value, {
          layout: {
            background: { color: '#151924' },
            textColor: '#D9D9D9',
          },
          grid: {
            vertLines: { color: '#1E2230' },
            horzLines: { color: '#1E2230' },
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
        })
      } else if (window.LightweightCharts.createChartEx) {
        console.log('【K线排查】尝试使用createChartEx方法')
        chart = window.LightweightCharts.createChartEx(tvChartRef.value, {
          layout: {
            background: { color: '#151924' },
            textColor: '#D9D9D9',
          },
          grid: {
            vertLines: { color: '#1E2230' },
            horzLines: { color: '#1E2230' },
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
        })
      } else {
        console.error('【K线排查】找不到createChart方法')
        throw new Error('图表库API不兼容')
      }
    } else {
      // 标准方式创建图表
      const chartOptions = {
        layout: {
          background: { color: '#151924' },
          textColor: '#D9D9D9',
        },
        grid: {
          vertLines: { color: '#1E2230' },
          horzLines: { color: '#1E2230' },
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
      
      chart = createChart(tvChartRef.value, chartOptions)
    }
    
    // 检查图表对象方法
    console.log('【K线排查】chart对象方法:', Object.keys(chart))
    
    // 尝试添加蜡烛图系列
    try {
      if (typeof chart.addCandlestickSeries === 'function') {
        candleSeries = chart.addCandlestickSeries({
          upColor: '#26A69A',
          downColor: '#EF5350',
          borderUpColor: '#26A69A',
          borderDownColor: '#EF5350',
          wickUpColor: '#26A69A',
          wickDownColor: '#EF5350',
        })
      } else if (typeof chart.addSeries === 'function') {
        // 尝试替代API
        console.log('【K线排查】使用替代API: addSeries')
        candleSeries = chart.addSeries('candlestick', {
          upColor: '#26A69A',
          downColor: '#EF5350',
          borderUpColor: '#26A69A',
          borderDownColor: '#EF5350',
          wickUpColor: '#26A69A',
          wickDownColor: '#EF5350',
        })
      } else {
        // 最后尝试直接使用版本3的API
        console.log('【K线排查】尝试加载v3版本的API')
        // 尝试重新加载v3版本库
        const script = document.createElement('script')
        script.src = 'https://unpkg.com/lightweight-charts@3.8.0/dist/lightweight-charts.standalone.production.js'
        script.onload = () => {
          // 重新初始化
          setTimeout(() => initChart(), 100)
        }
        document.head.appendChild(script)
        throw new Error('正在尝试加载兼容版本')
      }
      
      console.log('【K线排查】蜡烛图系列创建成功')
      
      // 添加成交量图
      try {
        if (typeof chart.addHistogramSeries === 'function') {
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
          
          if (typeof chart.priceScale === 'function') {
            chart.priceScale('volume').applyOptions({
              scaleMargins: {
                top: 0.8, 
                bottom: 0,
              },
            })
          }
        }
        console.log('【K线排查】成交量图创建成功')
      } catch (volumeError) {
        console.error('【K线排查】成交量图创建失败:', volumeError)
        // 继续执行，只是没有成交量图
      }
    } catch (seriesError) {
      console.error('【K线排查】创建图表系列失败:', seriesError)
      throw seriesError
    }
    
    // 设置图表尺寸
    const handleResize = () => {
      if (!chartContainer.value || !chart) return
      try {
        const width = chartContainer.value.clientWidth
        const height = chartContainer.value.clientHeight
        if (typeof chart.resize === 'function') {
          chart.resize(width, height)
        } else if (typeof chart.autoSizeActive === 'function') {
          chart.autoSizeActive(true)
        }
      } catch (resizeError) {
        console.error('【K线排查】调整图表大小失败:', resizeError)
      }
    }
    
    // 初始化大小
    handleResize()
    
    // 添加窗口大小变化监听
    if (resizeObserver) {
      resizeObserver.disconnect()
    }
    
    resizeObserver = new ResizeObserver(debounce(handleResize, 200))
    resizeObserver.observe(chartContainer.value)
    
    // 只有当蜡烛图系列创建成功才加载数据
    if (candleSeries) {
      // 加载历史K线
      loadKlineData()
    }
    
    isLoading.value = false
    return true
  } catch (error) {
    console.error('【K线排查】创建轻量级图表失败:', error)
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
      // 使用特定的3.8.0版本，该版本API更稳定
      script.src = 'https://unpkg.com/lightweight-charts@3.8.0/dist/lightweight-charts.standalone.production.js'
      script.onload = () => {
        console.log('【K线排查】轻量级图表库加载成功')
        isLightweightMode = true
        createLightweightChart()
      }
      script.onerror = () => {
        console.error('【K线排查】轻量级图表库加载失败')
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
    console.error('【K线排查】初始化图表失败:', err)
    displayErrorMessage('初始化图表失败')
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
          console.error('【K线排查】获取K线数据失败:', error)
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
  if (!props.symbol || !candleSeries) {
    console.log('【K线排查】无法加载K线数据，缺少必要条件', {
      hasSymbol: !!props.symbol,
      hasCandleSeries: !!candleSeries
    })
    return
  }
  
  try {
    const interval = getTimeFrameValue()
    const endTime = Date.now()
    const startTime = endTime - 30 * 24 * 60 * 60 * 1000 // 30天数据
    
    console.log('【K线排查】开始加载K线数据', {
      symbol: props.symbol,
      interval,
      startTime,
      endTime
    })
    
    const klines = await fetchKlineHistory({
      symbol: props.symbol,
      interval: interval,
      from: startTime,
      to: endTime,
      limit: 1000
    })
    
    console.log('【K线排查】K线数据加载结果', {
      success: !!klines,
      count: klines?.length || 0
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
      
      console.log('【K线排查】设置K线数据', { count: candleData.length })
      
      try {
        if (typeof candleSeries.setData === 'function') {
          candleSeries.setData(candleData)
        }
        
        if (volumeSeries && typeof volumeSeries.setData === 'function') {
          const volumeData = klines.map(kline => ({
            time: kline[0] / 1000,
            value: parseFloat(kline[5]),
            color: parseFloat(kline[4]) >= parseFloat(kline[1]) ? '#26A69A' : '#EF5350'
          }))
          volumeSeries.setData(volumeData)
        }
        
        console.log('【K线排查】K线数据设置成功')
      } catch (dataError) {
        console.error('【K线排查】设置K线数据失败', dataError)
      }
      
      // 记录最后更新时间
      if (candleData.length > 0) {
        lastUpdateTime = candleData[candleData.length - 1].time * 1000
      }
    }
  } catch (error) {
    console.error('【K线排查】加载K线数据失败:', error)
  }
}

const updateKlineData = async () => {
  if (!props.symbol || !candleSeries || !isLightweightMode) {
    console.log('【K线排查】无法更新K线数据，缺少必要条件')
    return
  }
  
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
      console.log('【K线排查】更新K线数据', { count: klines.length })
      
      for (const kline of klines) {
        const time = kline[0] / 1000
        const open = parseFloat(kline[1])
        const high = parseFloat(kline[2])
        const low = parseFloat(kline[3])
        const close = parseFloat(kline[4])
        const volume = parseFloat(kline[5])
        
        try {
          if (typeof candleSeries.update === 'function') {
            candleSeries.update({
              time: time,
              open: open,
              high: high,
              low: low,
              close: close
            })
          }
          
          if (volumeSeries && typeof volumeSeries.update === 'function') {
            volumeSeries.update({
              time: time,
              value: volume,
              color: close >= open ? '#26A69A' : '#EF5350'
            })
          }
        } catch (updateError) {
          console.error('【K线排查】更新单条K线数据失败', updateError)
        }
      }
      
      // 更新最后更新时间
      const lastKline = klines[klines.length - 1]
      lastUpdateTime = lastKline[0]
    }
    
    // 更新当前价格
    if (tradeStore.klineTicker && candleSeries) {
      try {
        const currentPrice = parseFloat(tradeStore.klineTicker.close)
        if (typeof candleSeries.priceScale === 'function' && 
            candleSeries.priceScale() && 
            typeof candleSeries.priceScale().applyOptions === 'function') {
          candleSeries.priceScale().applyOptions({
            scaleMargins: {
              top: 0.1,
              bottom: 0.2,
            },
          })
        }
      } catch (priceScaleError) {
        console.error('【K线排查】更新价格刻度失败', priceScaleError)
      }
    }
  } catch (error) {
    console.error('【K线排查】更新K线数据失败:', error)
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
    try {
      chart.remove()
    } catch (e) {
      console.error('【K线排查】销毁图表失败', e)
    }
    chart = null
  }
  
  if (tvWidget) {
    try {
      tvWidget.remove()
    } catch (e) {
      console.error('【K线排查】销毁TradingView失败', e)
    }
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