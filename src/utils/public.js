import dayjs from 'dayjs'

/**
 * 格式化日期时间
 * @param {string|number|Date} date 日期时间
 * @param {string} format 格式化模板
 * @returns {string} 格式化后的日期字符串
 */
export function formatDateTime(date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!date) return ''
  return dayjs(date).format(format)
}

/**
 * 格式化日期
 * @param {string|number|Date} date 日期
 * @returns {string} 格式化后的日期字符串，格式为 YYYY-MM-DD
 */
export function formatDate(date) {
  return formatDateTime(date, 'YYYY-MM-DD')
}

/**
 * 格式化时间
 * @param {string|number|Date} time 时间
 * @returns {string} 格式化后的时间字符串，格式为 HH:mm:ss
 */
export function formatTime(time) {
  return formatDateTime(time, 'HH:mm:ss')
}

/**
 * K线时间格式化
 * @param {number} timestamp 时间戳
 * @param {string} resolution 时间周期
 * @returns {string} 格式化后的K线时间字符串
 */
export function formatKlineTime(timestamp, resolution) {
  if (!timestamp) return ''
  
  const date = new Date(timestamp)
  
  // 根据不同的时间周期使用不同的格式
  switch (resolution) {
    case '1':
    case '5':
    case '15':
    case '30':
      // 分钟级别显示 MM-DD HH:mm
      return dayjs(date).format('MM-DD HH:mm')
    case '60':
      // 小时级别显示 MM-DD HH:mm
      return dayjs(date).format('MM-DD HH:mm')
    case '240':
      // 4小时级别显示 MM-DD HH:mm
      return dayjs(date).format('MM-DD HH:mm')
    case '1D':
      // 日线显示 YYYY-MM-DD
      return dayjs(date).format('YYYY-MM-DD')
    case '1W':
      // 周线显示 YYYY-MM-DD
      return dayjs(date).format('YYYY-MM-DD')
    case '1M':
      // 月线显示 YYYY-MM
      return dayjs(date).format('YYYY-MM')
    default:
      return dayjs(date).format('MM-DD HH:mm')
  }
}

/**
 * 格式化大数字，超过一定长度使用科学计数法
 * @param {number|string} num 数字
 * @param {number} precision 精度
 * @returns {string} 格式化后的数字字符串
 */
export function formatLargeNumber(num, precision = 8) {
  if (num === undefined || num === null || num === '') return '0'
  
  const number = parseFloat(num)
  if (isNaN(number)) return '0'
  
  if (Math.abs(number) < 0.000001 && number !== 0) {
    return number.toExponential(precision)
  }
  
  return number.toFixed(precision).replace(/\.?0+$/, '')
}

/**
 * 格式化价格显示
 * @param {number|string} price 价格
 * @param {number} digits 小数位数
 * @returns {string} 格式化后的价格字符串
 */
export function formatPrice(price, digits = 2) {
  if (price === undefined || price === null || price === '') return '0'
  
  const number = parseFloat(price)
  if (isNaN(number)) return '0'
  
  return number.toFixed(digits)
}

/**
 * 计算两个日期之间的差值
 * @param {string|Date} date1 日期1
 * @param {string|Date} date2 日期2
 * @param {string} unit 单位，支持 'seconds'|'minutes'|'hours'|'days'|'months'|'years'
 * @returns {number} 差值
 */
export function dateDiff(date1, date2, unit = 'days') {
  const d1 = dayjs(date1)
  const d2 = dayjs(date2)
  return d2.diff(d1, unit)
}

/**
 * 获取星期几
 * @param {string|Date} date 日期
 * @returns {number} 星期几，0-6 表示周日到周六
 */
export function getDayOfWeek(date) {
  return dayjs(date).day()
}

/**
 * 判断是否为移动设备
 * @returns {boolean} 是否为移动设备
 */
export function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

/**
 * 获取浏览器语言
 * @returns {string} 浏览器语言
 */
export function getBrowserLanguage() {
  return (navigator.language || navigator.browserLanguage).toLowerCase()
}

/**
 * 深拷贝对象
 * @param {Object} obj 要拷贝的对象
 * @returns {Object} 拷贝后的对象
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  
  if (obj instanceof Date) return new Date(obj)
  if (obj instanceof RegExp) return new RegExp(obj)
  
  const clone = Array.isArray(obj) ? [] : {}
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clone[key] = deepClone(obj[key])
    }
  }
  
  return clone
}