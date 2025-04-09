// 根据实际情况定义再生能源的标识，这里假设它的值为 'renew'
const YOUR_RENEW_ENERGY_TYPE = 'renew';

// 币种交易相关
import { defineStore } from 'pinia'
import { getCoinListApi, getMt5Amount } from '@/api/trade/index.js'
import { socketDict } from '@/config/dict'
import { _div, _sub, _mul, priceFormat, _toFixed } from '@/utils/decimal'
import { _coinWebSocket } from '@/plugin/socket/index'

export const useTradeStore = defineStore('trade', {
  state: () => {
    return {
      /**
       * 币种价格列表（所有）
       */
      allCoinPriceInfo: reactive({}),
      /**
       * 秒合约 币种列表
       */
      secondContractCoinList: reactive([]),
      /**
       * 币币 币种列表
       */
      spotCoinList: reactive([]),
      /**
       * U本位 币种列表
       */
      contractCoinList: reactive([]),
      /**
       * 当前币种
       */
      currentCoinList: [],
      /**
       * 24小时成交
       */
      klineTicker: reactive({})
    }
  },
  getters: {},
  actions: {
    setKlineTicker(klineTicker) {
      this.klineTicker = klineTicker
    },
    /**
     * 设置当前币种
     */
    setCurrentCoinList(val, type) {
      if (val) {
        if (type == 'remove') {
          this.currentCoinList = this.currentCoinList.filter((elem) => elem != val)
        } else if (!this.currentCoinList.includes(val)) {
          this.currentCoinList.push(val)
        }
      }
    },
    /**
     * 获取币种列表（所有）
     */
    async getCoinList() {
      try {
        // 添加日志
        console.log('开始获取币种列表...')
        
        const res = await getCoinListApi()
        console.log('币种列表接口返回:', res)
        
        // 检查返回数据
        if (!res || !res.data) {
          console.error('币种列表接口返回数据异常:', res)
          return
        }

        let keyMap = {
          coinList: 'secondContractCoinList',
          currencyList: 'spotCoinList', 
          contractList: 'contractCoinList'
        }

        let tempAllCoinPriceInfo = {}
        this.secondContractCoinList.splice(0, this.secondContractCoinList.length)

        // 遍历前检查 res.data 是否存在
        if(res.data) {
          for (const key in keyMap) {
            if (Object.hasOwnProperty.call(res.data, key)) {
              const tempList = res.data[key] || []
              
              tempList.forEach((elem) => {
                // 确保币种名称小写
                const coinSymbol = elem.coin.toLowerCase()

                // 修改图片路径：如果币种类型为"再生能源"，则从 coins/hq 目录读取
                let iconPath = ''
                if (elem.coinType === YOUR_RENEW_ENERGY_TYPE) {
                  // 新路径
                  iconPath = `${__config._STATIC_API}/echo2.0/images/coins/hq/${coinSymbol}.png`
                } else {
                  // 原来的路径
                  iconPath = `${__config._STATIC_API}/echo2.0/images/coins/${coinSymbol}.png`
                }
                elem.icon = iconPath
                elem.logo = iconPath
                
                console.log('Coin icon path:', elem.icon)
                
                elem.baseCoinUpperCase = elem.baseCoin.toLocaleUpperCase()
                elem.coinUpperCase = elem.coin.toLocaleUpperCase()
                // customizeFlag   1否 2是
                elem.symbolUpperCase =
                  elem.customizeFlag === 2 ? elem.showSymbol : elem.symbol.toLocaleUpperCase()
                if (elem.market != 'mt5') {
                  elem.coin = elem.coin.toLocaleLowerCase()
                }
                this[keyMap[key]].push(elem)
                let change = '0.00'
                try {
                  if (elem.amount > 0 && elem.open > 0) {
                    change = _toFixed(
                      Math.abs(_mul(_div(_sub(elem.amount, elem.open), elem.open), 100)),
                      2
                    )
                  }
                } catch (error) {}
                tempAllCoinPriceInfo[elem.coin] = {
                  close: priceFormat(elem.amount),
                  openPrice: priceFormat(elem.open),
                  change: change,
                  priceChangePercent: change
                  // volume24: '0.00',
                  // high24: '0.00',
                  // low24: '0.00'
                }
                // 国际黄金白银
                if (elem.coinType === 3) {
                  getMt5Amount(elem.coin).then((res) => {
                    if (res.code == '200') {
                      tempAllCoinPriceInfo[elem.coin]['volume2'] = res.data
                    }
                  })
                }
              })
            }
          }
        }

        Object.assign(this.allCoinPriceInfo, tempAllCoinPriceInfo)

        if (Object.keys(this.allCoinPriceInfo).length) {
          // 当存在币种进行 socket 订阅
          _coinWebSocket.send({
            op: socketDict.subscribe,
            type: socketDict.DETAIL
          })

          // 订阅事件
          this.token = PubSub.subscribe(socketDict.DETAIL, (key, data) => {
            // 处理接收到的数据
            let tempData = data.data.tick || data.data

            if (data.symbol === 'XAU') {
              data.symbol = 'xau'
            }
            // detail 数据
            let tempObj = {
              open: priceFormat(tempData.open),
              close: priceFormat(tempData.close),
              low: tempData.low,
              high: tempData.high,
              volume: tempData.vol
            }

            // if (this.currentCoinList.includes(data.symbol) && data.origin != 'kline') {
            //   console.log('detail', tempData, data)
            //   return
            // }

            if (this.allCoinPriceInfo[data.symbol]?.volume2) {
              tempObj.volume = this.allCoinPriceInfo[data.symbol]?.volume2
              tempObj.volume24 = this.allCoinPriceInfo[data.symbol]?.volume2
            }

            // 当天开盘价
            if (!data.origin && Number(tempObj.openPrice) <= 0) {
              tempObj.openPrice = tempObj.open
              this.allCoinPriceInfo[data.symbol].openPrice = tempObj.open
            }

            if (!['kline'].includes(data.origin)) {
              tempObj.openPrice = tempObj.open
              tempObj.volume24 = tempData.vol
              tempObj.high24 = tempData.high
              tempObj.low24 = tempData.low
            }

            if (tempObj.close > 0 && tempObj.open > 0) {
              if (tempObj.openPrice) {
                // 24小时change
                let priceChangePercent = _toFixed(
                  Math.abs(
                    _mul(_div(_sub(tempObj.close, tempObj.openPrice), tempObj.openPrice), 100)
                  ),
                  2
                )
                tempObj.priceChangePercent =
                  Math.abs(priceChangePercent) < 0.01 ? '0.01' : priceChangePercent
                // console.log('24小时change', data.symbol, tempObj.open, tempObj.priceChangePercent)
              }
              // 实时change
              let tempChange = _toFixed(
                Math.abs(_mul(_div(_sub(tempObj.close, tempObj.open), tempObj.open), 100)),
                2
              )
              tempObj.change = Math.abs(tempChange) < 0.01 ? '0.01' : tempChange
              if (this.allCoinPriceInfo[data.symbol]) {
                for (const key in tempObj) {
                  this.allCoinPriceInfo[data.symbol][key] = tempObj[key]
                }
              }
            }
          })
        }
      } catch (error) {
        console.error('获取币种列表失败:', error)
        // 返回空数据,避免阻塞其他流程
        return {
          code: 500,
          data: {
            coinList: [],
            currencyList: [],
            contractList: []
          }
        }
      }
    }
  }
})