<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet></ion-router-outlet>
      <ion-tab-bar slot="bottom">

        <ion-tab-button tab="tab1" href="/tabs/calendar" ref="calendarButtonRef" @click="calendarClicks.click">
          <ion-icon aria-hidden="true" :icon="calendar" />
          <ion-label>Kalender</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="tab2" href="/tabs/book" v-if="isDev || bookingEnabled">
          <ion-icon aria-hidden="true" :icon="accessibility" />
          <ion-label>Boka</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="tab3" href="/tabs/news">
          <ion-icon aria-hidden="true" :icon="newspaper" ref="newsButtonRef" />
          <ion-label>Nyheter</ion-label>
        </ion-tab-button>

      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import { IonTabBar, IonTabButton, IonTabs, IonLabel, IonIcon, IonPage, IonRouterOutlet } from '@ionic/vue';
import { calendar, newspaper, accessibility } from 'ionicons/icons';
import { onLongPress, useLocalStorage } from '@vueuse/core'
import { ref } from 'vue'
import { Toast } from '@capacitor/toast';
import { FCM } from '@capacitor-community/fcm';
import { useAppMode, useRapidClicks } from '@/compsables/common';

const { isDev } = useAppMode()

const showDeviceToken = () => {
  FCM.getToken().then(({ token }) => {
    console.log('Device:', { token })
    return `Device token: ${token}`
  }).then(text => Toast.show({ text }))
}

const bookingEnabled = useLocalStorage('bookingEnabled', false)

const enableBooking = () => {
  Toast.show({ text: 'Du kan nu boka', duration: 'short' })
  bookingEnabled.value = true
}

const calendarButtonRef = ref<HTMLElement | null>(null)
onLongPress(calendarButtonRef, enableBooking, { delay: 1000 })

// Fallback for devices where long-press doesn't register: 10 taps within 1 min
const calendarClicks = useRapidClicks(10, 60_000, enableBooking)

const newsButtonRef = ref<HTMLElement | null>(null)
onLongPress(newsButtonRef, showDeviceToken, { delay: 1000 })
</script>

<style>
ion-tab-button {
  /* Prevents long-press from selecting text */
  user-select: none;
  --user-select: none;
}
</style>