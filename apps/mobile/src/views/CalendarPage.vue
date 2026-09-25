<template>
  <ion-page>
    <nsw-toolbar />
    <ion-content :fullscreen="true" class="ion-padding nsw-page">
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <h1 class="page-title">Kalender</h1>

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
          <p>Du bevakar öppna träningar på denna enhet.</p>
          <ion-button @click="unsubscribe" fill="solid">
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
          <p>Du kan bevaka öppna träningar och få notiser när någon bokar ny träning. Detta genom att trycka på knappen
            nedan och godkänna notifiktioner.</p>
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
          <p>Kunde ej ladda kalender</p>
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

      <ion-card v-if="isLoading">
        <ion-grid>
          <ion-row class="ion-justify-content-center">
            <ion-col size="auto">
              <ion-spinner name="dots" color="danger" class="big"></ion-spinner>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card>

      <ion-card v-for="day in agenda" :key="day.date">
        <ion-card-header>
          <ion-card-title>{{ day.name }}</ion-card-title>
          <ion-card-subtitle>{{ day.date }}</ion-card-subtitle>
        </ion-card-header>

        <ion-card-content>
          <ion-list lines="full">
            <ion-item v-if="day.events.length === 0">
              <ion-label>
                <h2>Inga träningar denna dag</h2>
              </ion-label>
            </ion-item>
            <ion-item v-for="event in day.events" :data-calendar="event.calendarId" :key="event.id"
              :class="{ 'toasted': `${event.id}` === toasted }" :id="event.id"
              :ref="(el) => { scrollIfToasted(el as any, event.id) }">
              <ion-grid>
                <ion-row>
                  <ion-col size="auto">
                    <ion-label style="display: flex; flex-direction: column;">
                      <div>{{ event.startTime }}</div>
                      <ion-icon style="margin-left: auto; margin-right: auto;" :icon="caretDownOutline"></ion-icon>
                      <div>{{ event.endTime }}</div>
                    </ion-label>
                  </ion-col>
                  <ion-col class="ion-align-self-center">
                    <ion-label>
                      <h2>
                        {{ event.name }} ({{ event.duration }} minuter)
                      </h2>
                      <h3 v-if="event.description" v-html="event.description"></h3>
                    </ion-label>
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>
      <ion-button fill="clear" size="small" v-if="subscription.isDismissed" @click="subscription.isDismissed = false">
        Vill du ha notifiktioner?
      </ion-button>
    </ion-content>
  </ion-page>
</template>
<style scoped>
@media (prefers-color-scheme: dark) {
  ion-item[data-calendar] {
    color: var(--ion-text-color);
  }

  ion-item[data-calendar="333892"] {
    --background: rgba(247, 186, 121, 0.9);
  }

  ion-item[data-calendar="358979"] {
    --background: rgba(252, 113, 132, 0.9);
  }
}

ion-item[data-calendar] {
  --border-radius: 6px;
  margin-bottom: 3px;
  color: var(--ion-color-dark);
}

ion-item[data-calendar] p.div {
  margin: 0;
  line-height: 0.6em;
  font-size: 0.6em;
}

/* Huvud */
ion-item[data-calendar="333077"] {
  --background: rgba(128, 0, 128, 0.9);
}

/* Kurs */
ion-item[data-calendar="333892"] {
  --background: rgba(244, 153, 56, 0.9);
}

/* Öppen Träning */
ion-item[data-calendar="337667"] {
  --background: rgba(0, 128, 0, 0.9);
}

/* Tävling */
ion-item[data-calendar="358978"] {
  --background: rgba(41, 128, 185, 0.9);
}

/* Eventkalender */
ion-item[data-calendar="358979"] {
  --background: rgba(255, 70, 94, 0.9);
}

ion-item[data-calendar] {
  --padding-start: 8px;
  --inner-padding-end: 8px;
}

ion-item[data-calendar] ion-grid {
  padding: 0;
}

ion-item[data-calendar] ion-col {
  padding: 4px;
}

ion-item[data-calendar] ion-col[size="auto"] ion-label {
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

ion-item[data-calendar] h2 {
  font-size: 0.95rem;
  font-weight: 600;
}

ion-item[data-calendar] h3 {
  font-size: 0.8rem;
  opacity: 0.85;
}

ion-item.toasted {
  animation: tilt-shaking 0.5s 4 ease-in-out;
  position: relative;
  z-index: 1000;
}

ion-spinner.big {
  width: 100px;
  height: 100px;
}
</style>
<script setup lang="ts">
import {
  IonPage, IonContent, IonButton,
  IonRow, IonList, IonItem, IonLabel, IonCard, IonCardContent, IonCardHeader,
  IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonIcon, IonSpinner,
  IonRefresher, IonRefresherContent
} from '@ionic/vue';
import NswToolbar from '@/components/NswToolbar.vue';

import { caretDownOutline } from 'ionicons/icons'
import { useAgenda } from '@/compsables/agenda';
import { useSubscription } from '@/compsables/subscription';
import { useRouter } from 'vue-router';
import { Toast } from '@capacitor/toast';
import { PushNotifications } from '@capacitor/push-notifications';
import { useAppMode, useToast } from '@/compsables/common';
import { AxiosError } from 'axios';

const router = useRouter()
const { isDev } = useAppMode()
const { toast, toasted } = useToast()
const { data: agenda, error, execute, isLoading } = useAgenda()
const { data: subscription, unsubscribe, subscribe } = useSubscription('calendar-337667')

const handleRefresh = (event: { target: { complete: () => void } }) => {
  execute()
    .catch((e) => console.error('Failed to refresh', e))
    .finally(() => event.target.complete())
};

function onLaunch(topic: string, subject_id: string, display = false) {
  if (display) Toast.show({ text: `Calendar: ${topic}, Event: ${subject_id}` });
  router.push({ name: 'Calendar' })
    .then(() => setTimeout(() => toast(subject_id), 300))
}

PushNotifications.addListener('pushNotificationReceived', (notification) => {
  console.log('Push received', notification.data)
  const { nsw_topic, nsw_subject_id } = notification.data;
  if (nsw_topic && nsw_subject_id) {
    if (nsw_topic.startsWith('calendar')) {
      onLaunch(nsw_topic, nsw_subject_id, true);
    }
  } else {
    Toast.show({ text: `Invalid notification: ${JSON.stringify(notification)}` });
  }
}).catch(() => console.warn("Failed to register pushNotificationReceived listener"));

PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
  console.log('Push action', notification.notification.data);
  const { nsw_topic, nsw_subject_id } = notification.notification.data;
  if (nsw_topic && nsw_subject_id) {
    if (nsw_topic.startsWith('calendar')) {
      onLaunch(nsw_topic, nsw_subject_id);
    }
  } else {
    Toast.show({ text: `Invalid notification: ${JSON.stringify(notification.notification)}` });
  }
}).catch(() => console.warn("Failed to register pushNotificationActionPerformed listener"));

function scrollIfToasted(elm: InstanceType<typeof IonCard>, id: number) {
  if (toasted.value == id + '') {
    const e = elm.$el
    console.log('Scrolling to', id, 'in 1 sec & 2 secs')
    setTimeout(() => {
      e.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 1000);
    setTimeout(() => {
      e.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 2000);
  }
}

</script>
