<script setup>
import { DIFF_ISFREEZE } from '@/config/index'
import { useMainStore } from '@/store/index.js'
import { useUserStore } from '@/store/user/index.js'
import { socketDict } from '@/config/dict'
import Loading from '@/components/common/Loading/index.vue'
import ActivityPopup from '@/components/Defi/ActivityPopup.vue'
import { getShowDefiActivityNoticeApi } from './api/defi'
import ServicePopup from '@/components/CustomerService/ServicePopup.vue'
// import FreezePopup from '@/components/Freeze/FreezePopup.vue'
import { useToast } from './hook/useToast'
import { _t18, _toView } from '@/utils/public'
import { useRouter } from 'vue-router'
import { initWebSocket } from '@/plugin/socket'
import { showDialog } from 'vant'
import PubSub from 'pubsub-js'

// import { useFreeze } from '@/hook/useFreeze'

// const isFreeze = useFreeze()
// console.log('isFreeze', isFreeze)
const router = useRouter()

/**
 * 客服弹窗
 */
const showServicePopup = ref(false)

/**
 * defi 空投弹窗
 */
const showDefiActivityPopup = ref(false)

/**
 * 活动详情
 */
const activityInfo = ref({})

/**
 * 申购订阅Key
 */
const ownCoinKey = ref('')

/**
 * 申购通知
 */
const ownCoinKeyNotification = () => {
  ownCoinKey.value = PubSub.subscribe(socketDict.OWNCOIN, (key, data) => {
    showDialog({
      title: data.amountLimit, // 额度
      message: data.msg
    }).then(() => {
      // 点击确认进入认购页
    })
  })
}
ownCoinKeyNotification()

/**
 * 用户状态改变Key
 */
const userStatusKey = ref('')
/**
 * 用户状态改变通知
 */
const userStatusNotification = () => {
  userStatusKey.value = PubSub.subscribe(socketDict.USER_STATUS, (key, data) => {
    userStore.token && userStore.getUserInfo()
  })
}
userStatusNotification()

/**
 * 获取活动通知
 */
const getShowDefiActivityNotice = async () => {
  const res = await getShowDefiActivityNoticeApi(userStore.userInfo.user.userId)
  if (res.code == 200 && res.data.length) {
    res.data = res.data[0]
    res.data.days = Math.ceil((res.data.endTimeS - res.data.beginTimeS) / (24 * 60 * 60 * 1000))
    activityInfo.value = res.data
    showDefiActivityPopup.value = true
  }
}
const userStore = useUserStore()
const mainStroe = useMainStore()
const isLoading = ref(false)
const currentRoute = computed(() => useRoute())
const tabbarPathNameList = computed(() =>
  mainStroe.getTabbarList
    .filter((elt) => {
      return elt.isOpen === true
    })
    .map((elem) => {
      return elem.key.charAt(0).toUpperCase() + elem.key.slice(1)
    })
)

const { _toast } = useToast()
/**
 * 多语言 监听回调事件
 */
const event_toastChange = (e) => {
  let name = e.detail.name
  let platform = e.detail.platform || []
  name && _toast(name, platform)
}

/**
 * 冻结弹窗 isFreeze= '2'
 */
const showIsFreezePopup = ref(false)

/**
 * 用户信息改变监听回调事件
 */
const event_userInfoChange = (e) => {
  // defi 活动通知
  getShowDefiActivityNotice()
  // 检测是否冻结
  if (!DIFF_ISFREEZE.includes(__config._APP_ENV)) {
    showIsFreezePopup.value = e.detail.user.status == 1
  }

  // 消息通知订阅
  initWebSocket(e.detail?.user.userId)
}

// 冻结弹窗
const event_freezePopup = () => {
  showIsFreezePopup.value = true
}

/**
 * 确认冻结弹窗
 */
const confirmFreezeDialog = () => {
  if (['rxce'].includes(__config._APP_ENV)) {
    // rxce冻结账户:联系客服，退出登录
    event_serviceChange()
    userStore.signOut()
    setTimeout(() => location.reload(), 10)
  } else if (DIFF_ISFREEZE.includes(__config._APP_ENV)) {
    event_serviceChange()
  } else {
    // 冻结账户:联系客服，退出登录,返回登录页
    showIsFreezePopup.value = false
    _toView('/sign-in')
    userStore.signOut()
    setTimeout(() => location.reload(), 10)
  }
}
/**
 * 客服点击监听
 */
const event_serviceChange = () => {
  // console.log('客服')
  if (mainStroe.getCustomerServiceList.length) {
    if (mainStroe.getCustomerServiceList.length == 1) {
      // 自定义客服事件
      if (mainStroe.getCustomerServiceList[0]?.callback) {
        mainStroe.getCustomerServiceList[0].callback()
      } else {
        let href = mainStroe.getCustomerServiceList[0]?.url
        if (['gmmoin', 'coinsexpto', 'paxpay', 'dev', 'bitbyex','robinhood2'].includes(__config._APP_ENV)) {
          location.href = href
        } else if (mainStroe.getCustomerServiceList[0]?.getUrl) {
          href = mainStroe.getCustomerServiceList[0].getUrl()
          // router.push(`/service?url=${encodeURIComponent(href)}`)
          location.href = href
        } else {
          // router.push(`/service?url=${encodeURIComponent(href)}`)
          location.href = href
        }
      }
    } else {
      showServicePopup.value = true
    }
  }
}
onMounted(() => {
  userStore.token && userStore.getUserInfo()

  document.addEventListener('event_toastChange', event_toastChange)
  document.addEventListener('event_serviceChange', event_serviceChange)
  document.addEventListener('event_userInfoChange', event_userInfoChange)
  document.addEventListener('event_freezePopup', event_freezePopup)
})
onUnmounted(() => {
  document.removeEventListener('event_toastChange', event_toastChange)
  document.removeEventListener('event_serviceChange', event_serviceChange)
  document.removeEventListener('event_freezePopup', event_freezePopup)

  ownCoinKey && PubSub.unsubscribe(ownCoinKey)
  userStatusKey && PubSub.unsubscribe(userStatusKey)
})
</script>

<template>
  <div>
    <loading v-if="isLoading" :loading="isLoading"></loading>
    <router-view v-slot="{ Component, route }">
      <transition name="fade">
        <div :key="route.name">
          <keep-alive :include="[...tabbarPathNameList]">
            <component :is="Component" :key="route.path"></component>
          </keep-alive>
        </div>
      </transition>
    </router-view>
  </div>
  <Tabbar v-if="tabbarPathNameList.includes(currentRoute.name)"></Tabbar>
  <!-- 幸运活动 -->
  <ActivityPopup v-model:value="showDefiActivityPopup" :data="activityInfo"></ActivityPopup>
  <!-- 客服弹窗 -->
  <ServicePopup
    v-model:value="showServicePopup"
    :data="mainStroe.getCustomerServiceList"
  ></ServicePopup>
  <!-- 冻结弹窗 -->
  <van-dialog
    v-model:show="showIsFreezePopup"
    :title="_t18('notify')"
    :message="_t18('account_frozen')"
    theme="round-button"
    confirmButtonColor="#17ac74"
    :confirmButtonText="_t18('btnConfirm')"
    @confirm="confirmFreezeDialog"
  >
  </van-dialog>
</template>

<style lang="scss">
// .fade-enter-active {
//   animation: fadeIn 0.1s ease-in;
// }

// .fade-leave-active {
//   animation: fadeOut 0.01s ease-in;
// }
/*
.fade-enter {
  animation: fadeIn 0.3s ease-in;
}

.fade-leave-to {
  animation: fadeOut 0.3s ease-out;
} */

/* 绿涨 */
.up-tag {
  color: #17ac74;
}
/* 红跌 */
.down-tag {
  color: #fa4a4a;
}
/* 灰持平 */
.normal-tag {
  color: #a4a8b1;
}
.van-tabbar {
  height: calc(var(--van-tabbar-height) + env(safe-area-inset-bottom));
  background-color: #fff;
  .van-tabbar-item {
    height: calc(var(--van-tabbar-height));
    .van-tabbar-item__text {
      font-size: 10px;
      transition: none;
    }
    &.van-tabbar-item--active {
      color: var(--theme-color);
    }
  }
}
</style>