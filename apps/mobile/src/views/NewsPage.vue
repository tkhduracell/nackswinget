<!-- eslint-disable vue/no-v-text-v-html-on-component -->
<template>
  <ion-page>
    <nsw-toolbar />
    <ion-content :fullscreen="true" class="ion-padding nsw-page">
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <h1 class="page-title">Nyheter</h1>

      <ion-card v-if="subscription.isDenied">
        <ion-card-header>
          <ion-card-title>Notiser</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>Du har valt att inte tillåta notifiktioner.</p>
          <p>Du kan ändra detta under Inställningar &gt; Nackswinget &gt; Notiser.</p>
        </ion-card-content>
      </ion-card>

      <ion-card v-if="subscription.isSubscribed">
        <ion-card-header>
          <ion-card-title>Notiser</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>Du bevakar nyheter på denna enhet.</p>
          <ion-button @click="unsubscribe">
            <ion-spinner slot="icon-only" name="circles" v-if="subscription.isLoading"></ion-spinner>
            <span v-if="!subscription.isLoading">Avsluta notiser</span>
          </ion-button>
        </ion-card-content>
      </ion-card>

      <ion-card class="banner" v-if="subscription.isSupported && !subscription.isSubscribed && !subscription.isDismissed">
        <ion-card-header>
          <ion-card-title class="card-title-sm">Vill du få notiser?</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>Du kan bevaka nyheter och få notiser.</p>
          <ion-button @click="subscribe" fill="solid">
            <ion-spinner slot="icon-only" name="circles" v-if="subscription.isLoading"></ion-spinner>
            <span v-if="!subscription.isLoading">Få notiser</span>
          </ion-button>
          <ion-button @click="subscription.isDismissed = true" fill="clear" size="small">Nej tack</ion-button>
        </ion-card-content>
      </ion-card>

      <ion-card v-if="subscription.error">
        <ion-card-header>
          <ion-card-title>Ett fel inträffade</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>Kunde ej ladda prenumeration.</p>
          <ion-label v-if="isDev">{{ subscription.error }}</ion-label>
        </ion-card-content>
      </ion-card>

      <ion-card v-if="error">
        <ion-card-header>
          <ion-card-title>Ett fel inträffade</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <p>Kunde ej ladda nyheter</p>
          <ion-label v-if="'code' in error">
            <pre>
              {{ isDev ? JSON.stringify((error as AxiosError).toJSON(), null, 2) : `Felkod: ${error.code} - ${error.message}` }}
            </pre>
          </ion-label>
          <ion-label v-else>
            {{ error }}
          </ion-label>
        </ion-card-content>
      </ion-card>

      <ion-card v-if="isFetching">
        <ion-grid>
          <ion-row class="ion-justify-content-center">
            <ion-col size="auto">
              <ion-spinner name="dots" color="danger" class="big"></ion-spinner>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card>

      <ion-card v-for="item in (news?.items ?? [])" :key="item.id" :href="item.link" target="_blank"
        :class="{ 'toasted': isToasted(item.id) }" :id="item.id" :ref="(el) => { scrollIfToasted(el as any, item.id) }">
        <img :src="item.media.thumbnail.url" v-if="item.media?.thumbnail?.url" class="w-100" />
        <ion-card-header>
          <ion-card-title v-html="item.title"></ion-card-title>
          <ion-card-subtitle>
            <span class="text-bold">
              Publicerad:
            </span>
            <span>
              {{ titleCase(format(item.published, 'EEEE d MMMM yyyy, HH:mm', { locale: sv })) }}
            </span>
          </ion-card-subtitle>
        </ion-card-header>

        <ion-card-content v-html="item.description">
        </ion-card-content>
      </ion-card>
    </ion-content>
  </ion-page>
</template>

<style scoped>
ion-spinner.big {
  width: 100px;
  height: 100px;
}

ion-card.toasted {
  animation: tilt-shaking 0.5s 6 ease-in-out;
}

.w-100 {
  width: 100%;
}
</style>
<script setup lang="ts">
import {
  IonPage, IonContent,
  IonRow, IonLabel, IonCard, IonCardContent, IonCardHeader,
  IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonSpinner,
  IonRefresher, IonRefresherContent, IonButton
} from '@ionic/vue';
import NswToolbar from '@/components/NswToolbar.vue';

import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useNews } from '@/compsables/news';
import { useSubscription } from '@/compsables/subscription';
import { useRouter } from 'vue-router';
import { Toast } from '@capacitor/toast';
import { PushNotifications } from '@capacitor/push-notifications';
import { useAppMode, useToast } from '@/compsables/common';
import { AxiosError } from 'axios';

const router = useRouter()
const { isDev } = useAppMode()
const { toast, toasted } = useToast()
const { data: news, error, isFetching, execute } = useNews()
const { data: subscription, unsubscribe, subscribe } = useSubscription('news-nackswinget.se')

const handleRefresh = (event: { target: { complete: () => void } }) => {
  execute()
    .finally(() => event.target.complete())
};

const titleCase = (str: string): string =>
  str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

function onLaunch(topic: string, subject_id: string, display = false) {
  if (display) Toast.show({ text: `News: ${topic}, Post: ${subject_id}` });
  router.push({ name: 'News' })
    .then(() => setTimeout(() => toast(subject_id), 300))
}

PushNotifications.addListener('pushNotificationReceived', (notification) => {
  console.log('Push received', notification.data)
  const { nsw_topic, nsw_subject_id } = notification.data;
  if (nsw_topic && nsw_subject_id) {
    if (nsw_topic.startsWith('news')) {
      onLaunch(nsw_topic, nsw_subject_id, true);
    }
  } else {
    Toast.show({ text: `Invalid notification: ${JSON.stringify(notification.data)}` });
  }
}).catch(() => console.warn("Failed to register pushNotificationReceived listener"));

PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
  console.log('Push action', notification.notification.data);
  const { nsw_topic, nsw_subject_id } = notification.notification.data;
  if (nsw_topic && nsw_subject_id) {
    if (nsw_topic.startsWith('news')) {
      onLaunch(nsw_topic, nsw_subject_id);
    }
  }
}).catch(() => console.warn("Failed to register pushNotificationActionPerformed listener"));

const isToasted = (id: string) => toasted.value == id

function scrollIfToasted(elm: InstanceType<typeof IonCard>, id: string) {
  if (isToasted(id)) {
    const e = elm.$el
    setTimeout(() => {
      console.log('Scrolling to', id)
      e.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 1000);
  }
}
</script>
